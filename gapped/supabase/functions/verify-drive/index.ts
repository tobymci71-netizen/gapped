/**
 * verify-drive — the server-side authority (spec Phase 3, items 3–4, 6).
 *
 * Recomputes every derived value from the raw fix array, runs the
 * plausibility envelope, sets verification state, builds the privacy-trimmed
 * route, and writes leaderboard entries. The client's numbers are a UI
 * convenience; nothing the client sent is trusted here.
 *
 * Runs with the service role (bypasses RLS) — deploy with:
 *   supabase functions deploy verify-drive
 * Secrets needed: TRIM_SALT (server-side route-trim salt).
 *
 * Not yet wired (deliberate, needs store credentials): App Attest /
 * Play Integrity attestation — slot its check in before plausibility.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { summarize } from '../_shared/stats.ts';
import { checkPlausibility } from '../_shared/plausibility.ts';
import { trimRouteForSharing } from '../_shared/privacy.ts';
import type { Fix } from '../_shared/types.ts';

type FixRow = {
  t: string;
  point: { coordinates: [number, number] } | string;
  speed_ms: number | null;
  accuracy_m: number | null;
  altitude_m: number | null;
  heading: number | null;
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  pressure_hpa: number | null;
  is_mock: boolean;
};

function rowToFix(r: FixRow): Fix {
  let lat = 0;
  let lon = 0;
  if (typeof r.point === 'object' && r.point?.coordinates) {
    [lon, lat] = r.point.coordinates;
  } else if (typeof r.point === 'string') {
    // WKT / WKB-hex fallback: request GeoJSON via select cast below instead
    const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(r.point);
    if (m) {
      lon = parseFloat(m[1]);
      lat = parseFloat(m[2]);
    }
  }
  return {
    t: Date.parse(r.t),
    lat,
    lon,
    speedMs: r.speed_ms,
    accuracyM: r.accuracy_m,
    altitudeM: r.altitude_m,
    heading: r.heading,
    accelX: r.accel_x,
    accelY: r.accel_y,
    accelZ: r.accel_z,
    pressureHpa: r.pressure_hpa,
    isMock: r.is_mock,
  };
}

function lineStringWkt(fixes: Fix[]): string | null {
  if (fixes.length < 2) return null;
  return `LINESTRING(${fixes.map((f) => `${f.lon} ${f.lat}`).join(',')})`;
}

Deno.serve(async (req) => {
  const { drive_id } = await req.json().catch(() => ({}));
  if (!drive_id) {
    return new Response(JSON.stringify({ error: 'drive_id required' }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: drive, error: driveErr } = await supabase
    .from('drives')
    .select('id, profile_id, vehicle_id, started_at')
    .eq('id', drive_id)
    .single();
  if (driveErr || !drive) {
    return new Response(JSON.stringify({ error: 'drive not found' }), { status: 404 });
  }

  const { data: fixRows, error: fixErr } = await supabase
    .from('drive_fixes')
    .select(
      't, point, speed_ms, accuracy_m, altitude_m, heading, accel_x, accel_y, accel_z, pressure_hpa, is_mock',
    )
    .eq('drive_id', drive_id)
    .order('t');
  if (fixErr || !fixRows || fixRows.length < 2) {
    await supabase
      .from('drives')
      .update({
        verification: 'rejected',
        verification_meta: { reason: 'insufficient fixes' },
      })
      .eq('id', drive_id);
    return new Response(JSON.stringify({ verification: 'rejected' }), { status: 200 });
  }

  const fixes = (fixRows as FixRow[]).map(rowToFix);

  // 1. Server-side re-derivation — the only numbers that count.
  const summary = summarize(fixes);

  // 2. Plausibility envelope. Never silently drop: the meta records exactly
  //    which checks ran and which failed, and the client shows it to the user.
  const report = checkPlausibility(fixes);
  const verification = report.verdict === 'plausible' ? 'verified' : 'unverified';

  // 3. Privacy-trimmed route for anything public; full route stays server-side.
  const salt = Deno.env.get('TRIM_SALT') ?? 'gapped-default-trim-salt';
  const trimmed = trimRouteForSharing(fixes, salt, drive_id);

  const { error: updateErr } = await supabase
    .from('drives')
    .update({
      distance_m: summary.distanceM,
      duration_s: summary.durationS,
      max_speed_ms: summary.maxSpeedMs,
      avg_speed_ms: summary.avgSpeedMs,
      max_g: summary.maxG,
      avg_g: summary.avgG,
      zero_to_60_s: summary.zeroTo60S,
      route: lineStringWkt(trimmed),
      route_full: lineStringWkt(fixes),
      verification,
      verification_meta: { checks: report.checks, recomputed: true },
    })
    .eq('id', drive_id);
  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  // 4. Leaderboard entries — denormalised, written only here.
  const { data: profile } = await supabase
    .from('profiles')
    .select('country')
    .eq('id', drive.profile_id)
    .single();

  const { data: vehicle } = drive.vehicle_id
    ? await supabase
        .from('vehicles')
        .select('drivetrain, curb_weight_kg, factory_power_hp, is_modified')
        .eq('id', drive.vehicle_id)
        .single()
    : { data: null };

  // bracket key derivation mirrors src/vehicles/brackets.ts
  const pw =
    vehicle?.factory_power_hp && vehicle?.curb_weight_kg
      ? vehicle.factory_power_hp / (vehicle.curb_weight_kg / 1000)
      : null;
  const tier =
    pw == null ? 'open' : pw < 100 ? 'pw1' : pw < 170 ? 'pw2' : pw < 260 ? 'pw3' : pw < 400 ? 'pw4' : 'pw5';
  const bracketKey = `${vehicle?.drivetrain ?? 'any'}|${vehicle?.is_modified ? 'modified' : 'stock'}|${tier}`;

  const metrics: { metric: string; value: number | null }[] = [
    { metric: 'top_speed', value: summary.maxSpeedMs },
    { metric: 'distance', value: summary.distanceM },
    { metric: 'zero_to_60', value: summary.zeroTo60S },
  ];
  const scopes: { scope: string; country: string | null }[] = [
    { scope: 'global', country: null },
    ...(profile?.country ? [{ scope: 'country', country: profile.country }] : []),
  ];
  const periods = ['day', 'week', 'month', 'all'];

  const entries = [];
  for (const m of metrics) {
    if (m.value == null) continue; // never fabricate a board entry
    for (const s of scopes) {
      for (const period of periods) {
        entries.push({
          drive_id,
          profile_id: drive.profile_id,
          metric: m.metric,
          value: m.value,
          scope: s.scope,
          country: s.country,
          bracket_key: bracketKey,
          period,
          verification,
          recorded_at: drive.started_at,
        });
      }
    }
  }
  if (entries.length > 0) {
    await supabase.from('leaderboard_entries').insert(entries);
  }

  return new Response(
    JSON.stringify({ verification, summary, checks: report.checks }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
