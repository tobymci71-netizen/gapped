/**
 * Tests for verify-drive's decisions (_server/verify.ts) and the national
 * speed ceilings they rank against (_shared/speedLimits.ts).
 *
 *   npm run test:edge
 *
 * The handler itself needs a live stack and is exercised end to end by
 * scripts/verify-roundtrip.mjs; everything that decides what reaches a public
 * board is pure and is tested here.
 */

import { assert, assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';
import type { Fix } from '../_shared/types.ts';
import { summarize } from '../_shared/stats.ts';
import { degrees, epochMs, metres, mps } from '../_shared/unit-types.ts';
import {
  DEFAULT_SPEED_CEILING_MS,
  SPEED_CEILINGS_MS,
  isOverSpeedCeiling,
  speedCeilingMs,
} from '../_shared/speedLimits.ts';
import {
  ABSOLUTE_SPEED_CEILING_MS,
  FIX_PAGE_SIZE,
  MAX_CLOCK_LEAD_MS,
  type Page,
  boardEntries,
  checkClock,
  checkSpeedCeiling,
  mergeChecks,
  planBoard,
  rankPurgedTopSpeed,
  rankTopSpeed,
  readAllPages,
  recordedAt,
  type VerifyCheck,
} from './verify.ts';

// ── fixtures ────────────────────────────────────────────────────────────────

const M_PER_DEG_LAT = (2 * Math.PI * 6371008.8) / 360;
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);

/**
 * A straight run due north at a constant speed, one fix per `stepMs`, with
 * the accuracy jitter a real receiver shows. Position advances to match the
 * speed, so positional and device speed agree.
 */
function cruise(opts: {
  n: number;
  speedMs: number;
  stepMs?: number;
  startT?: number;
  reportSpeed?: boolean;
  accuracyM?: number;
}): Fix[] {
  const { n, speedMs, stepMs = 1000, startT = T0, reportSpeed = true, accuracyM = 5 } = opts;
  const fixes: Fix[] = [];
  for (let i = 0; i < n; i++) {
    fixes.push({
      t: epochMs(startT + i * stepMs),
      lat: degrees(51.5 + (speedMs * (i * stepMs)) / 1000 / M_PER_DEG_LAT),
      lon: degrees(-0.12),
      speedMs: reportSpeed ? mps(speedMs) : null,
      accuracyM: metres(accuracyM + Math.sin(i) * 1.2),
      isMock: false,
    });
  }
  return fixes;
}

/**
 * A PostgREST stand-in: honours the inclusive range, truncates every response
 * at `maxRows` the way a real `max_rows` does, and answers the count when it
 * is asked for.
 */
function fakeTable<T>(rows: T[], maxRows = 1000) {
  const calls: { from: number; to: number; withCount: boolean }[] = [];
  const fetchPage = (from: number, to: number, withCount: boolean): Promise<Page<T>> => {
    calls.push({ from, to, withCount });
    const end = Math.min(to + 1, from + maxRows, rows.length);
    return Promise.resolve({
      data: rows.slice(from, Math.max(from, end)),
      error: null,
      count: withCount ? rows.length : null,
    });
  };
  return { fetchPage, calls };
}

const numbered = (n: number) => Array.from({ length: n }, (_, i) => i);

// ── paging ──────────────────────────────────────────────────────────────────

Deno.test('a drive of more than 1000 fixes is read whole, in order, a page at a time', async () => {
  const table = fakeTable(numbered(2500));
  const { rows, error } = await readAllPages(table.fetchPage);
  assertEquals(error, null);
  assertEquals(rows.length, 2500);
  assertEquals(rows, numbered(2500));
  // 0–999, 1000–1999, 2000–2999 (short): three requests, pages of 1000.
  assertEquals(
    table.calls.map((c) => [c.from, c.to]),
    [[0, 999], [1000, 1999], [2000, 2999]],
  );
  assertEquals(table.calls.map((c) => c.withCount), [true, false, false]);
});

Deno.test('a drive of exactly one full page stops at the count, not at an extra empty page', async () => {
  const table = fakeTable(numbered(FIX_PAGE_SIZE));
  const { rows, error } = await readAllPages(table.fetchPage);
  assertEquals(error, null);
  assertEquals(rows.length, FIX_PAGE_SIZE);
  assertEquals(table.calls.length, 1);
});

Deno.test('a server row cap below the page size still yields every row', async () => {
  // A project whose max_rows was lowered to 500 makes every page look short;
  // the count is what carries reading on.
  const table = fakeTable(numbered(1700), 500);
  const { rows, error } = await readAllPages(table.fetchPage);
  assertEquals(error, null);
  assertEquals(rows, numbered(1700));
  assertEquals(table.calls.map((c) => c.from), [0, 500, 1000, 1500]);
});

Deno.test('without a count, reading stops at the first short page', async () => {
  const rows = numbered(1200);
  const calls: number[] = [];
  const { rows: got, error } = await readAllPages<number>((from, to) => {
    calls.push(from);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: null });
  });
  assertEquals(error, null);
  assertEquals(got.length, 1200);
  assertEquals(calls, [0, 1000]);
});

Deno.test('a read that comes up short of the count is an error, never a truncated drive', async () => {
  // Rows vanish between the count and the read (a concurrent delete, a
  // misbehaving proxy): the drive must not be re-derived from what is left.
  const { rows, error } = await readAllPages<number>((from, to, withCount) =>
    Promise.resolve({
      data: numbered(1800).slice(from, to + 1),
      error: null,
      count: withCount ? 2500 : null,
    }),
  );
  assertEquals(rows.length, 1800);
  assertEquals(error, 'read 1800 of 2500 rows');
});

Deno.test('a failing page is reported, not swallowed', async () => {
  const { error } = await readAllPages<number>((from) =>
    Promise.resolve(
      from === 0
        ? { data: numbered(1000), error: null, count: 3000 }
        : { data: null, error: { message: 'connection reset' } },
    ),
  );
  assertEquals(error, 'connection reset');
});

Deno.test('paging fixes the >1000-fix re-derivation: distance and top speed come from every fix', async () => {
  // 1500 s of cruise at 30 m/s with the top speed only in the final stretch.
  // A single select capped at 1000 rows would have seen 999 s of 25 m/s.
  const fixes = [
    ...cruise({ n: 1000, speedMs: 25 }),
    ...cruise({ n: 500, speedMs: 30, startT: T0 + 1_000_000 }).map((f, i) => ({
      ...f,
      lat: degrees(51.5 + (25 * 999 + 25 + 30 * i) / M_PER_DEG_LAT),
    })),
  ];
  const table = fakeTable(fixes);
  const { rows, error } = await readAllPages(table.fetchPage);
  assertEquals(error, null);
  assertEquals(rows.length, 1500);

  const whole = summarize(rows);
  const truncated = summarize(fixes.slice(0, FIX_PAGE_SIZE));
  assertAlmostEquals(whole.maxSpeedMs, 30, 0.01);
  assertAlmostEquals(truncated.maxSpeedMs, 25, 0.01);
  assertAlmostEquals(whole.distanceM, 25 * 1000 + 30 * 499, 25 * 1000 * 0.001);
  assert(whole.distanceM > truncated.distanceM + 10_000);
});

// ── absolute speed ceiling ──────────────────────────────────────────────────

Deno.test('a fast road drive passes the absolute speed ceiling', () => {
  const c = checkSpeedCeiling(cruise({ n: 60, speedMs: 45 }));
  assertEquals(c.check, 'speed_ceiling');
  assert(c.pass, c.detail);
});

Deno.test('exactly 100 m/s is not above the ceiling', () => {
  assert(checkSpeedCeiling(cruise({ n: 30, speedMs: ABSOLUTE_SPEED_CEILING_MS })).pass);
});

Deno.test('a device-reported speed above 100 m/s fails speed_ceiling', () => {
  const c = checkSpeedCeiling(cruise({ n: 30, speedMs: 101 }));
  assert(!c.pass);
  assert(c.detail.startsWith('Device-reported speed reached 101.0 m/s'), c.detail);
});

Deno.test('a derived (positional) speed above 100 m/s fails speed_ceiling', () => {
  // No Doppler speed at all — the stream only moves its coordinates.
  const c = checkSpeedCeiling(cruise({ n: 30, speedMs: 110, reportSpeed: false }));
  assert(!c.pass);
  assert(c.detail.startsWith('Derived speed reached'), c.detail);
});

Deno.test('one glitched fix discarded by accuracy gating cannot fail the drive', () => {
  const fixes = cruise({ n: 30, speedMs: 30 });
  fixes[15] = { ...fixes[15], speedMs: mps(140), accuracyM: metres(60) };
  assert(checkSpeedCeiling(fixes).pass);
});

// ── clock ───────────────────────────────────────────────────────────────────

Deno.test('a drive that has already happened passes the clock check', () => {
  const fixes = cruise({ n: 600, speedMs: 20 });
  const now = fixes[fixes.length - 1].t + 1000;
  const c = checkClock(T0, fixes, now);
  assertEquals(c.check, 'clock');
  assert(c.pass, c.detail);
});

Deno.test('honest clock drift under five minutes is tolerated', () => {
  const fixes = cruise({ n: 10, speedMs: 20, startT: T0 + 4 * 60_000 });
  assert(checkClock(T0 + 4 * 60_000, fixes, T0 + 4 * 60_000 - 1).pass);
  assert(checkClock(T0 + MAX_CLOCK_LEAD_MS, [], T0).pass);
});

Deno.test('a start time more than five minutes ahead fails the clock check', () => {
  const c = checkClock(T0 + 6 * 60_000, [], T0);
  assert(!c.pass);
  assertEquals(c.detail, 'Drive timestamps run 6 min ahead of the server clock.');
});

Deno.test('a single fix from the future fails the clock check even with an honest start', () => {
  const fixes = cruise({ n: 10, speedMs: 20, startT: T0 - 60_000 });
  fixes[9] = { ...fixes[9], t: epochMs(T0 + 10 * 60_000) };
  assert(!checkClock(T0 - 60_000, fixes, T0).pass);
});

Deno.test('server checks join the shared ones without duplicating a name', () => {
  const shared: VerifyCheck[] = [
    { check: 'teleport', pass: true, detail: 'a' },
    { check: 'speed_ceiling', pass: true, detail: 'shared' },
  ];
  const server: VerifyCheck[] = [
    { check: 'speed_ceiling', pass: false, detail: 'server' },
    { check: 'clock', pass: true, detail: 'b' },
  ];
  assertEquals(mergeChecks(shared, server).map((c) => `${c.check}:${c.detail}`), [
    'teleport:a',
    'speed_ceiling:shared',
    'clock:b',
  ]);
});

Deno.test('recorded_at is the start time, but never later than now', () => {
  const past = new Date(T0 - 3_600_000).toISOString();
  assertEquals(recordedAt(past, T0), past);
  assertEquals(recordedAt(new Date(T0 + 120_000).toISOString(), T0), new Date(T0).toISOString());
});

// ── national ceilings ───────────────────────────────────────────────────────

Deno.test('national ceilings convert from the posted unit exactly', () => {
  assertAlmostEquals(speedCeilingMs('GB'), 70 * 0.44704, 1e-9);
  assertAlmostEquals(speedCeilingMs('GG'), 35 * 0.44704, 1e-9);
  assertAlmostEquals(speedCeilingMs('JE'), 40 * 0.44704, 1e-9);
  assertAlmostEquals(speedCeilingMs('US'), 85 * 0.44704, 1e-9);
  assertAlmostEquals(speedCeilingMs('IE'), 120 / 3.6, 1e-9);
});

Deno.test('no-limit, unknown and missing countries fall back to 130 km/h', () => {
  assertAlmostEquals(DEFAULT_SPEED_CEILING_MS, 130 / 3.6, 1e-9);
  for (const c of ['IM', 'DE', 'ZZ', '', null, undefined]) {
    assertEquals(speedCeilingMs(c), DEFAULT_SPEED_CEILING_MS, String(c));
  }
});

Deno.test('country codes are matched case- and whitespace-insensitively', () => {
  assertEquals(speedCeilingMs(' gb '), speedCeilingMs('GB'));
});

Deno.test('every ceiling is a sane car speed limit — catches an mph/km/h slip', () => {
  for (const [code, ms] of SPEED_CEILINGS_MS) {
    assert(/^[A-Z]{2}$/.test(code), code);
    // 30 mph … 160 km/h. A limit typed in the wrong unit lands outside it.
    assert(ms >= 30 * 0.44704 && ms <= 160 / 3.6, `${code}: ${ms} m/s`);
    assert(ms < ABSOLUTE_SPEED_CEILING_MS);
  }
});

Deno.test('a top speed exactly at the limit is ranked; just above it is not', () => {
  const gb = speedCeilingMs('GB');
  assert(!isOverSpeedCeiling(gb, 'GB'));
  assert(isOverSpeedCeiling(mps(gb + 0.01), 'GB'));
});

Deno.test('ranking uses the profile country: 40 mph is fine in Jersey, not in Guernsey', () => {
  const v = mps(40 * 0.44704);
  assertEquals(rankTopSpeed(v, 'JE').ranked, true);
  assertEquals(rankTopSpeed(v, 'GG').ranked, false);
  assertAlmostEquals(rankTopSpeed(v, 'GG').ceilingMs, 35 * 0.44704, 1e-9);
});

// ── purged fixes ────────────────────────────────────────────────────────────

Deno.test('a purged drive over the national limit loses its top-speed place and is marked', () => {
  // Verified before the ceilings existed: the older meta has no ranking keys.
  const legacy = { checks: [{ check: 'teleport', pass: true, detail: 'a' }], recomputed: true };
  const r = rankPurgedTopSpeed({ storedMeta: legacy, maxSpeedMs: 36, country: 'GB' });
  assertEquals(r.ranked, false);
  assertEquals(r.withdraw, true);
  assertEquals(r.meta?.checks, legacy.checks); // everything stored is kept
  assertEquals(r.meta?.top_speed_ranked, false);
  assertEquals(r.meta?.ranking_country, 'GB');
  assertAlmostEquals(r.meta?.top_speed_ceiling_ms as number, 70 * 0.44704, 1e-9);
});

Deno.test('a purged drive already marked not ranked is withdrawn again but not rewritten', () => {
  const r = rankPurgedTopSpeed({
    storedMeta: { top_speed_ranked: false, top_speed_ceiling_ms: 31.2928, ranking_country: 'GB' },
    maxSpeedMs: 36,
    country: 'GB',
  });
  assertEquals(r, { ranked: false, withdraw: true, meta: null });
});

Deno.test('a purged drive within the limit keeps its stored answer and is never re-added', () => {
  assertEquals(
    rankPurgedTopSpeed({ storedMeta: { top_speed_ranked: true }, maxSpeedMs: 30, country: 'GB' }),
    { ranked: true, withdraw: false, meta: null },
  );
  // Unranked under an older country, within the limit of the current one: the
  // stored answer stands — nothing without its fixes can put it back on a board.
  assertEquals(
    rankPurgedTopSpeed({ storedMeta: { top_speed_ranked: false }, maxSpeedMs: 36, country: 'US' }),
    { ranked: false, withdraw: false, meta: null },
  );
  assertEquals(
    rankPurgedTopSpeed({ storedMeta: null, maxSpeedMs: 30, country: 'GB' }),
    { ranked: null, withdraw: false, meta: null },
  );
});

Deno.test('a purged drive with no usable top speed is left as stored', () => {
  for (const maxSpeedMs of [null, Number.NaN]) {
    assertEquals(
      rankPurgedTopSpeed({ storedMeta: { top_speed_ranked: true }, maxSpeedMs, country: 'GG' }),
      { ranked: true, withdraw: false, meta: null },
    );
  }
});

// ── board plan ──────────────────────────────────────────────────────────────

const summary = { maxSpeedMs: 30, distanceM: 13_590, zeroTo60S: 5.02 };

Deno.test('a ranked, on-time drive writes every metric and removes nothing', () => {
  const plan = planBoard({ summary, clockPass: true, topSpeedRanked: true });
  assertEquals(plan.write.map((w) => w.metric), ['top_speed', 'distance', 'zero_to_60']);
  assertEquals(plan.remove, []);
});

Deno.test('a top speed over the national limit writes no top_speed entry and removes any old one', () => {
  const plan = planBoard({ summary, clockPass: true, topSpeedRanked: false });
  assertEquals(plan.write.map((w) => w.metric), ['distance', 'zero_to_60']);
  assertEquals(plan.remove, ['top_speed']);
});

Deno.test('a metric with no value is never fabricated, and its old entry goes', () => {
  const plan = planBoard({
    summary: { ...summary, zeroTo60S: null },
    clockPass: true,
    topSpeedRanked: true,
  });
  assertEquals(plan.write.map((w) => w.metric), ['top_speed', 'distance']);
  assertEquals(plan.remove, ['zero_to_60']);
});

Deno.test('a drive from the future goes on no board at all', () => {
  const plan = planBoard({ summary, clockPass: false, topSpeedRanked: true });
  assertEquals(plan.write, []);
  assertEquals(plan.remove, ['top_speed', 'distance', 'zero_to_60']);
});

Deno.test('board entries cover both scopes and all periods, and only the planned metrics', () => {
  const plan = planBoard({ summary, clockPass: true, topSpeedRanked: false });
  const at = new Date(T0).toISOString();
  const rows = boardEntries({
    plan,
    driveId: 'd',
    profileId: 'p',
    country: 'GB',
    bracket: 'any|stock|open',
    verification: 'verified',
    recordedAt: at,
  });
  assertEquals(rows.length, 2 * 2 * 4); // 2 metrics × 2 scopes × 4 periods
  assert(rows.every((r) => r.metric !== 'top_speed'));
  assert(rows.every((r) => r.recorded_at === at && r.bracket_key === 'any|stock|open'));
  assertEquals(rows.filter((r) => r.scope === 'country').every((r) => r.country === 'GB'), true);
  assertEquals(rows.filter((r) => r.scope === 'global').every((r) => r.country === null), true);
});

Deno.test('a profile with no country is ranked globally only', () => {
  const plan = planBoard({ summary, clockPass: true, topSpeedRanked: true });
  const rows = boardEntries({
    plan,
    driveId: 'd',
    profileId: 'p',
    country: null,
    bracket: 'any|stock|open',
    verification: 'verified',
    recordedAt: new Date(T0).toISOString(),
  });
  assertEquals(rows.length, 3 * 4);
  assert(rows.every((r) => r.scope === 'global'));
});
