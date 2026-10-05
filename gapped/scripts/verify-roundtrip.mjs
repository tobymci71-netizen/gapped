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
 *
 * Local only. It signs up throwaway accounts and writes drives, so it refuses
 * any SUPABASE_URL that is not 127.0.0.1 or localhost unless ALLOW_REMOTE=1,
 * and it deletes every account it created in a `finally`, pass or fail.
 *
 * A few checks read what no client may (board entries per drive, purging a
 * drive's fixes). They use SUPABASE_SERVICE_ROLE_KEY, or the local stack's own
 * key from `supabase status`; without either they are reported as SKIP.
 */
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// ── local only ──────────────────────────────────────────────────────────────
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
let apiHost = null;
try {
  apiHost = new URL(API).hostname;
} catch {
  /* unparseable — refused below */
}
const isLocal = LOCAL_HOSTS.has(apiHost);
if (!isLocal && process.env.ALLOW_REMOTE !== '1') {
  console.error(
    `Refusing to run against ${API}: this script creates and deletes accounts and ` +
      'drives. It runs against 127.0.0.1 or localhost only; set ALLOW_REMOTE=1 to override.',
  );
  process.exit(1);
}

/** The service-role key: from the environment, else the local stack's own. */
function serviceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isLocal) return null;
  try {
    const out = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split('\n').find((l) => l.startsWith('SERVICE_ROLE_KEY='));
    return line ? line.slice('SERVICE_ROLE_KEY='.length).replace(/^"|"$/g, '') : null;
  } catch {
    return null;
  }
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const SERVICE_KEY = serviceRoleKey();
const service = SERVICE_KEY ? createClient(API, SERVICE_KEY, opts) : null;

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '  \x1b[32mPASS\x1b[0m' : '  \x1b[31mFAIL\x1b[0m'}  ${name}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}
const skip = (name, why) => console.log(`  \x1b[33mSKIP\x1b[0m  ${name} (${why})`);
const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;
const section = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

// ── accounts, all deleted at the end ────────────────────────────────────────
/** Every account this run created, so the `finally` can delete each one. */
const accounts = [];

/** A fresh anonymous account, registered for deletion before anything else. */
async function signUp(label) {
  const client = createClient(API, ANON_KEY, opts);
  const { data, error } = await client.auth.signInAnonymously();
  if (data?.user) accounts.push({ label, client, id: data.user.id, deleted: false });
  return { client, data, error };
}

/** Marks an account deleted by the run itself (§9), so cleanup skips it. */
function markDeleted(id) {
  const a = accounts.find((x) => x.id === id);
  if (a) a.deleted = true;
}

/**
 * Deletes every account still standing — through the product's own
 * delete_account, and through the admin API if that fails (an expired
 * session, a half-finished run). Cascades take their drives, entries and
 * achievements with them.
 */
async function cleanup() {
  const pending = accounts.filter((a) => !a.deleted);
  if (pending.length === 0) return;
  section('Cleanup');
  for (const a of pending) {
    let { error } = await a.client.rpc('delete_account');
    if (error && service) ({ error } = await service.auth.admin.deleteUser(a.id));
    check(`deleted the ${a.label} account`, !error, error?.message);
    if (!error) a.deleted = true;
  }
}

// ── the fixture, mirroring traceFromSpeeds10Hz ──────────────────────────────
const ORIGIN = { lat: 51.5, lon: -0.12 };
const M_PER_DEG_LAT = (2 * Math.PI * 6371008.8) / 360;

/** Cruise seconds appended after the pull, at 1 Hz. */
const CRUISE_S = 450;

/** National ceiling for GB, 70 mph — mirrors _shared/speedLimits.ts. */
const GB_CEILING_MS = 70 * 0.44704;

/**
 * The 10 Hz pull, then a 1 Hz cruise.
 *
 * The cruise is not decoration. Privacy trimming removes 1.0–1.7 miles from
 * each end of a route, so the 90 m pull on its own is trimmed away entirely
 * and correctly yields no shareable route — there would be nothing to assert
 * a polyline against. The mixed 10 Hz/1 Hz rate also matches what the recorder
 * actually produces, and 540 fixes crosses sync.ts's 500-fix batch boundary.
 *
 * Ground truth at scale s: top speed 30s m/s, distance 90s² + 30s·cruiseS m,
 * and a real 0-60 time only at s >= 1 (at any lower scale it never reaches 60).
 */
function drive(startT, scale = 1, cruiseS = CRUISE_S) {
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
  for (let i = 1; i <= cruiseS; i++) {
    lat += cruiseV / M_PER_DEG_LAT;
    push(lastT + i * 1000, cruiseV, i);
  }
  return fixes;
}

/** Inserts a drive and its fixes as `client`, in sync.ts's 500-fix batches. */
async function uploadDrive(client, profileId, fixes, { vehicleId = null, startedAt } = {}) {
  const id = crypto.randomUUID();
  const { error: dErr } = await client.from('drives').insert({
    id, profile_id: profileId, vehicle_id: vehicleId,
    started_at: startedAt ?? new Date(fixes[0].t).toISOString(),
    ended_at: new Date(fixes[fixes.length - 1].t).toISOString(),
    distance_m: 0, duration_s: 9, max_speed_ms: 0, avg_speed_ms: 0, verification: 'pending',
  });
  if (dErr) return { id, error: dErr };
  for (let i = 0; i < fixes.length; i += 500) {
    const { error } = await client.from('drive_fixes').insert(
      fixes.slice(i, i + 500).map((f) => ({
        drive_id: id, t: new Date(f.t).toISOString(), lat: f.lat, lon: f.lon,
        speed_ms: f.speedMs, accuracy_m: f.accuracyM, altitude_m: f.altitudeM, heading: f.heading,
        accel_x: f.accelX, accel_y: f.accelY, accel_z: f.accelZ,
        pressure_hpa: f.pressureHpa, is_mock: f.isMock,
      })),
    );
    if (error) return { id, error };
  }
  return { id, error: null };
}

/** This drive's board entries, counted by the service role (clients cannot). */
async function entryCount(driveId, metric) {
  let q = service
    .from('leaderboard_entries')
    .select('*', { count: 'exact', head: true })
    .eq('drive_id', driveId);
  if (metric) q = q.eq('metric', metric);
  const { count, error } = await q;
  return error ? null : count;
}

/** The one-row-per-driver board limited to you and your friends. */
const myBoard = (client, metric) =>
  client.rpc('board_top', {
    p_metric: metric, p_scope: 'friends', p_period: 'all',
    p_country: null, p_verified_only: false, p_limit: 50,
  });

async function main() {
  // ── 1. identity ─────────────────────────────────────────────────────────────
  section('1. Anonymous-first identity');
  const { client: app, data: authData, error: authErr } = await signUp('main');
  check('anonymous sign-in succeeds', !authErr && !!authData?.user, authErr?.message);
  if (!authData?.user) throw new Error('cannot continue without an account');
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
      'distance_m, duration_s, max_speed_ms, avg_speed_ms, zero_to_60_s, route_polyline, verification, verification_meta, attestation, attestation_meta',
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

  // The server-only checks ran, and a 30 m/s top speed is inside GB's 70 mph.
  const ranCheck = (meta, name) => meta?.checks?.find((c) => c.check === name);
  check('speed_ceiling ran and passed', ranCheck(row?.verification_meta, 'speed_ceiling')?.pass === true, row?.verification_meta?.checks);
  check('clock ran and passed', ranCheck(row?.verification_meta, 'clock')?.pass === true, row?.verification_meta?.checks);
  check(
    'a top speed under the national limit is ranked',
    row?.verification_meta?.top_speed_ranked === true,
    row?.verification_meta,
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
  // Board entries are not client-readable (0018+), so the count is the
  // service role's to take.
  if (service) {
    const { count } = await service
      .from('leaderboard_entries')
      .select('*', { count: 'exact', head: true })
      .eq('drive_id', driveId)
      .eq('metric', 'top_speed')
      .eq('scope', 'global')
      .eq('period', 'all');
    check('three verifications leave one entry', count === 1, { count });
  } else {
    skip('three verifications leave one entry', 'no service-role key');
  }

  // ── 7. authorisation ────────────────────────────────────────────────────────
  section('7. Authorisation');
  const { client: attacker } = await signUp('attacker');
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

  // Boards are read through board_top only; the raw entries (exact timestamps,
  // drive ids) have no client privilege path.
  const { data: rawEntries, error: rawEntriesErr } = await app
    .from('leaderboard_entries')
    .select('id')
    .limit(1);
  check(
    'client cannot read board entries directly (not merely no rows)',
    !!rawEntriesErr && !rawEntries?.length,
    { error: rawEntriesErr?.message ?? null, rows: rawEntries },
  );

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

  // ── 7b. vehicle specs and brackets ──────────────────────────────────────────
  section('7b. Vehicle specs, brackets and achievements');

  // Specs decide which class a run competes in, so the client must not be able
  // to write them — otherwise a fast car declares itself slow and owns the
  // slowest bracket.
  for (const col of ['curb_weight_kg', 'factory_power_hp', 'drivetrain']) {
    const value = col === 'drivetrain' ? 'rwd' : 500;
    const { error } = await app.from('vehicles').update({ [col]: value }).eq('id', vehicleId);
    check(`client cannot set vehicles.${col}`, !!error, error?.message ?? 'ALLOWED — BAD');
  }
  const { error: specInsertErr } = await app.from('vehicles').insert({
    id: crypto.randomUUID(), profile_id: uid, kind: 'car', make: 'X', model: 'Y',
    factory_power_hp: 90, curb_weight_kg: 1800,
  });
  check('client cannot insert a vehicle with specs', !!specInsertErr, specInsertErr?.message);

  // is_modified stays client-writable on purpose: declaring a mod only ever
  // moves you to a harder class, never an easier one.
  const { error: modErr } = await app.from('vehicles').update({ is_modified: true }).eq('id', vehicleId);
  check('client can still declare a modification', !modErr, modErr?.message);
  await app.from('vehicles').update({ is_modified: false }).eq('id', vehicleId);

  // Our drives were recorded with a spec-less vehicle, so they rank open class.
  const { data: openBoard } = await app.rpc('board_top', {
    p_metric: 'top_speed', p_scope: 'global', p_period: 'all',
    p_country: null, p_verified_only: false, p_limit: 50, p_bracket: 'any|stock|open',
  });
  check(
    'bracket filter returns our open-class entry',
    openBoard?.some((r) => r.username === username),
    openBoard?.slice(0, 2),
  );

  const { data: otherBracket } = await app.rpc('board_top', {
    p_metric: 'top_speed', p_scope: 'global', p_period: 'all',
    p_country: null, p_verified_only: false, p_limit: 50, p_bracket: 'rwd|stock|pw4',
  });
  check(
    'a class we are not in excludes us',
    !otherBracket?.some((r) => r.username === username),
    otherBracket,
  );

  const { data: bracketList, error: blErr } = await app.rpc('board_brackets', {
    p_metric: 'top_speed', p_period: 'all',
  });
  check('board_brackets lists only classes with drivers', !blErr && bracketList?.length > 0, {
    err: blErr?.message, bracketList,
  });

  // Achievements are server-granted off verified drives.
  const { data: earned } = await app
    .from('achievements').select('kind, payload').eq('profile_id', uid);
  check(
    'first verified run was awarded',
    earned?.some((a) => a.kind === 'first_verified_run'),
    earned,
  );
  check(
    'a measured 0-60 was awarded',
    earned?.some((a) => a.kind === 'first_measured_launch'),
    earned,
  );
  // "Fastest in country" is retired: topping a top-speed board is no longer
  // something the app rewards.
  check(
    'topping the GB board no longer grants country_number_one',
    !earned?.some((a) => a.kind === 'country_number_one'),
    earned,
  );
  check(
    'ten-run achievement not awarded on two drives',
    !earned?.some((a) => a.kind === 'ten_verified_runs'),
    earned,
  );

  // Re-verifying must not duplicate an achievement.
  await app.functions.invoke('verify-drive', { body: { drive_id: driveId } });
  const { count: achCount } = await app
    .from('achievements')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', uid)
    .eq('kind', 'first_verified_run');
  check('achievements are not re-granted on re-verification', achCount === 1, { achCount });

  // A kind this account does not hold, so the refusal is the grant's and not
  // the (profile, kind) unique constraint's.
  const { error: forgeAch } = await app.from('achievements').insert({
    profile_id: uid, kind: 'ten_verified_runs', payload: {},
  });
  check('client cannot grant itself an achievement (42501)', forgeAch?.code === '42501', forgeAch);

  // ── 8. friends ──────────────────────────────────────────────────────────────
  section('8. Friends');

  // A second driver with a verified drive of their own.
  const { client: buddy, data: buddyAuth } = await signUp('buddy');
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

  // Achievements are your own business (0018+): another driver cannot list them.
  const { data: theirAch } = await buddy.from('achievements').select('kind').eq('profile_id', uid);
  check("another driver cannot read someone's achievements", (theirAch ?? []).length === 0, theirAch);

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

  // ── 8b. onboarding (0017) ───────────────────────────────────────────────────
  section('8b. Onboarding proof, garage and answers (0017)');

  // The proof screens are a first launch's, often before any session exists —
  // and an anonymous sign-in can be refused (rate-limited per IP) on a network
  // that works. Both counts are granted to anon for exactly that.
  const signedOut = createClient(API, ANON_KEY, opts);
  const { data: popAnon, error: popAnonErr } = await signedOut.rpc('make_popularity', {
    p_kind: 'car',
  });
  check(
    'make_popularity answers with no session',
    !popAnonErr && Array.isArray(popAnon),
    popAnonErr?.message,
  );
  check(
    'make_popularity never lists a make under 5 drivers',
    (popAnon ?? []).every((r) => Number(r.drivers) >= 5),
    popAnon,
  );
  const { data: actAnon, error: actAnonErr } = await signedOut.rpc('country_activity', {
    p_country: 'GB',
  });
  check(
    'country_activity answers exactly one row with no session',
    !actAnonErr && Array.isArray(actAnon) && actAnon.length === 1,
    actAnonErr?.message ?? actAnon,
  );
  check(
    'country_activity withholds any count under 10 (null, never a small number)',
    (actAnon ?? []).every(
      (r) =>
        (r.drivers === null || Number(r.drivers) >= 10) &&
        (r.drove_yesterday === null || Number(r.drove_yesterday) >= 10),
    ),
    actAnon,
  );
  const { data: actSigned, error: actSignedErr } = await app.rpc('country_activity', {
    p_country: 'gb',
  });
  check(
    'country_activity answers a signed-in driver, lower-case code and all',
    !actSignedErr && actSigned?.length === 1,
    actSignedErr?.message ?? actSigned,
  );

  // A change of main car, exactly as sync.ts pushIdentity sends it: the new car
  // with DO NOTHING on conflict, then every other primary demoted. Without the
  // demotion a driver who changed cars kept several "main" cars, and
  // make_popularity could only guess which one to count.
  const newCarId = crypto.randomUUID();
  const { error: newCarErr } = await app.from('vehicles').upsert(
    { id: newCarId, profile_id: uid, kind: 'car', make: 'Mazda', model: 'MX-5', is_primary: true },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  check('a new main car is created', !newCarErr, newCarErr?.message);
  const { error: demoteErr } = await app
    .from('vehicles')
    .update({ is_primary: false })
    .eq('profile_id', uid)
    .eq('is_primary', true)
    .neq('id', newCarId);
  check('the old main car is demoted under own-row RLS', !demoteErr, demoteErr?.message);

  // The garage step's extra vehicles: one bulk statement, never primary, and a
  // second send (every sync pass until it lands) changes nothing.
  const extras = [
    { id: crypto.randomUUID(), kind: 'motorbike', make: 'Ducati', model: 'Monster' },
    { id: crypto.randomUUID(), kind: 'car', make: 'Honda', model: 'Civic Type R' },
  ].map((v) => ({ ...v, profile_id: uid, is_primary: false }));
  for (const pass of ['first', 'second']) {
    const { error } = await app
      .from('vehicles')
      .upsert(extras, { onConflict: 'id', ignoreDuplicates: true });
    check(`garage extras upsert in one statement (${pass} send)`, !error, error?.message);
  }
  const { data: garage } = await app
    .from('vehicles')
    .select('id, is_primary')
    .eq('profile_id', uid);
  check(
    'both extras exist, neither is the main car',
    extras.every((e) => garage?.some((g) => g.id === e.id && g.is_primary === false)),
    garage,
  );
  check(
    'exactly one main car remains, and it is the new one',
    garage?.filter((g) => g.is_primary).map((g) => g.id).join() === newCarId,
    garage,
  );

  // The onboarding answers: own row only, sent one answer at a time (as the
  // screens and sync.ts do), and a later answer never blanks an earlier one.
  const { error: focusErr } = await app
    .from('onboarding_answers')
    .upsert({ profile_id: uid, focus: 'topSpeed' }, { onConflict: 'profile_id' });
  check('focus answer saves', !focusErr, focusErr?.message);
  const { error: attrErr } = await app
    .from('onboarding_answers')
    .upsert({ profile_id: uid, attribution: 'friend' }, { onConflict: 'profile_id' });
  check('attribution answer saves', !attrErr, attrErr?.message);
  const { data: answers } = await app
    .from('onboarding_answers')
    .select('focus, attribution')
    .eq('profile_id', uid)
    .maybeSingle();
  check(
    'the second answer kept the first',
    answers?.focus === 'topSpeed' && answers?.attribution === 'friend',
    answers,
  );
  const { error: badKeyErr } = await app
    .from('onboarding_answers')
    .upsert({ profile_id: uid, focus: 'fastest' }, { onConflict: 'profile_id' });
  check('an unknown focus key is refused (23514)', badKeyErr?.code === '23514', badKeyErr);
  const { error: foreignErr } = await buddy
    .from('onboarding_answers')
    .upsert({ profile_id: uid, focus: 'beatFriends' }, { onConflict: 'profile_id' });
  check(
    "another driver cannot write someone's answers (42501)",
    foreignErr?.code === '42501',
    foreignErr,
  );
  const { data: peek } = await buddy
    .from('onboarding_answers')
    .select('focus')
    .eq('profile_id', uid);
  check("another driver cannot read someone's answers", (peek ?? []).length === 0, peek);
  const { error: anonPeekErr } = await signedOut.from('onboarding_answers').select('focus');
  check('anon cannot read answers at all (42501)', anonPeekErr?.code === '42501', anonPeekErr);
  const { data: still } = await app
    .from('onboarding_answers')
    .select('focus')
    .eq('profile_id', uid)
    .maybeSingle();
  check('the refused writes changed nothing', still?.focus === 'topSpeed', still);

  // ── 8c. long drives, the national ceiling, the clock, purged fixes ──────────
  section('8c. Long drives, national speed ceiling, clock and purged fixes');

  // A drive longer than PostgREST's 1000-row cap. Read in one select, the
  // server re-derived it from its first 1000 fixes and still called it
  // verified; only paging reproduces the whole distance.
  const { client: hauler, data: haulerAuth } = await signUp('long-drive');
  const haulerId = haulerAuth.user.id;
  const haulerName = `long_${Date.now().toString(36)}`;
  // Checked: a refused name fails the whole update, country and all, and every
  // ceiling check below would then be held to the default limit, not GB's.
  const { error: haulerProfErr } = await hauler
    .from('profiles')
    .update({ username: haulerName, country: 'GB' })
    .eq('id', haulerId);
  check('the long-drive account is set up in GB', !haulerProfErr, haulerProfErr);
  const LONG_CRUISE_S = 1200;
  const longFixes = drive(Date.now() - 1_500_000, 1, LONG_CRUISE_S);
  const long = await uploadDrive(hauler, haulerId, longFixes);
  check(`a ${longFixes.length}-fix drive uploads`, !long.error && longFixes.length > 1000, long.error?.message);
  const { data: longVr, error: longVrErr } = await hauler.functions.invoke('verify-drive', {
    body: { drive_id: long.id },
  });
  check('the long drive verifies', !longVrErr && longVr?.verification === 'verified', longVrErr?.message ?? longVr);
  const { data: longRow } = await hauler
    .from('drives')
    .select('distance_m, max_speed_ms, verification, verification_meta')
    .eq('id', long.id)
    .single();
  const LONG_M = 90 + 30 * LONG_CRUISE_S;
  check(
    `every fix counted: distance = ${LONG_M} m, not the first 1000 fixes' ${90 + 30 * 910} m`,
    near(longRow?.distance_m, LONG_M, LONG_M * 0.02),
    longRow?.distance_m,
  );

  // Over the national limit: GB's 70 mph is 31.3 m/s, and this drive peaks at
  // 36 m/s. It still verifies and keeps its top speed in its own record, but it
  // goes on no public top-speed board. Its distance still ranks.
  const { client: speeder, data: speederAuth } = await signUp('over-limit');
  const speederId = speederAuth.user.id;
  const speederName = `fast_${Date.now().toString(36)}`;
  const { error: speederProfErr } = await speeder
    .from('profiles')
    .update({ username: speederName, country: 'GB' })
    .eq('id', speederId);
  check('the over-limit account is set up in GB', !speederProfErr, speederProfErr);
  const fast = await uploadDrive(speeder, speederId, drive(Date.now() - 700_000, 1.2));
  check('the over-limit drive uploads', !fast.error, fast.error?.message);
  const { data: fastVr } = await speeder.functions.invoke('verify-drive', { body: { drive_id: fast.id } });
  check('an over-limit drive still verifies', fastVr?.verification === 'verified', fastVr);
  const { data: fastRow } = await speeder
    .from('drives')
    .select('max_speed_ms, verification_meta')
    .eq('id', fast.id)
    .single();
  check('its own record keeps the real top speed', near(fastRow?.max_speed_ms, 36, 0.5), fastRow?.max_speed_ms);
  check(
    'and marks it not ranked',
    fastRow?.verification_meta?.top_speed_ranked === false,
    fastRow?.verification_meta,
  );
  check(
    'against the GB ceiling of 70 mph',
    near(fastRow?.verification_meta?.top_speed_ceiling_ms, GB_CEILING_MS, 0.01),
    fastRow?.verification_meta?.top_speed_ceiling_ms,
  );
  const { data: fastSpeedBoard } = await myBoard(speeder, 'top_speed');
  check(
    'it is on no top-speed board',
    !fastSpeedBoard?.some((r) => r.username === speederName),
    fastSpeedBoard,
  );
  const { data: fastDistBoard } = await myBoard(speeder, 'distance');
  check(
    'its distance is still ranked',
    fastDistBoard?.some((r) => r.username === speederName),
    fastDistBoard,
  );
  if (service) {
    check('no top_speed entry exists for it at all', (await entryCount(fast.id, 'top_speed')) === 0);
  } else {
    skip('no top_speed entry exists for it at all', 'no service-role key');
  }

  // From the future: a start ten minutes ahead of the server's clock is
  // unverified and goes on no board at all.
  const aheadStart = Date.now() + 10 * 60_000;
  const ahead = await uploadDrive(speeder, speederId, drive(aheadStart, 0.5, 60));
  check('a drive stamped in the future uploads', !ahead.error, ahead.error?.message);
  const { data: aheadVr } = await speeder.functions.invoke('verify-drive', { body: { drive_id: ahead.id } });
  check('it is unverified', aheadVr?.verification === 'unverified', aheadVr);
  check(
    'and says why: the clock check failed',
    aheadVr?.checks?.find((c) => c.check === 'clock')?.pass === false,
    aheadVr?.checks,
  );
  if (service) {
    check('it has no board entries', (await entryCount(ahead.id)) === 0);
  } else {
    skip('it has no board entries', 'no service-role key');
  }

  // Purged fixes (the retention job): re-verification returns the stored
  // verdict instead of re-deriving from nothing and rejecting the drive.
  if (service) {
    const before = await entryCount(long.id);
    await service.from('drive_fixes').delete().eq('drive_id', long.id);
    const { error: purgeErr } = await service
      .from('drives')
      .update({ fixes_purged_at: new Date().toISOString() })
      .eq('id', long.id);
    check('the retention job can mark a drive purged', !purgeErr, purgeErr?.message);
    const { data: purgedVr, error: purgedErr } = await hauler.functions.invoke('verify-drive', {
      body: { drive_id: long.id },
    });
    check(
      'a purged drive keeps its stored verification',
      !purgedErr && purgedVr?.verification === 'verified' && purgedVr?.fixes_purged === true,
      purgedErr?.message ?? purgedVr,
    );
    const { data: purgedRow } = await hauler
      .from('drives')
      .select('distance_m, verification')
      .eq('id', long.id)
      .single();
    check(
      'and its derived numbers are untouched',
      near(purgedRow?.distance_m, LONG_M, LONG_M * 0.02) && purgedRow?.verification === 'verified',
      purgedRow,
    );
    check('and its board entries stay', (await entryCount(long.id)) === before && before > 0, { before });

    // A phone that still held the drive unsent uploads its fixes again after
    // the purge (sync.ts: upsert, then verify). verify-drive deletes them:
    // the retention job never looks at a purged drive again.
    const { error: reuploadErr } = await hauler.from('drive_fixes').upsert(
      longFixes.slice(0, 50).map((f) => ({
        drive_id: long.id, t: new Date(f.t).toISOString(), lat: f.lat, lon: f.lon,
        speed_ms: f.speedMs, accuracy_m: f.accuracyM, is_mock: f.isMock,
      })),
      { onConflict: 'drive_id,t', ignoreDuplicates: true },
    );
    const { data: reVr, error: reVrErr } = await hauler.functions.invoke('verify-drive', {
      body: { drive_id: long.id },
    });
    const { count: leftOver } = await service
      .from('drive_fixes')
      .select('*', { count: 'exact', head: true })
      .eq('drive_id', long.id);
    check(
      'fixes uploaded again after the purge are deleted, and the verdict stands',
      !reuploadErr && !reVrErr && reVr?.verification === 'verified' && leftOver === 0,
      reuploadErr?.message ?? reVrErr?.message ?? { leftOver, reVr },
    );

    // A drive verified before the national ceilings existed, purged before
    // anything re-verified it: the over-limit drive above, given back the
    // top_speed entry and the unmarked meta an older verify-drive left behind.
    // Its fixes are gone, but the ceiling needs none — its stored top speed
    // still takes it off the top-speed board.
    const { data: legacyMeta } = await service
      .from('drives')
      .select('verification_meta')
      .eq('id', fast.id)
      .single();
    const NEWER_KEYS = ['top_speed_ranked', 'top_speed_ceiling_ms', 'ranking_country'];
    const olderMeta = Object.fromEntries(
      Object.entries(legacyMeta?.verification_meta ?? {}).filter(([k]) => !NEWER_KEYS.includes(k)),
    );
    const { error: legacyEntryErr } = await service.from('leaderboard_entries').insert({
      drive_id: fast.id, profile_id: speederId, metric: 'top_speed', value: 36,
      scope: 'global', country: null, bracket_key: 'any|stock|open', period: 'all',
      verification: 'verified', recorded_at: new Date(Date.now() - 700_000).toISOString(),
    });
    await service.from('drive_fixes').delete().eq('drive_id', fast.id);
    const { error: legacyPurgeErr } = await service
      .from('drives')
      .update({ verification_meta: olderMeta, fixes_purged_at: new Date().toISOString() })
      .eq('id', fast.id);
    check(
      'a legacy over-limit drive is set up, purged, with a top_speed entry',
      !legacyEntryErr && !legacyPurgeErr && (await entryCount(fast.id, 'top_speed')) === 1,
      legacyEntryErr?.message ?? legacyPurgeErr?.message,
    );
    const { data: legacyVr, error: legacyVrErr } = await speeder.functions.invoke('verify-drive', {
      body: { drive_id: fast.id },
    });
    check(
      'a purged drive over the national limit is reported not ranked',
      !legacyVrErr && legacyVr?.fixes_purged === true && legacyVr?.top_speed_ranked === false,
      legacyVrErr?.message ?? legacyVr,
    );
    check('and loses its top_speed entry', (await entryCount(fast.id, 'top_speed')) === 0);
    const { data: legacyRow } = await speeder
      .from('drives')
      .select('max_speed_ms, verification, verification_meta')
      .eq('id', fast.id)
      .single();
    check(
      'while its own record keeps the top speed and marks it not ranked',
      near(legacyRow?.max_speed_ms, 36, 0.5) &&
        legacyRow?.verification === 'verified' &&
        legacyRow?.verification_meta?.top_speed_ranked === false,
      legacyRow,
    );
  } else {
    skip('purged fixes keep the stored verification', 'no service-role key');
  }

  // ── 9. account deletion ─────────────────────────────────────────────────────
  section('9. Account deletion');
  const { error: delErr } = await app.rpc('delete_account');
  check('delete_account RPC succeeds', !delErr, delErr?.message);
  if (!delErr) markDeleted(uid);

  const { client: observer } = await signUp('observer');
  const { data: after } = await observer.rpc('board_top', {
    p_metric: 'top_speed', p_scope: 'global', p_period: 'all',
    p_country: null, p_verified_only: false, p_limit: 50,
  });
  check('deletion cascades to the boards', !after?.some((r) => r.username === username), after);
}

try {
  await main();
} catch (e) {
  failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m  run aborted: ${e?.message ?? e}`);
} finally {
  await cleanup();
}

console.log(
  failures === 0
    ? '\n\x1b[32mAll round-trip checks passed.\x1b[0m'
    : `\n\x1b[31m${failures} check(s) failed.\x1b[0m`,
);
process.exit(failures === 0 ? 0 : 1);
