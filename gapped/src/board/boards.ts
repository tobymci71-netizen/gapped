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

import { countryByCode } from '@/data/countries';
import { listDrives } from '@/drive/wal';
import { ensureUserId, supabase } from '@/lib/supabase';
import { DriveSummary } from '@/drive/types';
import { MS_PER_MPH } from '@/drive/units';
import { count, metres, mps, raw, seconds } from '@/types/units';
import { SAMPLE_BOARD_ROWS } from './sampleRows';
import { BoardMetric, BoardPeriod, BoardQuery, BoardRow, BoardValue } from './types';

/** Published manufacturer 0-60 mph figures — benchmark ghosts, not people. */
const ZERO_TO_60_BENCHMARKS: { name: string; seconds: number }[] = [
  { name: 'BMW M3 (G80) — manufacturer figure', seconds: 4.1 },
  { name: 'VW Golf R (Mk8) — manufacturer figure', seconds: 4.7 },
  { name: 'Honda Civic Type R (FL5) — manufacturer figure', seconds: 5.4 },
  { name: 'Toyota GR86 — manufacturer figure', seconds: 6.1 },
  { name: 'Mazda MX-5 (ND 2.0) — manufacturer figure', seconds: 6.5 },
];


/**
 * Periods are rolling windows counted back from now, on both the local board
 * and the server's board_top: a drive at 22:00 yesterday is inside 'day' at
 * 09:00 today. A global board has no single midnight to count from, so the
 * windows stay rolling and the words describing them say so — the pills read
 * "24 hours", "7 days" and "30 days", not "Today", "Week" and "Month".
 */
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
   * Whether the filters that produced this board were applied. 'local' means
   * there is no backend, or it could not be reached, and the rows are this
   * device's own drives: scope and verified-only cannot be applied to them, so
   * the screen disables those controls rather than leaving them inert.
   *
   * 'server' means the board answers the query as asked — including when the
   * answer is empty. It used to mean "the server returned rows", so an empty
   * Friends or verified-only board came back 'local', disabled the very pill
   * that would undo it, and trapped the screen on that filter until restart.
   */
  source: 'local' | 'server';
};

/** A vehicle class with drivers in it, as the class picker offers it. */
export type Bracket = { key: string; drivers: number };

/** How a period reads in a sentence. See periodStart: these are rolling windows. */
export function periodPhrase(period: BoardPeriod): string {
  switch (period) {
    case 'day':
      return 'in the last 24 hours';
    case 'week':
      return 'in the last 7 days';
    case 'month':
      return 'in the last 30 days';
    case 'all':
      return 'all-time';
  }
}

/**
 * Footer for a server board with nobody on it: says which slice is empty,
 * because "No entries yet" alone cannot tell an empty friends list from a
 * quiet week. Every clause is a filter the query really applied.
 */
export function emptyBoardFraming(query: BoardQuery, country: string | null): string[] {
  const who =
    query.scope === 'friends'
      ? 'Neither you nor anyone you follow has'
      : query.scope === 'country'
        ? `Nobody in ${countryByCode(country)?.name ?? 'your country'} has`
        : 'Nobody has';
  const what = `${query.verifiedOnly ? 'a verified run' : 'a run'}${query.bracket ? ' in this class' : ''}`;
  const when = query.period === 'all' ? 'yet' : periodPhrase(query.period);
  const lines = [`${who} ${what} ${when}.`];
  // The toggle that widens the board sits above it; on an empty board it is
  // the one thing worth knowing about.
  if (query.verifiedOnly) lines.push('Unverified runs are hidden while VERIFIED is on.');
  return lines;
}

const emptyServerBoard = (framing: string[]): BoardResult => ({
  rows: [],
  isSample: false,
  framing,
  source: 'server',
});

/** Same rows, same order, same values — nothing a re-render would change. */
function sameRows(a: BoardRow[], b: BoardRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => {
      const s = b[i];
      return (
        r.id === s.id &&
        r.rank === s.rank &&
        r.username === s.username &&
        r.metric === s.metric &&
        raw(r.value) === raw(s.value) &&
        r.verification === s.verification &&
        r.kind === s.kind &&
        r.vehicle === s.vehicle &&
        r.note === s.note
      );
    })
  );
}

/**
 * What a board fetch should leave on screen.
 *
 * `quiet` is a refetch of the slice already showing — the tab regaining focus
 * — as opposed to a new filter, which clears to the skeleton first. Two
 * things are different about a quiet refetch:
 *
 *  - An identical answer keeps the existing object, so the list does not
 *    re-render and the row entrances do not replay on every tab switch.
 *  - A server board is not swapped for this device's local history because
 *    one refetch could not reach the server. The board on screen was a true
 *    answer a moment ago; the local one would put this device's drives under
 *    a World or Friends heading.
 */
export function settleBoard(
  prev: BoardResult | null,
  next: BoardResult,
  quiet: boolean,
): BoardResult {
  if (!quiet || prev == null) return next;
  if (prev.source === 'server' && next.source === 'local') return prev;
  const same =
    prev.source === next.source &&
    prev.isSample === next.isSample &&
    prev.framing.length === next.framing.length &&
    prev.framing.every((f, i) => f === next.framing[i]) &&
    sameRows(prev.rows, next.rows);
  return same ? prev : next;
}

/** True when two class lists offer the same classes with the same counts. */
export function sameBrackets(a: Bracket[], b: Bracket[]): boolean {
  return (
    a.length === b.length && a.every((x, i) => x.key === b[i].key && x.drivers === b[i].drivers)
  );
}

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
      SAMPLE_BOARD_ROWS.forEach((s, i) =>
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
    `${inPeriod.length} drive${inPeriod.length === 1 ? '' : 's'} recorded on this device ${periodPhrase(
      query.period,
    )}.`,
  );
  framing.push('Global boards go live once your account syncs — every entry a real drive.');
  framing.push(LOCAL_FILTER_NOTE);

  return { rows, isSample: false, framing, source: 'local' };
}

/**
 * Server board when Supabase is configured; falls back to local only when
 * there is no backend or it could not be reached.
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
  // to every country, which is the bug this call replaced. It is still an
  // answer to the filter as chosen, so it stays a server result: falling back
  // to local here disabled the scope pill and stranded the screen on Country.
  if (query.scope === 'country' && !country) {
    return emptyServerBoard(['Your profile has no country, so there is no country board to show.']);
  }

  // The friends scope resolves against auth.uid(): asked before the anonymous
  // session exists, it answered as nobody. The id also marks your own rows.
  const userId = await ensureUserId();
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
    profile_id: string | null;
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
    // By account, not by name: a username match highlighted another driver's
    // rows as yours whenever they held the name you have locally.
    kind:
      userId != null
        ? e.profile_id === userId
          ? 'you'
          : 'user'
        : e.username != null && e.username === username
          ? 'you'
          : 'user',
    bracketKey: e.bracket_key,
  }));

  // An empty board is a true answer, not a failure — for every slice, not
  // only a bracket. Falling back to the local board here swapped a real empty
  // Friends, Country or verified-only board for this device's own history
  // under a heading that said otherwise, and marked it 'local', which disabled
  // the scope pill and VERIFIED toggle needed to leave that slice.
  if (rows.length === 0) return emptyServerBoard(emptyBoardFraming(query, country));
  return { rows, isSample: false, framing: [], source: 'server' };
}

/**
 * Classes with drivers on the board this query would show, so the picker
 * offers only classes that lead somewhere. Takes the board's own filters —
 * window, scope, verified-only — because a count taken over a wider slice
 * than the board offered classes that then opened empty (migration 0016).
 *
 * Null when the server could not be asked, which is not the same as "no
 * classes": the screen keeps what it already offers rather than hiding the
 * picker, and dropping the chosen class, over a blip in signal.
 */
export async function fetchBrackets(
  query: Omit<BoardQuery, 'bracket'>,
  country: string | null = null,
): Promise<Bracket[] | null> {
  if (!supabase) return [];
  // Same rule as fetchBoard: no country, no country board, so no classes on it.
  if (query.scope === 'country' && !country) return [];
  const { data, error } = await supabase.rpc('board_brackets', {
    p_metric: query.metric,
    p_period: query.period,
    p_scope: query.scope,
    p_country: country,
    p_verified_only: query.verifiedOnly,
  });
  if (error || !data) return null;
  return (data as { bracket_key: string; entries: number }[]).map((b) => ({
    key: b.bracket_key,
    drivers: Number(b.entries),
  }));
}
