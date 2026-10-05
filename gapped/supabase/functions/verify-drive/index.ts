/**
 * verify-drive — the server-side authority (spec Phase 3, items 3–4, 6).
 *
 * Recomputes every derived value from the raw fix array, runs the
 * plausibility envelope, sets verification state, builds the privacy-trimmed
 * route, and writes leaderboard entries. The client's numbers are a UI
 * convenience; nothing the client sent is trusted here.
 *
 * Top speed is ranked publicly only up to the national speed limit of the
 * driver's country (_shared/speedLimits.ts). Above it the drive still
 * verifies and keeps its top speed in the driver's own history, marked
 * `verification_meta.top_speed_ranked = false`, but no top_speed board entry
 * is written for it.
 *
 * Runs with the service role (bypasses RLS) — deploy with:
 *   supabase functions deploy verify-drive
 *
 * Secrets: TRIM_SALT (route-trim salt), APPLE_APP_ID +
 * APPLE_APP_ATTEST_ROOT_CA (iOS attestation), ANDROID_PACKAGE_NAME +
 * PLAY_INTEGRITY_SERVICE_ACCOUNT (Android), and ATTESTATION_REQUIRED once
 * attestation has been validated on real hardware.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { summarize } from '../_shared/stats.ts';
import { checkPlausibility } from '../_shared/plausibility.ts';
import { trimRouteForSharing } from '../_shared/privacy.ts';
import { encodePolyline } from '../_shared/polyline.ts';
import { bracketKey, type Drivetrain } from '../_shared/brackets.ts';
import {
  verifyAppAttestAssertion,
  verifyPlayIntegrity,
  type AttestationVerdict,
} from '../_server/attestation.ts';
import { isServerKey, serviceClientKey } from '../_server/keys.ts';
import {
  boardEntries,
  checkClock,
  checkSpeedCeiling,
  mergeChecks,
  planBoard,
  rankPurgedTopSpeed,
  rankTopSpeed,
  readAllPages,
  recordedAt,
} from '../_server/verify.ts';
import type { Fix } from '../_shared/types.ts';
import {
  readDegrees,
  readDegreesOrNull,
  readEpochMs,
  readGOrNull,
  readHpaOrNull,
  readMetresOrNull,
  readMpsOrNull,
} from '../_shared/unit-boundary.ts';

type FixRow = {
  t: string;
  lat: number;
  lon: number;
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

/**
 * Coordinates are read as plain lat/lon numbers, never from the `point`
 * geography. PostgREST serialises geography as WKB hex, and the previous WKT
 * regex here silently produced (0, 0) for every fix — re-deriving every drive
 * from the Gulf of Guinea and stamping the result 'verified'. `point` is now a
 * generated column derived from these two; see migration 0003.
 */
function rowToFix(r: FixRow): Fix {
  // PostgREST boundary: every column arrives as a plain JSON number. Branding
  // goes through _shared/unit-boundary.ts so the server asserts the same SI
  // contract the client does — see the note at the top of that file.
  return {
    t: readEpochMs(Date.parse(r.t)),
    lat: readDegrees(r.lat),
    lon: readDegrees(r.lon),
    speedMs: readMpsOrNull(r.speed_ms),
    accuracyM: readMetresOrNull(r.accuracy_m),
    altitudeM: readMetresOrNull(r.altitude_m),
    heading: readDegreesOrNull(r.heading),
    accelX: readGOrNull(r.accel_x),
    accelY: readGOrNull(r.accel_y),
    accelZ: readGOrNull(r.accel_z),
    pressureHpa: readHpaOrNull(r.pressure_hpa),
    isMock: r.is_mock,
  };
}

function lineStringWkt(fixes: Fix[]): string | null {
  if (fixes.length < 2) return null;
  return `LINESTRING(${fixes.map((f) => `${f.lon} ${f.lat}`).join(',')})`;
}

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });

type AttestationInput = {
  platform?: 'ios' | 'android';
  /** iOS: the registered App Attest key. */
  key_id?: string;
  /** iOS: CBOR assertion over the drive id. */
  assertion?: string;
  /** Android: a Play Integrity token whose requestHash is the drive id. */
  token?: string;
};

/**
 * Attest the device that produced this drive.
 *
 * The drive id is the challenge on both platforms: it is unique per drive, so
 * an assertion or token cannot be lifted from one upload and reused on
 * another. iOS additionally carries a hardware counter that must advance.
 *
 * Absence is reported as 'none', not 'failed'. A drive with no token is not a
 * fraudulent drive — it is an older client, a simulator, or a device that
 * cannot attest — and conflating the two would brand honest users as cheats.
 */
// supabase-js's generics are not worth threading through here — this needs
// exactly one table and two operations on it.
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

type StoredKey = {
  profile_id: string;
  public_key: string | null;
  sign_count: number | null;
};

async function attestDrive(
  supabase: Db,
  input: AttestationInput | undefined,
  driveId: string,
  profileId: string,
): Promise<AttestationVerdict> {
  // Attestation must never be able to fail the whole verification with a 500 —
  // a drive is still a drive if the attestation path breaks. Any unexpected
  // throw becomes a recorded 'failed' verdict instead.
  try {
    return await attestDriveInner(supabase, input, driveId, profileId);
  } catch (e) {
    return {
      status: 'failed',
      platform: input?.platform ?? null,
      reason: `attestation check errored: ${(e as Error).message}`,
    };
  }
}

async function attestDriveInner(
  supabase: Db,
  input: AttestationInput | undefined,
  driveId: string,
  profileId: string,
): Promise<AttestationVerdict> {
  if (!input?.platform) {
    return { status: 'none', platform: null, reason: 'no attestation supplied' };
  }

  if (input.platform === 'android') {
    if (!input.token) {
      return { status: 'none', platform: 'android', reason: 'no Play Integrity token supplied' };
    }
    const pkg = Deno.env.get('ANDROID_PACKAGE_NAME');
    if (!pkg) {
      return { status: 'failed', platform: 'android', reason: 'ANDROID_PACKAGE_NAME not configured' };
    }
    return await verifyPlayIntegrity({
      token: input.token,
      packageName: pkg,
      serviceAccountJson: Deno.env.get('PLAY_INTEGRITY_SERVICE_ACCOUNT') ?? null,
      challenge: driveId,
    });
  }

  // iOS
  if (!input.key_id || !input.assertion) {
    return { status: 'none', platform: 'ios', reason: 'no App Attest assertion supplied' };
  }
  const appId = Deno.env.get('APPLE_APP_ID');
  if (!appId) {
    return { status: 'failed', platform: 'ios', reason: 'APPLE_APP_ID not configured' };
  }

  const { data: keyRow } = await supabase
    .from('device_attestations')
    .select('profile_id, public_key, sign_count')
    .eq('key_id', input.key_id)
    .maybeSingle();
  const key = keyRow as StoredKey | null;
  if (!key) {
    return { status: 'failed', platform: 'ios', reason: 'App Attest key is not registered' };
  }
  // A registered key proves a device, but only for the account that registered
  // it — otherwise one attested phone could launder drives for every account.
  if (key.profile_id !== profileId) {
    return { status: 'failed', platform: 'ios', reason: 'key belongs to another account' };
  }

  const spkiHex = String(key.public_key ?? '').replace(/^\\x/, '');
  const spki = new Uint8Array(
    (spkiHex.match(/../g) ?? []).map((h: string) => parseInt(h, 16)),
  );

  const result = await verifyAppAttestAssertion({
    assertionB64: input.assertion,
    challenge: driveId,
    publicKeySpki: spki,
    storedSignCount: Number(key.sign_count ?? 0),
    appId,
  });

  if (result.verdict.status === 'passed' && result.signCount != null) {
    // Persist the advanced counter, guarded so two concurrent uploads cannot
    // both accept the same value.
    await supabase
      .from('device_attestations')
      .update({ sign_count: result.signCount, last_used_at: new Date().toISOString() })
      .eq('key_id', input.key_id)
      .lt('sign_count', result.signCount);
  }
  return result.verdict;
}

/** Verifications allowed per profile per window. */
const VERIFY_RATE_LIMIT = 60;
const VERIFY_RATE_WINDOW_S = 3600;

const FIX_COLUMNS =
  't, lat, lon, speed_ms, accuracy_m, altitude_m, heading, accel_x, accel_y, accel_z, pressure_hpa, is_mock';

type DriveRow = {
  id: string;
  profile_id: string;
  vehicle_id: string | null;
  started_at: string;
  max_speed_ms: number | null;
  verification: string;
  verification_meta: Record<string, unknown> | null;
  fixes_purged_at: string | null;
};

/**
 * The profile's country, the one its national ceiling and country boards go
 * by. A failed read is an error, not "no country": read as null it would hold
 * the drive to the default ceiling and drop its country boards, silently.
 */
async function profileCountry(
  supabase: Db,
  profileId: string,
): Promise<{ country: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('country')
    .eq('id', profileId)
    .single();
  if (error) return { country: null, error: error.message as string };
  return { country: (data?.country as string | null) ?? null, error: null };
}

Deno.serve(async (req) => {
  const { drive_id, attestation } = await req.json().catch(() => ({}));
  if (!drive_id) return json({ error: 'drive_id required' }, 400);

  const serviceKey = serviceClientKey(Deno.env);
  if (!serviceKey) return json({ error: 'server key not configured' }, 500);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

  const { data: driveData, error: driveErr } = await supabase
    .from('drives')
    .select(
      'id, profile_id, vehicle_id, started_at, max_speed_ms, verification, verification_meta, fixes_purged_at',
    )
    .eq('id', drive_id)
    .single();
  const drive = driveData as DriveRow | null;
  // Only "no such row" (PGRST116 from .single(), or 22P02 for an id that is not
  // a uuid at all) is a 404. Anything else — the database unreachable, a
  // column this build expects that the schema does not have yet — is the
  // server's failure, and a 500 the app retries. A 404 would tell the app to
  // give up on the drive for good.
  if (driveErr && driveErr.code !== 'PGRST116' && driveErr.code !== '22P02') {
    return json({ error: `could not read drive: ${driveErr.message}` }, 500);
  }
  if (!drive) return json({ error: 'drive not found' }, 404);

  // Authorisation. This function runs with the service role and so bypasses
  // RLS entirely; without this check any authenticated user could name any
  // drive_id and drive someone else's verification. Callers are either the
  // drive's owner (the app, after upload) or our own server (internal
  // re-verification, e.g. after a maths fix) holding the legacy service-role
  // key or one of the new secret keys — see _server/keys.ts.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const isServiceCall = isServerKey(token, Deno.env);
  if (!isServiceCall) {
    const { data: caller } = await supabase.auth.getUser(token);
    if (!caller?.user || caller.user.id !== drive.profile_id) {
      return json({ error: 'forbidden' }, 403);
    }
  }

  /*
   * Fixes purged by the retention job. There is nothing left to re-derive
   * from, and re-deriving from nothing would reject the drive and delete its
   * board entries — so the verification made while the fixes existed stands,
   * and is returned as stored. Answered before the rate limit: it is a couple
   * of row reads, not a re-derivation.
   *
   * The national ceiling still applies, because it needs no fixes: a stored
   * top speed over it loses its top-speed board place (_server/verify.ts
   * rankPurgedTopSpeed). A drive purged before it was ever re-verified under
   * the ceilings would otherwise keep that place for good.
   *
   * Fixes uploaded again after the purge are deleted. A phone that still held
   * the drive unsent (its verify call never answered, or it was still pending
   * at 90 days — 0021 purges those too) re-uploads them before asking here,
   * and nothing else would ever remove them: the retention job never selects
   * a purged drive again. Usually there are none, and this deletes nothing.
   */
  if (drive.fixes_purged_at != null) {
    const meta = drive.verification_meta ?? {};
    const { error: refixErr } = await supabase
      .from('drive_fixes')
      .delete()
      .eq('drive_id', drive_id);
    if (refixErr) return json({ error: `could not clear re-uploaded fixes: ${refixErr.message}` }, 500);
    const { country: purgedCountry, error: purgedProfileErr } = await profileCountry(
      supabase,
      drive.profile_id,
    );
    if (purgedProfileErr) {
      return json({ error: `could not read profile: ${purgedProfileErr}` }, 500);
    }
    const ranking = rankPurgedTopSpeed({
      storedMeta: drive.verification_meta,
      maxSpeedMs: drive.max_speed_ms,
      country: purgedCountry,
    });
    if (ranking.withdraw) {
      const { error: withdrawErr } = await supabase
        .from('leaderboard_entries')
        .delete()
        .eq('drive_id', drive_id)
        .eq('metric', 'top_speed');
      if (withdrawErr) return json({ error: withdrawErr.message }, 500);
    }
    if (ranking.meta) {
      const { error: metaErr } = await supabase
        .from('drives')
        .update({ verification_meta: ranking.meta })
        .eq('id', drive_id);
      if (metaErr) return json({ error: metaErr.message }, 500);
    }
    return json({
      verification: drive.verification,
      checks: Array.isArray(meta.checks) ? meta.checks : [],
      top_speed_ranked: ranking.ranked,
      fixes_purged: true,
      achievements: [],
    });
  }

  /*
   * Rate limit. This function re-derives a whole drive — reads every fix, runs
   * the plausibility envelope, recomputes the summary and rewrites board
   * entries — so it costs real money per call, and it is reachable by anyone
   * with an account.
   *
   * Charged AFTER authorisation, so an attacker cannot burn a stranger's quota
   * by naming their drive_id, and skipped for service-role calls, which are our
   * own re-verification runs (a maths fix re-verifying every drive must not
   * rate-limit itself out).
   *
   * VERIFY_RATE_LIMIT verifications per hour. A real drive finishing every
   * minute for an hour would not reach it.
   */
  if (!isServiceCall) {
    const { data: allowed, error: rlErr } = await supabase.rpc('consume_rate_limit', {
      p_profile_id: drive.profile_id,
      p_bucket: 'verify_drive',
      p_limit: VERIFY_RATE_LIMIT,
      p_window_s: VERIFY_RATE_WINDOW_S,
    });
    // Fail CLOSED. If the limiter itself is broken, the safe answer for a
    // paid endpoint is to stop, not to wave everything through.
    if (rlErr || allowed === false) {
      return json(
        { error: 'rate limited', retry_after_s: VERIFY_RATE_WINDOW_S },
        429,
        { 'Retry-After': String(VERIFY_RATE_WINDOW_S) },
      );
    }
  }

  // Every fix, in pages — a single select stops at PostgREST's row cap and
  // would re-derive a long drive from its first 1000 fixes (_server/verify.ts).
  const { rows: fixRows, error: fixErr } = await readAllPages<FixRow>((from, to, withCount) =>
    supabase
      .from('drive_fixes')
      .select(FIX_COLUMNS, withCount ? { count: 'exact' } : undefined)
      .eq('drive_id', drive_id)
      .order('t')
      .range(from, to),
  );
  // A failed or incomplete read says nothing about the drive. Answer 500, which
  // the app retries, rather than rejecting a drive the server never saw whole.
  if (fixErr) return json({ error: `could not read fixes: ${fixErr}` }, 500);
  if (fixRows.length < 2) {
    await supabase
      .from('drives')
      .update({
        verification: 'rejected',
        verification_meta: { reason: 'insufficient fixes' },
      })
      .eq('id', drive_id);
    // A drive can be re-verified after having been accepted before (a retry, a
    // re-derivation). If it no longer stands up, its board entries must go
    // with it rather than linger as orphans nothing will ever correct.
    await supabase.from('leaderboard_entries').delete().eq('drive_id', drive_id);
    return json({ verification: 'rejected' });
  }

  // The country is the profile's as it stands now, at verification — the same
  // one the country board entries are filed under. Read before attestation, so
  // a failed read is retried before the device's assertion counter is spent.
  const { country, error: profileErr } = await profileCountry(supabase, drive.profile_id);
  if (profileErr) return json({ error: `could not read profile: ${profileErr}` }, 500);

  const fixes = fixRows.map(rowToFix);
  const nowMs = Date.now();

  // 1. Server-side re-derivation — the only numbers that count.
  const summary = summarize(fixes);

  // 2. Plausibility envelope. Never silently drop: the meta records exactly
  //    which checks ran and which failed, and the client shows it to the user.
  //    The shared envelope is the one the phone previews; the absolute speed
  //    ceiling and the clock check are the server's alone.
  const report = checkPlausibility(fixes);
  const clockCheck = checkClock(Date.parse(drive.started_at), fixes, nowMs);
  const checks = mergeChecks(report.checks, [checkSpeedCeiling(fixes), clockCheck]);

  // 2b. Attestation. Enforcement is a separate flag from verification on
  //     purpose: a verifier that wrongly rejects real hardware would quietly
  //     empty the boards, so this ships recording the verdict and starts
  //     gating only once it has been proven against real devices.
  const attestVerdict = await attestDrive(supabase, attestation, drive_id, drive.profile_id);
  const attestationRequired = Deno.env.get('ATTESTATION_REQUIRED') === 'true';

  const plausible = checks.every((c) => c.pass);
  const attestationBlocks = attestationRequired && attestVerdict.status !== 'passed';
  const verification = plausible && !attestationBlocks ? 'verified' : 'unverified';

  // 2c. Ranking, against the national ceiling of the profile's country.
  const topSpeed = rankTopSpeed(summary.maxSpeedMs, country);

  // 3. Privacy-trimmed route for anything public; full route stays server-side.
  const salt = Deno.env.get('TRIM_SALT') ?? 'gapped-default-trim-salt';
  const trimmed = trimRouteForSharing(fixes, salt, drive_id);

  const { error: updateErr } = await supabase
    .from('drives')
    .update({
      distance_m: summary.distanceM,
      duration_s: summary.durationS,
      // The driver's own record keeps the real top speed even when it is over
      // the limit; only the public board entry is withheld.
      max_speed_ms: summary.maxSpeedMs,
      avg_speed_ms: summary.avgSpeedMs,
      max_g: summary.maxG,
      avg_g: summary.avgG,
      zero_to_60_s: summary.zeroTo60S,
      route: lineStringWkt(trimmed),
      // Clients read the polyline, not the geography: PostgREST returns
      // geography as WKB hex, which is the trap that broke fix decoding.
      route_polyline: trimmed.length >= 2 ? encodePolyline(trimmed) : null,
      verification,
      verification_meta: {
        checks,
        recomputed: true,
        // Say why, in the drive's own record. "unverified" with no stated
        // cause is the thing users are owed an answer about.
        attestation_enforced: attestationRequired,
        ...(attestationBlocks ? { blocked_by: 'attestation' } : {}),
        // Whether the top speed was allowed onto the public boards, and the
        // national ceiling it was held to, so the app can say which limit.
        top_speed_ranked: topSpeed.ranked,
        top_speed_ceiling_ms: topSpeed.ceilingMs,
        ranking_country: country,
      },
      attestation: attestVerdict.status,
      attestation_meta: {
        platform: attestVerdict.platform,
        reason: attestVerdict.reason,
        ...(attestVerdict.details ? { details: attestVerdict.details } : {}),
      },
    })
    .eq('id', drive_id);
  if (updateErr) return json({ error: updateErr.message }, 500);

  // The untrimmed route lives in its own table with no grants to anon or
  // authenticated, so there is no privilege path to it from a client. That is
  // the enforcement of "route_full never leaves the server" — RLS is
  // row-level and could not have enforced it as a column on `drives`.
  const fullWkt = lineStringWkt(fixes);
  if (fullWkt) {
    await supabase
      .from('drive_routes_private')
      .upsert({ drive_id, route_full: fullWkt }, { onConflict: 'drive_id' });
  }

  // 4. Leaderboard entries — denormalised, written only here.
  const { data: vehicle } = drive.vehicle_id
    ? await supabase
        .from('vehicles')
        .select('drivetrain, curb_weight_kg, factory_power_hp, is_modified')
        .eq('id', drive.vehicle_id)
        .single()
    : { data: null };

  // Generated from src/vehicles/brackets.ts, not reimplemented: a second copy
  // of the tier boundaries could drift from the one the app shows, and a run
  // would then be ranked in a different class than the user was told.
  const bracket = bracketKey({
    drivetrain: (vehicle?.drivetrain ?? null) as Drivetrain | null,
    curbWeightKg: vehicle?.curb_weight_kg ?? null,
    factoryPowerHp: vehicle?.factory_power_hp ?? null,
    isModified: vehicle?.is_modified ?? false,
  });

  // A drive from the future goes on no board at all; a top speed over the
  // national limit goes on no top-speed board. Either way, entries an earlier
  // verification wrote for what is no longer ranked are removed.
  const plan = planBoard({ summary, clockPass: clockCheck.pass, topSpeedRanked: topSpeed.ranked });
  if (plan.remove.length > 0) {
    const { error: removeErr } = await supabase
      .from('leaderboard_entries')
      .delete()
      .eq('drive_id', drive_id)
      .in('metric', plan.remove);
    if (removeErr) return json({ error: removeErr.message }, 500);
  }

  const entries = boardEntries({
    plan,
    driveId: drive_id,
    profileId: drive.profile_id,
    country,
    bracket,
    verification,
    recordedAt: recordedAt(drive.started_at, nowMs),
  });
  if (entries.length > 0) {
    // Upsert, not insert. Re-verifying a drive used to duplicate every entry,
    // so one drive could hold several places on the same board; the unique
    // constraint from migration 0002 makes this collapse onto the existing row.
    const { error: boardErr } = await supabase
      .from('leaderboard_entries')
      .upsert(entries, { onConflict: 'drive_id, metric, scope, period' });
    if (boardErr) return json({ error: boardErr.message }, 500);
  }

  // 5. Achievements. Granted only here, only off verified drives, so one means
  //    as much as a verified run does. Unique per (profile, kind) — earning
  //    something twice is not an event — so these are plain upserts.
  const earned = verification === 'verified'
    ? await grantAchievements(supabase, drive.profile_id, summary)
    : [];

  return json({
    verification,
    summary,
    checks,
    top_speed_ranked: topSpeed.ranked,
    attestation: attestVerdict,
    achievements: earned,
  });
});

/**
 * Award what this drive proves, and nothing it does not.
 *
 * Every criterion is checked against what the server itself derived, never
 * the client's numbers.
 *
 * `country_number_one` ("Fastest in country") is no longer granted: an
 * achievement for topping a country's top-speed board rewards speed for its
 * own sake, which the public boards no longer do above the national limit.
 * Rows granted before this change are left alone here; whether they are shown
 * is the app's decision, and removing them is a migration's.
 */
async function grantAchievements(
  supabase: Db,
  profileId: string,
  summary: { distanceM: number; maxSpeedMs: number; zeroTo60S: number | null },
): Promise<string[]> {
  const kinds: { kind: string; payload: Record<string, unknown> }[] = [];

  const { count: verifiedCount } = await supabase
    .from('drives')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('verification', 'verified');

  if ((verifiedCount ?? 0) >= 1) {
    kinds.push({ kind: 'first_verified_run', payload: { max_speed_ms: summary.maxSpeedMs } });
  }
  if ((verifiedCount ?? 0) >= 10) {
    kinds.push({ kind: 'ten_verified_runs', payload: { count: verifiedCount } });
  }
  if (summary.zeroTo60S != null) {
    kinds.push({ kind: 'first_measured_launch', payload: { zero_to_60_s: summary.zeroTo60S } });
  }

  if (kinds.length === 0) return [];

  const { error } = await supabase.from('achievements').upsert(
    kinds.map((k) => ({ profile_id: profileId, kind: k.kind, payload: k.payload })),
    { onConflict: 'profile_id, kind', ignoreDuplicates: true },
  );
  if (error) return [];
  return kinds.map((k) => k.kind);
}
