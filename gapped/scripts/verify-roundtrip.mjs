/**
 * End-to-end check of the Supabase layer against a running local stack.
 *
 *   supabase start
 *   supabase functions serve --env-file supabase/functions/.env
 *   node scripts/verify-roundtrip.mjs
 *
 * This is a dev tool, not a unit test — it needs Docker and a live stack, so
 * it deliberately lives outside the Jest suite. It exercises the path no unit
 * test can reach: RLS, grants, foreign keys, the PostGIS round-trip, the Edge
 * Function, and the board query, against real Postgres.
 *
 * The drive it uploads is the `zeroSixtyPull` fixture from
 * src/drive/__tests__/fixtures.ts, whose ground truth is known analytically
 * (0-60 in ~5.02 s, 30 m/s top speed). Asserting the *server* reproduces those
 * numbers is what proves coordinates survived the trip — a decoding bug shows
 * up as a drive of zero distance, not as an error.
 */
import { createClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '  [32mPASS[0m' : '  [31mFAIL[0m'}  ${name}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}
const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;
const section = (s) => console.log(`\n[1m${s}[0m`);

// ── the fixture, mirroring traceFromSpeeds10Hz ──────────────────────────────
const ORIGIN = { lat: 51.5, lon: -0.12 };
const M_PER_DEG_LAT = (2 * Math.PI * 6371008.8) / 360;

/** Cruise seconds appended after the pull, at 1 Hz. */
const CRUISE_S = 450;

/**
 * The 10 Hz pull, then a 1 Hz cruise.
 *
 * The cruise is not decoration. Privacy trimming removes 1.0–1.7 miles from
 * each end of a route, so the 90 m pull on its own is trimmed away entirely
 * and correctly yields no shareable route — there would be nothing to assert
 * a polyline against. The mixed 10 Hz/1 Hz rate also matches what the recorder
 * actually produces, and 540 fixes crosses sync.ts's 500-fix batch boundary.
 *
 * Ground truth at scale s: top speed 30s m/s, distance 90s² + 30s·CRUISE_S m,
 * and a real 0-60 time only at s = 1 (at any lower scale it never reaches 60).
 */
function drive(startT, scale = 1) {
  const speeds = [];
  for (let i = 0; i < 30; i++) speeds.push(0); // 3 s standstill
  for (let i = 1; i <= 60; i++) speeds.push(Math.min(i * 0.1 * 5, 30) * scale);

  const fixes = [];
  let lat = ORIGIN.lat;
  let prevSpeed = 0;

  const push = (t, v, i) => {
    fixes.push({
      t, lat, lon: ORIGIN.lon, speedMs: v,
      accuracyM: 5 + Math.sin(i) * 1.2,
      altitudeM: 30, heading: 0,
      accelX: 0, accelY: 0.01, accelZ: 0.02,
      pressureHpa: 1013, isMock: false,
    });
  };

  for (let i = 0; i < speeds.length; i++) {
    const v = speeds[i];
    if (i > 0) lat += (((prevSpeed + v) / 2) * 0.1) / M_PER_DEG_LAT;
    const accel = i > 0 ? (v - speeds[i - 1]) / 0.1 / 9.80665 : 0;
    prevSpeed = v;
    push(startT + i * 100, v, i);
    fixes[fixes.length - 1].accelX = accel;
  }

  // Steady cruise at the speed the pull ended on — position advances to match,
  // so device speed and positional speed agree and the drive stays plausible.
  const cruiseV = 30 * scale;
  const lastT = startT + (speeds.length - 1) * 100;
  for (let i = 1; i <= CRUISE_S; i++) {
    lat += cruiseV / M_PER_DEG_LAT;
    push(lastT + i * 1000, cruiseV, i);
  }
  return fixes;
}

// ── 1. identity ─────────────────────────────────────────────────────────────
section('1. Anonymous-first identity');
const app = createClient(API, ANON_KEY, opts);
const { data: authData, error: authErr } = await app.auth.signInAnonymously();
check('anonymous sign-in succeeds', !authErr && !!authData?.user, authErr?.message);
const uid = authData.user.id;

const { data: prof } = await app.from('profiles').select('*').eq('id', uid).maybeSingle();
check('trigger auto-created the profiles row', !!prof, 'no row — drives would FK-violate');

const username = `probe_${Date.now().toString(36)}`;
const { error: profUpErr } = await app
  .from('profiles')
  .update({ username, country: 'GB', unit_pref: 'metric' })
  .eq('id', uid);
check('client can fill in its own profile', !profUpErr, profUpErr?.message);

const vehicleId = crypto.randomUUID();
const { error: vErr } = await app.from('vehicles').insert({
  id: vehicleId, profile_id: uid, kind: 'car', make: 'Toyota', model: 'GR86', is_primary: true,
});
check('client can create its vehicle', !vErr, vErr?.message);

// ── 2. upload ───────────────────────────────────────────────────────────────
section('2. Drive upload under RLS');
const fixes = drive(Date.now() - 600_000);
const driveId = crypto.randomUUID();
const { error: dErr } = await app.from('drives').insert({
  id: driveId, profile_id: uid, vehicle_id: vehicleId,
  started_at: new Date(fixes[0].t).toISOString(),
  ended_at: new Date(fixes[fixes.length - 1].t).toISOString(),
  distance_m: 0, duration_s: 9, max_speed_ms: 0, avg_speed_ms: 0, verification: 'pending',
});
check('drive insert accepted', !dErr, dErr?.message);

const { error: fErr } = await app.from('drive_fixes').insert(
  fixes.map((f) => ({
    drive_id: driveId, t: new Date(f.t).toISOString(), lat: f.lat, lon: f.lon,
    speed_ms: f.speedMs, accuracy_m: f.accuracyM, altitude_m: f.altitudeM, heading: f.heading,
    accel_x: f.accelX, accel_y: f.accelY, accel_z: f.accelZ,
    pressure_hpa: f.pressureHpa, is_mock: f.isMock,
  })),
);
check(`all ${fixes.length} fixes accepted`, !fErr, fErr?.message);

const { data: readBack } = await app
  .from('drive_fixes').select('lat, lon').eq('drive_id', driveId).order('t').limit(1);
check(
  'coordinates survive the round-trip',
  near(readBack?.[0]?.lat, ORIGIN.lat, 1e-9) && near(readBack?.[0]?.lon, ORIGIN.lon, 1e-9),
  readBack?.[0],
);

// ── 3. server-side verification ─────────────────────────────────────────────
section('3. verify-drive re-derivation');
const { data: vr, error: invokeErr } = await app.functions.invoke('verify-drive', {
  body: { drive_id: driveId },
});
check('verify-drive invoked', !invokeErr, invokeErr?.message);
check('drive verified', vr?.verification === 'verified', vr);

const { data: row } = await app
  .from('drives')
  .select(
    'distance_m, duration_s, max_speed_ms, avg_speed_ms, zero_to_60_s, route_polyline, verification, attestation, attestation_meta',
  )
  .eq('id', driveId)
  .single();

// The fixture's analytic ground truth. Had coordinates decoded to (0,0) these
// would all be ~0 while still reporting success — which is the whole point.
const EXPECTED_M = 90 + 30 * CRUISE_S;
check('server recomputed max speed = 30 m/s', near(row?.max_speed_ms, 30, 0.5), row?.max_speed_ms);
check('server recomputed 0-60 = 5.02 s', near(row?.zero_to_60_s, 5.02, 0.2), row?.zero_to_60_s);
check(`server recomputed distance = ${EXPECTED_M} m`, near(row?.distance_m, EXPECTED_M, EXPECTED_M * 0.02), row?.distance_m);
check(
  'trimmed route stored as a polyline',
  typeof row?.route_polyline === 'string' && row.route_polyline.length > 0,
  row?.route_polyline,
);

// An unattested upload is recorded as such — 'none', with a stated reason —
// and is NOT branded 'failed'. Simulators and Expo Go land here.
check('unattested drive records attestation = none', row?.attestation === 'none', row?.attestation);
check(
  'attestation records why',
  typeof row?.attestation_meta?.reason === 'string' && row.attestation_meta.reason.length > 0,
  row?.attestation_meta,
);
check(
  'an unattested drive still verifies while enforcement is off',
  row?.verification === 'verified',
  row?.verification,
);

// ── 4. privacy invariant ────────────────────────────────────────────────────
section('4. route_full never leaves the server');
// Strict on purpose: an empty result would also mean "cannot read", but it
// would mean SELECT was granted and RLS filtered the rows. The guarantee we
// want is that there is no privilege path at all, so this demands the error.
// Deployed onto a project with permissive default ACLs, the weaker version of
// this check passed while the table was in fact fully granted — see 0007.
const { data: rf, error: rfErr } = await app.from('drive_routes_private').select('*').eq('drive_id', driveId);
check(
  'client has NO privilege on the untrimmed route (not merely no rows)',
  !!rfErr && !rf?.length,
  { error: rfErr?.message ?? null, rows: rf },
);

const { error: rfWriteErr } = await app
  .from('drive_routes_private')
  .insert({ drive_id: driveId, route_full: 'LINESTRING(0 0,1 1)' });
check('client cannot write the untrimmed route', !!rfWriteErr, rfWriteErr?.message);

// ── 5. boards ───────────────────────────────────────────────────────────────
section('5. Board query');
const { data: global, error: gErr } = await app.rpc('board_top', {
  p_metric: 'top_speed', p_scope: 'global', p_period: 'all',
  p_country: null, p_verified_only: true, p_limit: 50,
});
check('global board query runs', !gErr, gErr?.message);
check('our drive appears on the global board', global?.some((r) => r.username === username), global?.slice(0, 3));

const { data: gb } = await app.rpc('board_top', {
  p_metric: 'top_speed', p_scope: 'country', p_period: 'all',
  p_country: 'GB', p_verified_only: true, p_limit: 50,
});
check('country board (GB) includes us', gb?.some((r) => r.username === username), gb?.slice(0, 3));

const { data: fr } = await app.rpc('board_top', {
  p_metric: 'top_speed', p_scope: 'country', p_period: 'all',
  p_country: 'FR', p_verified_only: true, p_limit: 50,
});
check('country board (FR) excludes us', !fr?.some((r) => r.username === username), fr?.slice(0, 3));

// One driver, one row — upload a second, slower drive and confirm the board
// shows their best, not both.
const fixes2 = drive(Date.now() - 300_000, 0.5);
const driveId2 = crypto.randomUUID();
await app.from('drives').insert({
  id: driveId2, profile_id: uid, vehicle_id: vehicleId,
  started_at: new Date(fixes2[0].t).toISOString(),
  ended_at: new Date(fixes2[fixes2.length - 1].t).toISOString(),
  distance_m: 0, duration_s: 9, max_speed_ms: 0, avg_speed_ms: 0, verification: 'pending',
});
await app.from('drive_fixes').insert(
  fixes2.map((f) => ({
    drive_id: driveId2, t: new Date(f.t).toISOString(), lat: f.lat, lon: f.lon,
    speed_ms: f.speedMs, accuracy_m: f.accuracyM, is_mock: false,
  })),
);
await app.functions.invoke('verify-drive', { body: { drive_id: driveId2 } });

const { data: dedup } = await app.rpc('board_top', {
  p_metric: 'top_speed', p_scope: 'global', p_period: 'all',
  p_country: null, p_verified_only: false, p_limit: 50,
});
const mine = dedup?.filter((r) => r.username === username) ?? [];
check('two drives, one board row', mine.length === 1, mine);
check('the row kept is the better one', near(mine[0]?.value, 30, 0.5), mine[0]?.value);

// trip_count is an aggregate, not a per-drive value — the server had no way to
// produce it at all before 0008, so "Drives" silently fell back to the local
// board. Two drives uploaded above, so the count is 2.
const { data: counts, error: countErr } = await app.rpc('board_top', {
  p_metric: 'trip_count', p_scope: 'global', p_period: 'all',
  p_country: null, p_verified_only: false, p_limit: 50,
});
check('trip_count board query runs', !countErr, countErr?.message);
check(
  'trip_count counts our drives',
  counts?.find((r) => r.username === username)?.value === 2,
  counts?.filter((r) => r.username === username),
);

// ── 6. idempotent re-verification ───────────────────────────────────────────
section('6. Re-verification is idempotent');
await app.functions.invoke('verify-drive', { body: { drive_id: driveId } });
await app.functions.invoke('verify-drive', { body: { drive_id: driveId } });
const { count } = await app
  .from('leaderboard_entries')
  .select('*', { count: 'exact', head: true })
  .eq('drive_id', driveId)
  .eq('metric', 'top_speed')
  .eq('scope', 'global')
  .eq('period', 'all');
check('three verifications leave one entry', count === 1, { count });

// ── 7. authorisation ────────────────────────────────────────────────────────
section('7. Authorisation');
const attacker = createClient(API, ANON_KEY, opts);
await attacker.auth.signInAnonymously();
// supabase-js surfaces a non-2xx as `error`, not `data`, so the status has to
// come off the thrown FunctionsHttpError's response.
const { data: av, error: avErr } = await attacker.functions.invoke('verify-drive', {
  body: { drive_id: driveId },
});
const avStatus = avErr?.context?.status;
check("another user cannot verify someone else's drive", avStatus === 403, {
  status: avStatus, data: av, error: avErr?.message,
});

const { data: stolen } = await attacker.from('drives').select('id').eq('id', driveId);
check("another user cannot read someone else's drive", !stolen?.length, stolen);

const { error: forgeErr } = await app.from('drives').insert({
  id: crypto.randomUUID(), profile_id: uid,
  started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
  distance_m: 1, duration_s: 1, max_speed_ms: 99, avg_speed_ms: 1, verification: 'verified',
});
check('client cannot self-declare a drive verified', !!forgeErr, forgeErr?.message);

const { error: boardErr } = await app.from('leaderboard_entries').insert({
  drive_id: driveId, profile_id: uid, metric: 'top_speed', value: 999,
  scope: 'global', period: 'all', verification: 'verified', recorded_at: new Date().toISOString(),
});
check('client cannot write a board entry directly', !!boardErr, boardErr?.message);

// Server-owned columns have no client-writable path (migration 0005).
const serverOwned = {
  attestation: 'passed',
  route_polyline: 'fake',
  verification_meta: { spoofed: true },
};
for (const [col, value] of Object.entries(serverOwned)) {
  const { error } = await app.from('drives').insert({
    id: crypto.randomUUID(), profile_id: uid,
    started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
    distance_m: 1, duration_s: 1, max_speed_ms: 2, avg_speed_ms: 1,
    verification: 'pending', [col]: value,
  });
  check(`client cannot set drives.${col} on insert`, !!error, error?.message ?? 'ALLOWED — BAD');
}

const { error: keyErr } = await app.from('device_attestations').insert({
  key_id: 'forged', profile_id: uid, platform: 'ios',
});
check('client cannot register an attestation key directly', !!keyErr, keyErr?.message);

// ── 8. friends ──────────────────────────────────────────────────────────────
section('8. Friends');

// A second driver with a verified drive of their own.
const buddy = createClient(API, ANON_KEY, opts);
const { data: buddyAuth } = await buddy.auth.signInAnonymously();
const buddyName = `buddy_${Date.now().toString(36)}`;
await buddy.from('profiles').update({ username: buddyName, country: 'GB' }).eq('id', buddyAuth.user.id);
const buddyDrive = crypto.randomUUID();
const buddyFixes = drive(Date.now() - 200_000, 0.75); // slower than ours
await buddy.from('drives').insert({
  id: buddyDrive, profile_id: buddyAuth.user.id,
  started_at: new Date(buddyFixes[0].t).toISOString(),
  ended_at: new Date(buddyFixes[buddyFixes.length - 1].t).toISOString(),
  distance_m: 0, duration_s: 9, max_speed_ms: 0, avg_speed_ms: 0, verification: 'pending',
});
await buddy.from('drive_fixes').insert(
  buddyFixes.map((f) => ({
    drive_id: buddyDrive, t: new Date(f.t).toISOString(), lat: f.lat, lon: f.lon,
    speed_ms: f.speedMs, accuracy_m: f.accuracyM, is_mock: false,
  })),
);
await buddy.functions.invoke('verify-drive', { body: { drive_id: buddyDrive } });

// Before adding, the friends board holds only us.
const beforeAdd = await app.rpc('board_top', {
  p_metric: 'top_speed', p_scope: 'friends', p_period: 'all',
  p_country: null, p_verified_only: false, p_limit: 50,
});
check(
  'friends board excludes people you have not added',
  !beforeAdd.data?.some((r) => r.username === buddyName),
  beforeAdd.data,
);

const { error: addErr } = await app.rpc('add_friend', { p_username: buddyName });
check('add_friend succeeds', !addErr, addErr?.message);

const { data: friendList } = await app.rpc('list_friends');
check('list_friends returns them', friendList?.some((f) => f.username === buddyName), friendList);
check(
  'list_friends carries their best verified speed',
  friendList?.find((f) => f.username === buddyName)?.best_speed > 0,
  friendList,
);

const afterAdd = await app.rpc('board_top', {
  p_metric: 'top_speed', p_scope: 'friends', p_period: 'all',
  p_country: null, p_verified_only: false, p_limit: 50,
});
check(
  'friends board now includes them',
  afterAdd.data?.some((r) => r.username === buddyName),
  afterAdd.data,
);
check('friends board still includes you', afterAdd.data?.some((r) => r.username === username), afterAdd.data);

// Following is one-way: their board must be unaffected.
const { data: buddyFriends } = await buddy.rpc('list_friends');
check('following is one-way — their list stays empty', buddyFriends?.length === 0, buddyFriends);

const { error: dupErr } = await app.rpc('add_friend', { p_username: buddyName });
check('adding twice is idempotent, not an error', !dupErr, dupErr?.message);

const { error: ghostErr } = await app.rpc('add_friend', { p_username: 'no_such_driver_xyz' });
check('adding an unknown username errors', !!ghostErr, ghostErr?.message);

const { error: selfErr } = await app.rpc('add_friend', { p_username: username });
check('adding yourself errors', !!selfErr, selfErr?.message);

await app.rpc('remove_friend', { p_friend_id: buddyAuth.user.id });
const { data: afterRemove } = await app.rpc('list_friends');
check('remove_friend removes them', !afterRemove?.some((f) => f.username === buddyName), afterRemove);

// ── 9. account deletion ─────────────────────────────────────────────────────
section('9. Account deletion');
const { error: delErr } = await app.rpc('delete_account');
check('delete_account RPC succeeds', !delErr, delErr?.message);

const admin = createClient(API, ANON_KEY, opts);
await admin.auth.signInAnonymously();
const { data: after } = await admin.rpc('board_top', {
  p_metric: 'top_speed', p_scope: 'global', p_period: 'all',
  p_country: null, p_verified_only: false, p_limit: 50,
});
check('deletion cascades to the boards', !after?.some((r) => r.username === username), after);

console.log(
  failures === 0
    ? '\n[32mAll round-trip checks passed.[0m'
    : `\n[31m${failures} check(s) failed.[0m`,
);
process.exit(failures === 0 ? 0 : 1);
