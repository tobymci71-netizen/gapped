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
import { type UsernameRejection, usernameRejection, vehicleRejected } from './username';
import * as wal from '@/drive/wal';
import { Fix } from '@/drive/types';
import { upsertOnboardingAnswers } from '@/onboarding/socialProof';
import { useProfile } from '@/state/profile';

const FIX_BATCH = 500;

export type SyncResult = { uploaded: number; failed: number };

/**
 * The identity the server last accepted in this process, so the startup sync,
 * every drive end and every profile change do not each re-send an unchanged
 * profile. Deliberately not persisted: one redundant push per launch is cheap,
 * and it is what lets a taken username be retried once its holder lets it go.
 */
let lastPushed: string | null = null;

/**
 * The onboarding answers the server last accepted in this process; see
 * pushAnswers. Kept apart from `lastPushed` because the two succeed and fail
 * independently.
 */
let lastAnswers: string | null = null;

/** The last identity write queued in this process; see `inTurn`. */
let identityTurn: Promise<unknown> = Promise.resolve();

/**
 * Runs `push` once every identity write queued before it has finished, so no
 * two overlap.
 *
 * A profile change (syncIdentity), the startup or foreground pass and
 * Garage's VIN decode can all push at once. With the main-car demotion in
 * pushIdentity, two overlapping pushes either side of a car change can each
 * demote the other's car: the old push's "every primary but the old car"
 * lands after the new push has created the new one. The driver is then left
 * with no main car on the server — counted nowhere by make_popularity — until
 * they next change car, because the upsert that makes a row primary does
 * nothing to a row that already exists. In turn, each push reads the profile
 * when it starts, so the last one sends what is current and its demotion is
 * the one that stands. The onboarding answers queue here too, for the same
 * reason: an older answer must not land after a newer one.
 */
function inTurn<T>(push: () => Promise<T>): Promise<T> {
  const turn = identityTurn.then(push);
  identityTurn = turn.catch(() => undefined);
  return turn;
}

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
 * Push the local profile and its vehicles up before anything references them:
 * the main vehicle, and any extras from the garage step.
 *
 * A profiles row is created by a trigger on signup (migration 0002) but starts
 * empty — the app is anonymous-first and onboarding collects username and
 * country afterwards. drives.profile_id and drives.vehicle_id are foreign
 * keys, so without this a drive upload fails outright; decode-vin looks the
 * vehicle up by id, and add_friend looks the driver up by username.
 *
 * Throws when something other than a refused username (taken, or not
 * allowed) fails — a refused main vehicle included, recorded as
 * vehicleRefused — except for the garage's extra vehicles and the bookkeeping
 * of which car is the main one. No drive references either, so a failure
 * there leaves the identity to be pushed again next time rather than holding
 * back the drives.
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
    p.extraVehicles,
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
    // A refusal of the name itself is a verdict, not a failure: another
    // driver holds it (23505), or the server's filter will not have it
    // (23514 'username_not_allowed'). Both are handled the same way. Thrown,
    // a refused name failed the whole identity push, which held back every
    // drive and was retried on every pass, forever, for a name that could
    // never succeed.
    if (nameErr && !usernameRejection(nameErr)) throw nameErr;
    // Drives still upload — the name is not part of any key — and the You
    // tab asks for another. The verdict is recorded either way, because the
    // flag is persisted: a name refused at one launch and accepted at a later
    // one must not go on being reported as taken. Only if the name is still
    // the current one, though — the user may have picked a new one while this
    // request was in flight.
    if (useProfile.getState().username === p.username) {
      useProfile.getState().setUsernameTaken(nameErr != null);
    }
  }

  // Whether everything below reached the server. Only then is the identity
  // recorded as pushed; otherwise the next pass sends it again.
  let settled = true;

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
    // A refusal of the row itself (23514: a make on the server's denylist, or
    // text it cannot store) is a verdict, recorded so the Garage tab can say
    // why this car's drives are not uploading — they reference a row the
    // server does not have, so they wait on this phone. It still throws: no
    // drive in this car can upload, and the next pass asks again, which is
    // what picks up the owner widening the list. The onboarding fields hold
    // a refused make back with the same list, so this is the rare make only
    // the server's longer list catches. Re-sending a row the server already
    // has is never refused (0019), so the flag cannot stick on an old car.
    // Only recorded for the car this push sent, as for the username, and only
    // on an answer: a request that got none says nothing either way.
    const refused = vehicleErr == null ? false : vehicleRejected(vehicleErr) ? true : null;
    if (refused != null && useProfile.getState().vehicleId === p.vehicleId) {
      useProfile.getState().setVehicleRefused(refused);
    }
    if (vehicleErr) throw vehicleErr;

    // One main car per driver. A new make/model is a new row (see above), and
    // the row it replaced used to stay is_primary too, so a driver who had
    // changed cars had several "main" cars on the server. The onboarding make
    // proof (make_popularity, 0017) counts each driver once, and with several
    // to choose from it can only guess — a new car not yet driven loses to
    // the old one. Demote the rest, after the new row exists so there is never
    // a moment with none. The old rows themselves stay: their drives still
    // point at them. Only safe one push at a time — see inTurn.
    const { error: demoteErr } = await client
      .from('vehicles')
      .update({ is_primary: false })
      .eq('profile_id', userId)
      .eq('is_primary', true)
      .neq('id', p.vehicleId);
    if (demoteErr) settled = false;
  }

  // The garage step's extra cars and bikes, as rows that are never the main
  // one. Same rules as the main vehicle: the id was minted locally and is the
  // row's id, and DO NOTHING on conflict leaves a row the server already has —
  // decode-vin's corrections included — exactly as it is. One statement for
  // all of them. An extra removed from the garage keeps its row: a row that is
  // not primary is counted nowhere, and Postgres refuses to delete a vehicle
  // while any drive still points at it.
  const extras = p.extraVehicles.filter((v) => v.id && v.kind && v.make && v.model);
  if (extras.length > 0) {
    const { error: extrasErr } = await client.from('vehicles').upsert(
      extras.map((v) => ({
        id: v.id,
        profile_id: userId,
        kind: v.kind,
        make: v.make,
        model: v.model,
        is_primary: false,
      })),
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (extrasErr) settled = false;
  }

  if (settled) lastPushed = fingerprint;
}

/**
 * Send the stored onboarding answers (focus, attribution) and the time the
 * Terms were accepted to the driver's own `onboarding_answers` row, until the
 * server has them.
 *
 * The answer screens save them as they are given, but best effort: onboarding
 * never waits for that write, so a first run offline, or one whose anonymous
 * session had not been made yet, would lose them for good. The profile store
 * keeps them, and this sends whatever it holds on every sync pass — once per
 * process, and again whenever an answer changes — until a write succeeds.
 *
 * One upsert of the own row carries all three (upsertOnboardingAnswers), and
 * only what has been given is sent, so a later write can never blank an
 * earlier answer, or the record of when the Terms were accepted: the profile
 * store's `termsAcceptedAt`, set at the Terms step. A change to any of the
 * three sends them again.
 *
 * Never throws, and never holds anything else back: no other row depends on
 * the answers.
 */
async function pushAnswers(client: SupabaseClient, userId: string): Promise<void> {
  const { focus, attribution, termsAcceptedAt } = useProfile.getState();
  const fingerprint = JSON.stringify([userId, focus, attribution, termsAcceptedAt]);
  if (fingerprint === lastAnswers) return;
  if (await upsertOnboardingAnswers(client, userId, { focus, attribution, termsAcceptedAt })) {
    lastAnswers = fingerprint;
  }
}

/**
 * Push the profile and vehicle whether or not a drive is waiting.
 *
 * Used to happen only as a side effect of uploading a drive, so until a new
 * user's first drive synced the server had no vehicles row (Decode VIN failed
 * with "vehicle not found") and no username (nobody could add them as a
 * friend). Called when onboarding completes or the profile changes, at
 * startup via syncFinalizedDrives, and by Garage before it decodes a VIN.
 * The stored onboarding answers ride along (pushAnswers).
 *
 * Resolves false when there is no session or the identity push failed — the
 * answers do not affect it. Never throws.
 */
export async function syncIdentity(): Promise<boolean> {
  const client = supabase;
  if (!client || halted) return false;
  const userId = await ensureUserId();
  if (!userId) return false;
  let pushed = true;
  try {
    await inTurn(() => pushIdentity(client, userId));
  } catch {
    pushed = false;
  }
  await inTurn(() => pushAnswers(client, userId));
  return pushed;
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
 * What became of a username change: 'saved', refused by the server ('taken',
 * 'not_allowed'), or 'failed' — no answer, so nothing was changed anywhere.
 */
export type UsernameChange = 'saved' | UsernameRejection | 'failed';

/**
 * Change the username now and report the server's verdict, for the screen
 * where a driver renames themselves (app/edit-username.tsx).
 *
 * The opposite order to onboarding. There the name is kept locally first and
 * the server is told later, because nobody can be held up on a first run with
 * no signal; a late refusal surfaces on the You tab. A rename has a working
 * name to fall back on, so the server is asked first and the profile store
 * changes only once it has said yes: a refused or unsent rename leaves the
 * old name in place on both sides, rather than a new name on this phone that
 * the boards never show.
 *
 * Queued with the identity pushes (inTurn), so a push already under way with
 * the old name cannot land after this one. The store change then sets off the
 * root layout's own push, which sends the same name again and clears the
 * taken flag. With no backend at all there is nobody to clash with, and the
 * name is simply kept.
 */
export async function changeUsername(name: string): Promise<UsernameChange> {
  const client = supabase;
  if (!client) {
    useProfile.getState().setUsername(name);
    return 'saved';
  }
  if (halted) return 'failed';
  const userId = await ensureUserId();
  if (!userId) return 'failed';
  return inTurn(async (): Promise<UsernameChange> => {
    try {
      const { error } = await client.from('profiles').update({ username: name }).eq('id', userId);
      if (error) return usernameRejection(error) ?? 'failed';
    } catch {
      return 'failed';
    }
    useProfile.getState().setUsername(name);
    return 'saved';
  });
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
  let identityPushed = true;
  try {
    await inTurn(() => pushIdentity(client, userId));
  } catch {
    identityPushed = false;
  }
  await inTurn(() => pushAnswers(client, userId));
  if (!identityPushed) {
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

/**
 * Test seam: forget this process's sync state (pushed identity and answers,
 * the identity queue, pass, halt).
 */
export function __resetSyncStateForTests(): void {
  lastPushed = null;
  lastAnswers = null;
  identityTurn = Promise.resolve();
  running = null;
  again = false;
  halted = false;
}
