/**
 * Board data source. When Supabase is configured, boards come from
 * leaderboard_entries (server-written only). Offline / pre-backend, boards
 * are honest local constructions:
 *
 *  - your own runs from the local WAL,
 *  - clearly-labelled BENCHMARK ghosts (published manufacturer figures and
 *    your own bests — spec §C2),
 *  - pre-first-drive only: a SAMPLE board, labelled as such, swapped out on
 *    first drive (spec §C6).
 *
 * NO FABRICATED USERS, EVER (spec Part C). Every 'user' row traces to a real
 * account; ghosts and samples are visually and semantically distinct kinds.
 */

import { listDrives } from '@/drive/wal';
import { supabase } from '@/lib/supabase';
import { DriveSummary } from '@/drive/types';
import { MS_PER_MPH } from '@/drive/units';
import { count, metres, mps, raw, seconds } from '@/types/units';
import { BoardMetric, BoardQuery, BoardRow, BoardValue } from './types';

/** Published manufacturer 0-60 mph figures — benchmark ghosts, not people. */
const ZERO_TO_60_BENCHMARKS: { name: string; seconds: number }[] = [
  { name: 'BMW M3 (G80) — manufacturer figure', seconds: 4.1 },
  { name: 'VW Golf R (Mk8) — manufacturer figure', seconds: 4.7 },
  { name: 'Honda Civic Type R (FL5) — manufacturer figure', seconds: 5.4 },
  { name: 'Toyota GR86 — manufacturer figure', seconds: 6.1 },
  { name: 'Mazda MX-5 (ND 2.0) — manufacturer figure', seconds: 6.5 },
];

const SAMPLE_ROWS: { username: string; vehicle: string; mph: number }[] = [
  { username: 'sample_driver_1', vehicle: 'BMW M240i', mph: 82 },
  { username: 'sample_driver_2', vehicle: 'Golf GTI', mph: 76 },
  { username: 'sample_driver_3', vehicle: 'MX-5 ND', mph: 71 },
  { username: 'sample_driver_4', vehicle: 'Civic Type R', mph: 69 },
  { username: 'sample_driver_5', vehicle: 'GR Yaris', mph: 64 },
];

function periodStart(period: BoardQuery['period'], now: number): number {
  const DAY = 86_400_000;
  switch (period) {
    case 'day':
      return now - DAY;
    case 'week':
      return now - 7 * DAY;
    case 'month':
      return now - 30 * DAY;
    case 'all':
      return 0;
  }
}

/**
 * Read the field a metric ranks on out of a drive summary, tagged with its
 * metric so the unit travels with the number.
 *
 * This replaces `metricColumn`, which returned a field name and — because
 * `trip_count` has no summary field — returned `'distanceM'` for it with the
 * comment "count handled separately". Anything that forgot to handle it
 * separately silently ranked drives by distance and labelled the result a
 * count. Returning null for trip_count makes that impossible: there is no
 * field to read, so the type says so.
 */
function summaryValue(metric: BoardMetric, s: DriveSummary): BoardValue | null {
  switch (metric) {
    case 'top_speed':
      return { metric, value: s.maxSpeedMs };
    case 'distance':
      return { metric, value: s.distanceM };
    case 'zero_to_60':
      return s.zeroTo60S == null ? null : { metric, value: s.zeroTo60S };
    case 'trip_count':
      // Not a summary field. Counts are derived from how many drives there
      // are, never from what is inside one.
      return null;
  }
}

/**
 * Tag a plain SI number coming from outside with the metric it belongs to.
 *
 * The board RPC returns `value` as a bare JSON number whose unit is a property
 * of the row's metric, not of the value — the same situation as SQLite and the
 * sensors, and handled the same way: asserted once, at the boundary, in one
 * place rather than at each use.
 */
function boardValue(metric: BoardMetric, si: number): BoardValue {
  switch (metric) {
    case 'top_speed':
      return { metric, value: mps(si) };
    case 'distance':
      return { metric, value: metres(si) };
    case 'zero_to_60':
      return { metric, value: seconds(si) };
    case 'trip_count':
      return { metric, value: count(si) };
  }
}

/** Compare two same-metric values; lower wins for 0-60, higher for the rest. */
const better = (metric: BoardMetric, a: BoardValue, b: BoardValue): BoardValue =>
  metric === 'zero_to_60'
    ? raw(a.value) <= raw(b.value)
      ? a
      : b
    : raw(a.value) >= raw(b.value)
      ? a
      : b;

export type BoardResult = {
  rows: BoardRow[];
  /** True when showing the pre-first-drive SAMPLE board. */
  isSample: boolean;
  /** Honest aggregate framing lines (spec §C3) — all derived, all true. */
  framing: string[];
  /**
   * Where the rows came from. A local board holds only your own device's
   * drives, so scope and verified-only cannot be applied to it — the screen
   * disables those controls rather than leaving them inert.
   */
  source: 'local' | 'server';
};

/** Explains the controls the local board cannot honour. */
const LOCAL_FILTER_NOTE =
  'Scope and verified-only filters go live once your account syncs — this board is built from the drives on this device.';

/** Local (offline) board construction. */
export function buildLocalBoard(query: BoardQuery, username: string | null, now: number): BoardResult {
  const drives = listDrives().filter((d) => d.status === 'finalized' && d.summary);
  const since = periodStart(query.period, now);
  const inPeriod = drives.filter((d) => d.startedAt >= since);

  const rows: BoardRow[] = [];

  if (drives.length === 0) {
    // SAMPLE board — labelled, swapped for real data on first drive.
    if (query.metric === 'top_speed') {
      SAMPLE_ROWS.forEach((s, i) =>
        rows.push({
          id: `sample-${i}`,
          rank: i + 1,
          username: s.username,
          country: null,
          vehicle: s.vehicle,
          metric: 'top_speed',
          value: mps(s.mph * MS_PER_MPH),
          // Not a measurement at all, so never coloured as a verified one.
          verification: 'unverified',
          kind: 'sample',
          note: 'SAMPLE — replaced by real drivers after your first drive',
        }),
      );
    }
    return {
      rows,
      isSample: true,
      framing: [
        'This is a sample board. Record your first drive to start the real one.',
        LOCAL_FILTER_NOTE,
      ],
      source: 'local',
    };
  }

  // Your entries.
  let yourValue: BoardValue | null = null;
  if (query.metric === 'trip_count') {
    yourValue = { metric: 'trip_count', value: count(inPeriod.length) };
  } else {
    const values = inPeriod
      .map((d) => (d.summary ? summaryValue(query.metric, d.summary) : null))
      .filter((v): v is BoardValue => v != null && raw(v.value) > 0);
    if (values.length > 0) {
      yourValue = values.reduce((a, b) => better(query.metric, a, b));
    }
  }

  // Benchmark ghosts for 0-60; "your best" ghost for others when in a
  // narrower period than all-time.
  if (query.metric === 'zero_to_60') {
    for (const b of ZERO_TO_60_BENCHMARKS) {
      rows.push({
        id: `bench-${b.name}`,
        rank: 0,
        username: b.name,
        country: null,
        vehicle: null,
        metric: 'zero_to_60',
        value: seconds(b.seconds),
        // A published manufacturer claim is not a verified measurement.
        verification: 'unverified',
        kind: 'benchmark',
        note: 'manufacturer figure',
      });
    }
  } else if (query.period !== 'all') {
    const allValues = drives
      .map((d) => (d.summary ? summaryValue(query.metric, d.summary) : null))
      .filter((v): v is BoardValue => v != null && raw(v.value) > 0);
    if (query.metric === 'trip_count') {
      rows.push({
        id: 'bench-your-best',
        rank: 0,
        username: `Your all-time — ${drives.length} drive${drives.length === 1 ? '' : 's'}`,
        country: null,
        vehicle: null,
        metric: 'trip_count',
        value: count(drives.length),
        // Your own device's record: measured, but not server-verified.
        verification: 'unverified',
        kind: 'benchmark',
        note: 'your own record',
      });
    } else if (allValues.length > 0) {
      rows.push({
        id: 'bench-your-best',
        rank: 0,
        username: 'Your all-time best',
        country: null,
        vehicle: null,
        ...allValues.reduce((a, b) => better(query.metric, a, b)),
        verification: 'unverified',
        kind: 'benchmark',
        note: 'your own record',
      });
    }
  }

  if (yourValue != null) {
    rows.push({
      id: 'you',
      rank: 0,
      username: username ? `@${username}` : 'You',
      country: null,
      vehicle: null,
      ...yourValue,
      verification: 'unverified',
      kind: 'you',
    });
  }

  // Rank: ascending for 0-60 (lower is better), descending otherwise.
  rows.sort((a, b) =>
    query.metric === 'zero_to_60'
      ? raw(a.value) - raw(b.value)
      : raw(b.value) - raw(a.value),
  );
  rows.forEach((r, i) => (r.rank = i + 1));

  const framing: string[] = [];
  framing.push(
    `${inPeriod.length} drive${inPeriod.length === 1 ? '' : 's'} recorded on this device ${
      query.period === 'all' ? 'all-time' : query.period === 'day' ? 'today' : `this ${query.period}`
    }.`,
  );
  framing.push('Global boards go live once your account syncs — every entry a real drive.');
  framing.push(LOCAL_FILTER_NOTE);

  return { rows, isSample: false, framing, source: 'local' };
}

/**
 * Server board when Supabase is configured; falls back to local.
 *
 * Ranking is done by the `board_top` RPC rather than by selecting
 * leaderboard_entries directly: the board has to be one row per driver (their
 * best), the country board has to actually filter on country, and the friends
 * board is the global board narrowed to people you have added. See migration
 * 0004 — all three are things a flat select got wrong.
 */
export async function fetchBoard(
  query: BoardQuery,
  username: string | null,
  country: string | null = null,
): Promise<BoardResult> {
  const now = Date.now();
  if (!supabase) return buildLocalBoard(query, username, now);

  // A country board with no country is not a board — it would silently widen
  // to every country, which is the bug this call replaced.
  if (query.scope === 'country' && !country) return buildLocalBoard(query, username, now);

  const { data, error } = await supabase.rpc('board_top', {
    p_metric: query.metric,
    p_scope: query.scope,
    p_period: query.period,
    p_country: country,
    p_verified_only: query.verifiedOnly,
    p_limit: 50,
    p_bracket: query.bracket ?? null,
  });
  if (error || !data) return buildLocalBoard(query, username, now);

  type EntryRow = {
    id: string;
    username: string | null;
    country: string | null;
    value: number;
    verification: string;
    bracket_key: string | null;
  };
  const rows: BoardRow[] = (data as EntryRow[]).map((e, i) => ({
    id: e.id,
    rank: i + 1,
    username: e.username ?? 'driver',
    country: e.country ?? null,
    vehicle: null,
    // The network boundary: `value` arrives as a bare JSON number whose unit
    // is fixed by the metric we asked for, so it is tagged here on the way in.
    ...boardValue(query.metric, e.value),
    verification: e.verification === 'verified' ? 'verified' : 'unverified',
    kind: e.username != null && e.username === username ? 'you' : 'user',
    bracketKey: e.bracket_key,
  }));

  // A bracket board with nobody in it is a true answer, not a failure. Falling
  // back to the local board here would swap a real empty class for this
  // device's own history under a heading that says otherwise.
  if (rows.length === 0 && query.bracket) {
    return {
      rows: [],
      isSample: false,
      framing: ['Nobody has a verified run in this class yet.'],
      source: 'server',
    };
  }

  if (rows.length === 0) return buildLocalBoard(query, username, now);
  return { rows, isSample: false, framing: [], source: 'server' };
}

/** Brackets that actually have entries, so the picker offers only real classes. */
export async function fetchBrackets(
  metric: BoardQuery['metric'],
  period: BoardQuery['period'],
): Promise<{ key: string; drivers: number }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('board_brackets', {
    p_metric: metric,
    p_period: period,
  });
  if (error || !data) return [];
  return (data as { bracket_key: string; entries: number }[]).map((b) => ({
    key: b.bracket_key,
    drivers: Number(b.entries),
  }));
}
