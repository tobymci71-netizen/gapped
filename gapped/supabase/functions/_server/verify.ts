/**
 * verify-drive's decisions, without its I/O.
 *
 * Everything here is pure (or, for paging, takes the fetch as a parameter), so
 * the rules that decide what reaches a public board are unit-tested in
 * verify_test.ts rather than only exercised against a live stack.
 *
 * These checks are server-only on purpose. The shared plausibility envelope
 * (_shared/plausibility.ts) is generated from the app's src/drive/plausibility.ts
 * and runs on the phone as a preview; the absolute speed ceiling and the clock
 * check need the server's clock and its authority, so they live here. If the
 * shared envelope ever gains a check of the same name, mergeChecks keeps the
 * shared one and drops this one, so a drive is never judged twice.
 */

import type { Fix, PlausibilityCheck } from '../_shared/types.ts';
import { deriveSpeeds, gateFixes } from '../_shared/stats.ts';
import type { MetresPerSecond } from '../_shared/unit-types.ts';
import { isOverSpeedCeiling, speedCeilingMs } from '../_shared/speedLimits.ts';

/** A plausibility check, widened with the checks only the server runs. */
export type VerifyCheck = {
  check: PlausibilityCheck['check'] | 'speed_ceiling' | 'clock';
  pass: boolean;
  detail: string;
};

// ── paging ──────────────────────────────────────────────────────────────────

/**
 * PostgREST caps every select at `max_rows` (1000 here and on hosted
 * Supabase) and truncates silently. A drive is easily longer than that — at
 * the recorder's slowest rate, 1 Hz, 1000 fixes is under 17 minutes — so
 * reading fixes in one select re-derived long drives from their first 1000
 * fixes only: wrong distance, wrong top speed, and still stamped 'verified'.
 */
export const FIX_PAGE_SIZE = 1000;

export type Page<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};

/**
 * Reads every row through `fetchPage(from, to, withCount)` — an inclusive
 * range, as PostgREST's `.range()` takes it — page by page.
 *
 * The first page also asks for the exact row count, and reading stops once
 * that many rows are in; without a count it stops at the first short page. A
 * server whose `max_rows` is lower than FIX_PAGE_SIZE makes every page look
 * short, so the count is what lets reading carry on from where the rows
 * actually ended — and what turns a read that still comes up short into an
 * error rather than a quietly truncated drive.
 */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<Page<T>>,
  pageSize = FIX_PAGE_SIZE,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  let expected: number | null = null;
  for (;;) {
    const from = rows.length;
    const first = from === 0;
    const { data, error, count } = await fetchPage(from, from + pageSize - 1, first);
    if (error) return { rows, error: error.message };
    if (first && typeof count === 'number') expected = count;
    const page = data ?? [];
    for (const row of page) rows.push(row);
    if (page.length === 0) break;
    if (expected != null ? rows.length >= expected : page.length < pageSize) break;
  }
  if (expected != null && rows.length < expected) {
    return { rows, error: `read ${rows.length} of ${expected} rows` };
  }
  return { rows, error: null };
}

// ── server-only checks ──────────────────────────────────────────────────────

/**
 * 100 m/s is 360 km/h (224 mph). Only a handful of production cars can reach
 * it at all, and no public-road limit anywhere comes near it; a stream
 * reporting it is spoofed or broken. The teleport check (150 m/s, position
 * jumps) catches the crude spoofs; this catches a smooth one that simply
 * drives too fast.
 */
export const ABSOLUTE_SPEED_CEILING_MS = 100;

/** How far ahead of the server's clock a drive's timestamps may run. */
export const MAX_CLOCK_LEAD_MS = 5 * 60 * 1000;

/**
 * Speed ceiling over the fixes that count — those that survive accuracy
 * gating, the same set summarize() takes its numbers from. A fix discarded for
 * bad accuracy contributes nothing to the drive, so it cannot fail it either.
 *
 * "Derived" is the smoothed per-fix series max speed is taken from (Doppler
 * where present, positional otherwise); "reported" is the raw device speed,
 * because a spoofer controls that field directly.
 */
export function checkSpeedCeiling(rawFixes: Fix[]): VerifyCheck {
  const fixes = gateFixes(rawFixes);
  let derived = 0;
  for (const v of deriveSpeeds(fixes)) if (v > derived) derived = v;
  let reported = 0;
  for (const f of fixes) if (f.speedMs != null && f.speedMs > reported) reported = f.speedMs;

  const worst = Math.max(derived, reported);
  if (worst <= ABSOLUTE_SPEED_CEILING_MS) {
    return {
      check: 'speed_ceiling',
      pass: true,
      detail: `No speed above ${ABSOLUTE_SPEED_CEILING_MS} m/s (360 km/h).`,
    };
  }
  const which = reported >= derived ? 'Device-reported' : 'Derived';
  return {
    check: 'speed_ceiling',
    pass: false,
    detail: `${which} speed reached ${worst.toFixed(1)} m/s, above the ${ABSOLUTE_SPEED_CEILING_MS} m/s (360 km/h) ceiling for a road vehicle.`,
  };
}

/**
 * Timestamps from the future. A drive's start and its fixes come from the
 * phone's clock; one set ahead would sit on the "today" board for as long as
 * the lead lasts, and is how a replayed or hand-made trace usually gives itself
 * away. Five minutes absorbs any honest clock drift.
 */
export function checkClock(startedAtMs: number, rawFixes: Fix[], nowMs: number): VerifyCheck {
  let latest = Number.isFinite(startedAtMs) ? startedAtMs : -Infinity;
  for (const f of rawFixes) if (f.t > latest) latest = f.t;
  const lead = latest - nowMs;
  if (lead <= MAX_CLOCK_LEAD_MS) {
    return {
      check: 'clock',
      pass: true,
      detail: 'Drive timestamps are not ahead of the server clock.',
    };
  }
  return {
    check: 'clock',
    pass: false,
    detail: `Drive timestamps run ${Math.round(lead / 60_000)} min ahead of the server clock.`,
  };
}

/** Shared checks first, then any server check the shared set does not run. */
export function mergeChecks(
  shared: readonly VerifyCheck[],
  server: readonly VerifyCheck[],
): VerifyCheck[] {
  const seen = new Set(shared.map((c) => c.check));
  return [...shared, ...server.filter((c) => !seen.has(c.check))];
}

// ── boards ──────────────────────────────────────────────────────────────────

/**
 * The board timestamp. A start time ahead of the server's clock (within the
 * clock check's tolerance) would otherwise hold a "day" board place past its
 * day; a drive cannot have happened later than now.
 */
export function recordedAt(startedAtIso: string, nowMs: number): string {
  const started = Date.parse(startedAtIso);
  return new Date(Number.isFinite(started) ? Math.min(started, nowMs) : nowMs).toISOString();
}

/** The metrics verify-drive writes one entry per drive for. */
export const PER_DRIVE_METRICS = ['top_speed', 'distance', 'zero_to_60'] as const;
export type PerDriveMetric = (typeof PER_DRIVE_METRICS)[number];

export type TopSpeedRanking = {
  /** False exactly when the top speed is above the country's ceiling. */
  ranked: boolean;
  ceilingMs: MetresPerSecond;
};

/** Ranked against the profile's country at verification time. */
export function rankTopSpeed(
  maxSpeedMs: MetresPerSecond,
  country: string | null | undefined,
): TopSpeedRanking {
  return { ranked: !isOverSpeedCeiling(maxSpeedMs, country), ceilingMs: speedCeilingMs(country) };
}

export type PurgedRanking = {
  /** What to report: false when over the ceiling, else whatever was stored. */
  ranked: boolean | null;
  /** Delete this drive's top_speed entries. */
  withdraw: boolean;
  /** The verification_meta to write, or null to leave it as it is. */
  meta: Record<string, unknown> | null;
};

/**
 * The national ceiling for a drive whose fixes the retention job has purged.
 *
 * Nothing can be re-derived, but ranking needs no fixes: the stored top speed
 * is held to the ceiling of the profile's country as it is now. Without this, a
 * drive verified before the ceilings existed (or under one since lowered) and
 * purged before anything re-verified it would keep its top-speed board place
 * for good. It only ever withdraws a place — a purged drive is never put on a
 * board it is not already on — so the stored figure, which for a drive the
 * server never accepted may be the phone's own, can do no harm here.
 */
export function rankPurgedTopSpeed(input: {
  storedMeta: Record<string, unknown> | null;
  maxSpeedMs: number | null;
  country: string | null;
}): PurgedRanking {
  const meta = input.storedMeta ?? {};
  const stored = typeof meta.top_speed_ranked === 'boolean' ? meta.top_speed_ranked : null;
  const top = input.maxSpeedMs;
  if (typeof top !== 'number' || !Number.isFinite(top)) {
    return { ranked: stored, withdraw: false, meta: null };
  }
  const ranking = rankTopSpeed(top as MetresPerSecond, input.country);
  if (ranking.ranked) return { ranked: stored, withdraw: false, meta: null };
  return {
    ranked: false,
    withdraw: true,
    // Recorded once, so the driver's own screen says "not ranked" too.
    meta:
      stored === false
        ? null
        : {
            ...meta,
            top_speed_ranked: false,
            top_speed_ceiling_ms: ranking.ceilingMs,
            ranking_country: input.country,
          },
  };
}

export type BoardPlan = {
  write: { metric: PerDriveMetric; value: number }[];
  /**
   * Metrics whose existing entries for this drive must go. Re-verification
   * replaces a drive's board presence; it does not add to it, so an entry
   * from an earlier verification that this one would not write (a top speed
   * now over the ceiling, a 0-60 no longer detected) is removed, not left to
   * linger where nothing will ever correct it.
   */
  remove: PerDriveMetric[];
};

export function planBoard(input: {
  summary: { maxSpeedMs: number; distanceM: number; zeroTo60S: number | null };
  /** False when the clock check failed — such a drive goes on no board. */
  clockPass: boolean;
  topSpeedRanked: boolean;
}): BoardPlan {
  const { summary, clockPass, topSpeedRanked } = input;
  const candidates: { metric: PerDriveMetric; value: number | null }[] = [
    { metric: 'top_speed', value: topSpeedRanked ? summary.maxSpeedMs : null },
    { metric: 'distance', value: summary.distanceM },
    { metric: 'zero_to_60', value: summary.zeroTo60S },
  ];
  const write = clockPass
    ? candidates.flatMap((c) => (c.value == null ? [] : [{ metric: c.metric, value: c.value }]))
    : [];
  const written = new Set(write.map((w) => w.metric));
  return { write, remove: PER_DRIVE_METRICS.filter((m) => !written.has(m)) };
}

export type BoardEntry = {
  drive_id: string;
  profile_id: string;
  metric: PerDriveMetric;
  value: number;
  scope: 'global' | 'country';
  country: string | null;
  bracket_key: string;
  period: 'day' | 'week' | 'month' | 'all';
  verification: string;
  recorded_at: string;
};

const PERIODS: BoardEntry['period'][] = ['day', 'week', 'month', 'all'];

/** One row per metric × scope × period — the shape the boards read. */
export function boardEntries(input: {
  plan: BoardPlan;
  driveId: string;
  profileId: string;
  country: string | null;
  bracket: string;
  verification: string;
  recordedAt: string;
}): BoardEntry[] {
  const scopes: { scope: BoardEntry['scope']; country: string | null }[] = [
    { scope: 'global', country: null },
    ...(input.country ? [{ scope: 'country' as const, country: input.country }] : []),
  ];
  return input.plan.write.flatMap((m) =>
    scopes.flatMap((s) =>
      PERIODS.map((period) => ({
        drive_id: input.driveId,
        profile_id: input.profileId,
        metric: m.metric,
        value: m.value,
        scope: s.scope,
        country: s.country,
        bracket_key: input.bracket,
        period,
        verification: input.verification,
        recorded_at: input.recordedAt,
      })),
    ),
  );
}
