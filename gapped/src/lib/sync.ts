/**
 * Upload finalized drives to Supabase, then ask the server to verify.
 *
 * Server is the authority: the client's summary values are inserted as
 * advisory placeholders (verification stays 'pending'); the verify-drive
 * Edge Function recomputes everything from the raw fix array with the
 * service role and is the only thing that can move verification state or
 * write leaderboard entries.
 *
 * supabase-js reports failures by RETURNING `{ error }`, not by throwing. Every
 * write below checks it. Several used not to, which is how a vehicles upsert
 * that Postgres refused on every call, and a username another driver already
 * held, both went unnoticed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureUserId, supabase } from './supabase';
import { attestationFor } from './attestation';
import * as wal from '@/drive/wal';
import { Fix } from '@/drive/types';
import { useProfile } from '@/state/profile';

const FIX_BATCH = 500;

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

export type SyncResult = { uploaded: number; failed: number };

/**
 * The identity the server last accepted in this process, so the startup sync,
 * every drive end and every profile change do not each re-send an unchanged
 * profile. Deliberately not persisted: one redundant push per launch is cheap,
 * and it is what lets a taken username be retried once its holder lets it go.
 */
let lastPushed: string | null = null;

/**
 * Set when the version gate blocks this build; never cleared in the process.
 *
 * The root layout already holds back the recorder and its own sync calls until
 * the gate answers, but the gate can answer late (it is not awaited past a few
 * seconds), and the recorder calls syncFinalizedDrives itself when a drive
 * ends. A build blocked because of what it records must not go on uploading
 * it behind the Update Required screen, so the stop lives here, where every
 * upload path passes.
 */
let halted = false;

/** Stop every upload for the rest of this process. See `halted`. */
export function haltSync(): void {
  halted = true;
}

/**
 * Push the local profile and its vehicle up before anything references them.
 *
 * A profiles row is created by a trigger on signup (migration 0002) but starts
 * empty — the app is anonymous-first and onboarding collects username and
 * country afterwards. drives.profile_id and drives.vehicle_id are foreign
 * keys, so without this a drive upload fails outright; decode-vin looks the
 * vehicle up by id, and add_friend looks the driver up by username.
 *
 * Throws when something other than a taken username fails.
 */
async function pushIdentity(client: SupabaseClient, userId: string): Promise<void> {
  const p = useProfile.getState();
  const fingerprint = JSON.stringify([
    userId,
    p.username,
    p.country,
    p.unitPref,
    p.vehicleId,
    p.vehicleKind,
    p.vehicleMake,
    p.vehicleModel,
  ]);
  if (fingerprint === lastPushed) return;

  // Country and units go first and on their own. They used to share one UPDATE
  // with the username, so a taken username (a unique violation rolls back the
  // whole statement) cost the country too — and verify-drive leaves a profile
  // with no country off its national board, silently, for every run.
  const { error: profileErr } = await client
    .from('profiles')
    .update({
      // No canonicalisation needed here: useProfile.country is typed
      // CountryCode, which only canonicaliseCountry can produce, and the
      // store's persist `merge` re-canonicalises on every rehydration. This
      // is the constrained source verify-drive reads back out of profiles.
      // Only sent when known; a half-finished onboarding must not blank out a
      // value already on the server.
      ...(p.country ? { country: p.country } : {}),
      unit_pref: p.unitPref,
    })
    .eq('id', userId);
  if (profileErr) throw profileErr;

  if (p.username) {
    const { error: nameErr } = await client
      .from('profiles')
      .update({ username: p.username })
      .eq('id', userId);
    if (nameErr && nameErr.code !== UNIQUE_VIOLATION) throw nameErr;
    // On a clash another driver holds the name. Drives still upload — the
    // name is not part of any key — and the You tab asks for another. The
    // verdict is recorded either way, because the flag is persisted: a name
    // refused at one launch and accepted at a later one must not go on being
    // reported as taken. Only if the name is still the current one, though —
    // the user may have picked a new one while this request was in flight.
    if (useProfile.getState().username === p.username) {
      useProfile.getState().setUsernameTaken(nameErr != null);
    }
  }

  if (p.vehicleId && p.vehicleKind && p.vehicleMake && p.vehicleModel) {
    // Specs stay null until a VIN is decoded; verify-drive then brackets the
    // drive as open class rather than guessing a power-to-weight.
    //
    // ignoreDuplicates (ON CONFLICT DO NOTHING) is load-bearing. A merging
    // upsert compiles to ON CONFLICT DO UPDATE SET id, profile_id, kind, …,
    // and Postgres demands UPDATE privilege on every one of those columns even
    // when nothing conflicts. 0009 grants UPDATE on make/model/year/
    // is_modified/photo_url/is_primary only, so the merge was refused (42501)
    // on every call, and — unchecked — no vehicles row was ever created. Doing
    // nothing on conflict is also what an existing row needs: an id is minted
    // per make/model (profile.ts), and decode-vin writes the decoded make and
    // model over the onboarding pick, which must not be put back.
    const { error: vehicleErr } = await client.from('vehicles').upsert(
      {
        id: p.vehicleId,
        profile_id: userId,
        kind: p.vehicleKind,
        make: p.vehicleMake,
        model: p.vehicleModel,
        is_primary: true,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (vehicleErr) throw vehicleErr;
  }

  lastPushed = fingerprint;
}

/**
 * Push the profile and vehicle whether or not a drive is waiting.
 *
 * Used to happen only as a side effect of uploading a drive, so until a new
 * user's first drive synced the server had no vehicles row (Decode VIN failed
 * with "vehicle not found") and no username (nobody could add them as a
 * friend). Called when onboarding completes or the profile changes, at
 * startup via syncFinalizedDrives, and by Garage before it decodes a VIN.
 *
 * Resolves false when there is no session or the push failed. Never throws.
 */
export async function syncIdentity(): Promise<boolean> {
  const client = supabase;
  if (!client || halted) return false;
  const userId = await ensureUserId();
  if (!userId) return false;
  try {
    await pushIdentity(client, userId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether `name` is free for this user. Null when it could not be checked
 * (no backend, offline) — the caller decides what an unknown means.
 *
 * Usernames are public (profiles is world-readable for the boards), so a plain
 * select answers it; no RPC needed. The user's own row counts as free, so
 * re-confirming the name you already hold is not reported as a clash.
 */
export async function isUsernameAvailable(name: string): Promise<boolean | null> {
  const client = supabase;
  if (!client) return null;
  const userId = await ensureUserId();
  const { data, error } = await client
    .from('profiles')
    .select('id')
    .eq('username', name)
    .limit(1);
  if (error || !data) return null;
  return data.every((row: { id: string }) => row.id === userId);
}

/**
 * Whether a failed verify-drive call is worth trying again later.
 *
 * No HTTP status means no answer at all (offline, relay failure); 5xx, 408 and
 * 429 mean the server could not do it now.
 *
 * 401 and 403 are about the caller, not the drive: the gateway refusing the
 * access token, or verify-drive failing to match it to the drive's owner. This
 * same session inserted the drive and its fixes moments earlier under RLS, so a
 * refusal here is an expired or refreshed-away token, or an auth lookup that
 * failed — which the next attempt gets past. Marking the drive synced on it left
 * the drive unverified for good, since nothing else ever asks again.
 *
 * Any other 4xx (a malformed request, a drive the server no longer has) is an
 * answer about this drive — retrying it on every launch would never change it.
 */
export function verifyFailureIsTransient(error: unknown): boolean {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  if (typeof status !== 'number') return true;
  return (
    status === 401 || status === 403 || status === 408 || status === 429 || status >= 500
  );
}

let running: Promise<SyncResult> | null = null;
let again = false;

/**
 * Single-flight, with one trailing pass. Cold start, the return to the
 * foreground and the end of a drive can all fire at once, and two passes over
 * the same unsynced drive would race each other's inserts. A call that lands
 * mid-pass asks for one more pass rather than joining the current one, which
 * listed its drives before the newly finished one existed.
 */
export function syncFinalizedDrives(): Promise<SyncResult> {
  if (halted) return Promise.resolve({ uploaded: 0, failed: 0 });
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let result: SyncResult;
    do {
      again = false;
      result = await syncOnce();
    } while (again);
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

async function syncOnce(): Promise<SyncResult> {
  const client = supabase;
  if (!client || halted) return { uploaded: 0, failed: 0 };
  const userId = await ensureUserId();
  if (!userId) return { uploaded: 0, failed: 0 };

  // Ahead of the "nothing to upload" return, not behind it: see syncIdentity.
  try {
    await pushIdentity(client, userId);
  } catch {
    // Nothing can reference a profile that failed to save; retry next time
    // rather than burn attempts on drives that are certain to be rejected.
    return { uploaded: 0, failed: wal.listUnsynced().length };
  }

  const unsynced = wal.listUnsynced();
  if (unsynced.length === 0) return { uploaded: 0, failed: 0 };

  let uploaded = 0;
  let failed = 0;

  for (const drive of unsynced) {
    // A block that lands mid-pass stops the pass at the next drive.
    if (halted) break;
    const s = drive.summary;
    if (!s) continue;
    const fixes = wal.readFixes(drive.id);
    if (fixes.length < 2) continue;

    // Every write is idempotent (ON CONFLICT DO NOTHING), because an upload
    // can stop anywhere: a lost signal or a suspended app between fix batches,
    // or a commit whose response never arrived. The retry used to start with a
    // plain insert of the same drive id, hit the primary key, and give up
    // before reaching the missing fixes — so the drive was never verified, on
    // any launch, ever. Only INSERT privilege is needed for DO NOTHING, which
    // is all `authenticated` has on drives and fixes.
    try {
      const { error: driveErr } = await client.from('drives').upsert(
        {
          id: drive.id,
          profile_id: userId,
          vehicle_id: drive.vehicleId,
          started_at: new Date(s.startedAt).toISOString(),
          ended_at: new Date(s.endedAt).toISOString(),
          // Advisory only — server recomputes from fixes and overwrites.
          distance_m: s.distanceM,
          duration_s: s.durationS,
          max_speed_ms: s.maxSpeedMs,
          avg_speed_ms: s.avgSpeedMs,
          max_g: s.maxG,
          avg_g: s.avgG,
          zero_to_60_s: s.zeroTo60S,
          verification: 'pending',
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (driveErr) throw driveErr;

      for (let i = 0; i < fixes.length; i += FIX_BATCH) {
        const batch = fixes.slice(i, i + FIX_BATCH).map((f: Fix) => ({
          drive_id: drive.id,
          t: new Date(f.t).toISOString(),
          // lat/lon, not a PostGIS point: `point` is a generated column now.
          // Sending WKT meant the server read coordinates back as WKB hex and
          // silently re-derived every drive from (0, 0) — see migration 0003.
          lat: f.lat,
          lon: f.lon,
          speed_ms: f.speedMs,
          accuracy_m: f.accuracyM,
          altitude_m: f.altitudeM ?? null,
          heading: f.heading ?? null,
          accel_x: f.accelX ?? null,
          accel_y: f.accelY ?? null,
          accel_z: f.accelZ ?? null,
          pressure_hpa: f.pressureHpa ?? null,
          is_mock: f.isMock ?? false,
        }));
        const { error: fixErr } = await client
          .from('drive_fixes')
          .upsert(batch, { onConflict: 'drive_id,t', ignoreDuplicates: true });
        if (fixErr) throw fixErr;
      }

      // Attest the device that produced this drive, where the platform can.
      // Null on simulators, in Expo Go, and on devices without the native
      // module — the server records that as unattested, not as fraud.
      const attestation = await attestationFor(drive.id);

      // Only the client ever asks for verification — there is no server-side
      // sweep of pending drives — so a drive whose verify call could not get
      // through stays unsynced and is offered again next time. Re-uploading it
      // is harmless now that every write above is idempotent, and
      // re-verification is idempotent server-side (verify:roundtrip §6).
      const { error: verifyErr } = await client.functions.invoke('verify-drive', {
        body: { drive_id: drive.id, ...(attestation ? { attestation } : {}) },
      });
      if (verifyErr && verifyFailureIsTransient(verifyErr)) throw verifyErr;

      wal.markSynced(drive.id);
      uploaded++;
    } catch {
      failed++;
    }
  }
  return { uploaded, failed };
}

/** Test seam: forget this process's sync state (pushed identity, pass, halt). */
export function __resetSyncStateForTests(): void {
  lastPushed = null;
  running = null;
  again = false;
  halted = false;
}
