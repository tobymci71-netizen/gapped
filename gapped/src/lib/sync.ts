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
import * as wal from '@/drive/wal';
import { Fix } from '@/drive/types';

function pointWkt(f: Fix): string {
  return `POINT(${f.lon} ${f.lat})`;
}

const FIX_BATCH = 500;

export async function syncFinalizedDrives(): Promise<{ uploaded: number; failed: number }> {
  if (!supabase) return { uploaded: 0, failed: 0 };
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { uploaded: 0, failed: 0 };

  let uploaded = 0;
  let failed = 0;

  for (const drive of wal.listUnsynced()) {
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
        const batch = fixes.slice(i, i + FIX_BATCH).map((f) => ({
          drive_id: drive.id,
          t: new Date(f.t).toISOString(),
          point: pointWkt(f),
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

      // Fire server-side verification; failure here is not fatal — the server
      // can re-verify any pending drive later.
      await supabase.functions
        .invoke('verify-drive', { body: { drive_id: drive.id } })
        .catch(() => undefined);

      wal.markSynced(drive.id);
      uploaded++;
    } catch {
      failed++;
    }
  }
  return { uploaded, failed };
}
