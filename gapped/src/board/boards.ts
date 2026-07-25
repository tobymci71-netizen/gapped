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
import { MS_PER_MPH } from '@/drive/units';
import { BoardQuery, BoardRow } from './types';

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

function metricColumn(metric: BoardQuery['metric']): 'maxSpeedMs' | 'distanceM' | 'zeroTo60S' {
  switch (metric) {
    case 'top_speed':
      return 'maxSpeedMs';
    case 'distance':
      return 'distanceM';
    case 'zero_to_60':
      return 'zeroTo60S';
    case 'trip_count':
      return 'distanceM'; // count handled separately
  }
}

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
          value: s.mph * MS_PER_MPH,
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
  let yourValue: number | null = null;
  if (query.metric === 'trip_count') {
    yourValue = inPeriod.length;
  } else {
    const col = metricColumn(query.metric);
    const values = inPeriod
      .map((d) => d.summary?.[col])
      .filter((v): v is number => v != null && v > 0);
    if (values.length > 0) {
      yourValue = query.metric === 'zero_to_60' ? Math.min(...values) : Math.max(...values);
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
        value: b.seconds,
        // A published manufacturer claim is not a verified measurement.
        verification: 'unverified',
        kind: 'benchmark',
        note: 'manufacturer figure',
      });
    }
  } else if (query.period !== 'all') {
    const col = metricColumn(query.metric);
    const allValues = drives
      .map((d) => d.summary?.[col])
      .filter((v): v is number => v != null && v > 0);
    if (query.metric === 'trip_count') {
      rows.push({
        id: 'bench-your-best',
        rank: 0,
        username: `Your all-time — ${drives.length} drives`,
        country: null,
        vehicle: null,
        value: drives.length,
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
        value: Math.max(...allValues),
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
      value: yourValue,
      verification: 'unverified',
      kind: 'you',
    });
  }

  // Rank: ascending for 0-60 (lower is better), descending otherwise.
  rows.sort((a, b) =>
    query.metric === 'zero_to_60' ? a.value - b.value : b.value - a.value,
  );
  rows.forEach((r, i) => (r.rank = i + 1));

  const framing: string[] = [];
  framing.push(
    `${inPeriod.length} drive${inPeriod.length === 1 ? '' : 's'} recorded on this device ${
      query.period === 'all' ? 'all-time' : `this ${query.period === 'day' ? 'day' : query.period}`
    }.`,
  );
  framing.push('Global boards go live once your account syncs — every entry a real drive.');
  framing.push(LOCAL_FILTER_NOTE);

  return { rows, isSample: false, framing, source: 'local' };
}

/** Server board when Supabase is configured; falls back to local. */
export async function fetchBoard(
  query: BoardQuery,
  username: string | null,
): Promise<BoardResult> {
  const now = Date.now();
  if (!supabase) return buildLocalBoard(query, username, now);

  const since = new Date(periodStart(query.period, now)).toISOString();
  let q = supabase
    .from('leaderboard_entries')
    .select('id, profile_id, metric, value, verification, recorded_at, profiles(username, country)')
    .eq('metric', query.metric)
    .eq('scope', query.scope === 'friends' ? 'friends' : query.scope)
    .eq('period', query.period)
    .order('value', { ascending: query.metric === 'zero_to_60' })
    .limit(50);
  if (query.verifiedOnly) q = q.eq('verification', 'verified');
  if (query.period !== 'all') q = q.gte('recorded_at', since);

  const { data, error } = await q;
  if (error || !data) return buildLocalBoard(query, username, now);

  type EntryRow = {
    id: string;
    value: number;
    verification: string;
    profiles: { username: string; country: string | null } | null;
  };
  const rows: BoardRow[] = (data as unknown as EntryRow[]).map((e, i) => ({
    id: e.id,
    rank: i + 1,
    username: e.profiles?.username ?? 'driver',
    country: e.profiles?.country ?? null,
    vehicle: null,
    value: e.value,
    verification: e.verification === 'verified' ? 'verified' : 'unverified',
    kind: e.profiles?.username === username ? 'you' : 'user',
  }));

  if (rows.length === 0) return buildLocalBoard(query, username, now);
  return { rows, isSample: false, framing: [], source: 'server' };
}
