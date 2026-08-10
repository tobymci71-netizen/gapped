/**
 * Upload finalized drives to Supabase, then ask the server to verify.
 *
 * Server is the authority: the client's summary values are inserted as
 * advisory placeholders (verification stays 'pending'); the verify-drive
 * Edge Function recomputes everything from the raw fix array with the
 * service role and is the only thing that can move verification state or
 * write leaderboard entries.
 */

import { supabase } from './supabase';
import { attestationFor } from './attestation';
import * as wal from '@/drive/wal';
import { Fix } from '@/drive/types';
import { useProfile } from '@/state/profile';

const FIX_BATCH = 500;

/**
 * Push the local profile and its vehicle up before any drive references them.
 *
 * A profiles row is created by a trigger on signup (migration 0002) but starts
 * empty — the app is anonymous-first and onboarding collects username and
 * country afterwards. drives.profile_id and drives.vehicle_id are foreign
 * keys, so without this a drive upload fails outright.
 */
async function pushIdentity(userId: string): Promise<void> {
  if (!supabase) return;
  const p = useProfile.getState();

  await supabase
    .from('profiles')
    .update({
      // Only overwrite with values we actually have; a half-finished
      // onboarding must not blank out a username already on the server.
      ...(p.username ? { username: p.username } : {}),
      ...(p.country ? { country: p.country } : {}),
      unit_pref: p.unitPref,
    })
    .eq('id', userId);

  if (p.vehicleId && p.vehicleKind && p.vehicleMake && p.vehicleModel) {
    // Specs stay null until vPIC matching fills them in; verify-drive then
    // brackets the drive as open class rather than guessing a power-to-weight.
    await supabase.from('vehicles').upsert(
      {
        id: p.vehicleId,
        profile_id: userId,
        kind: p.vehicleKind,
        make: p.vehicleMake,
        model: p.vehicleModel,
        is_primary: true,
      },
      { onConflict: 'id' },
    );
  }
}

export async function syncFinalizedDrives(): Promise<{ uploaded: number; failed: number }> {
  if (!supabase) return { uploaded: 0, failed: 0 };
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { uploaded: 0, failed: 0 };

  const unsynced = wal.listUnsynced();
  if (unsynced.length === 0) return { uploaded: 0, failed: 0 };

  try {
    await pushIdentity(userId);
  } catch {
    // Nothing can reference a profile that failed to save; retry next launch
    // rather than burn attempts on drives that are certain to be rejected.
    return { uploaded: 0, failed: unsynced.length };
  }

  let uploaded = 0;
  let failed = 0;

  for (const drive of unsynced) {
    const s = drive.summary;
    if (!s) continue;
    const fixes = wal.readFixes(drive.id);
    if (fixes.length < 2) continue;

    try {
      const { error: driveErr } = await supabase.from('drives').insert({
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
      });
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
        const { error: fixErr } = await supabase.from('drive_fixes').insert(batch);
        if (fixErr) throw fixErr;
      }

      // Attest the device that produced this drive, where the platform can.
      // Null on simulators, in Expo Go, and on devices without the native
      // module — the server records that as unattested, not as fraud.
      const attestation = await attestationFor(drive.id);

      // Fire server-side verification; failure here is not fatal — the server
      // can re-verify any pending drive later.
      await supabase.functions
        .invoke('verify-drive', {
          body: { drive_id: drive.id, ...(attestation ? { attestation } : {}) },
        })
        .catch(() => undefined);

      wal.markSynced(drive.id);
      uploaded++;
    } catch {
      failed++;
    }
  }
  return { uploaded, failed };
}
