import { Count, Metres, MetresPerSecond, Seconds } from '@/types/units';

export type BoardMetric = 'top_speed' | 'distance' | 'trip_count' | 'zero_to_60';
export type BoardScope = 'global' | 'country' | 'friends';
export type BoardPeriod = 'day' | 'week' | 'month' | 'all';

/**
 * The quantity a row is ranked by, tagged with the metric it belongs to.
 *
 * `value` used to be a bare `number` documented as "SI value (m/s, metres,
 * count, seconds)". Which of those four it actually held depended on
 * `BoardQuery.metric`, and two switches in two files had to agree about it:
 * `metricColumn` in boards.ts picked which summary field to read, and
 * `formatValue` in board.tsx picked which formatter to apply. Nothing tied
 * them together, so a board could render one quantity in another quantity's
 * units and typecheck cleanly — the same species of bug as the 313 km/h
 * speedometer, which also passed typecheck, lint and 238 tests.
 *
 * Tagging the value makes the two switches share a discriminant. Reading
 * `row.value` now narrows on `row.metric`, so a distance cannot be handed to
 * a speed formatter, and adding a fifth metric fails to compile in both files
 * until both handle it.
 */
export type BoardValue =
  | { metric: 'top_speed'; value: MetresPerSecond }
  | { metric: 'distance'; value: Metres }
  | { metric: 'zero_to_60'; value: Seconds }
  | { metric: 'trip_count'; value: Count };

type BoardRowBase = {
  id: string;
  rank: number;
  username: string;
  /** Canonical ISO country code or null — see src/data/countries.ts. */
  country: string | null;
  vehicle: string | null;
  verification: 'verified' | 'unverified';
  /**
   * Benchmark ghosts (spec §C2): non-human pace targets, visually distinct,
   * no profile link. `sample` rows exist only pre-first-drive and are
   * labelled SAMPLE (spec §C6). Never presented as real people.
   */
  kind: 'user' | 'you' | 'benchmark' | 'sample';
  /** Bracket the entry was ranked in, when the server supplied one. */
  bracketKey?: string | null;
  /** Provenance line for benchmarks, e.g. "manufacturer figure". */
  note?: string;
};

/** A row carries its metric, so its value carries its unit. */
export type BoardRow = BoardRowBase & BoardValue;

export type BoardQuery = {
  metric: BoardMetric;
  scope: BoardScope;
  period: BoardPeriod;
  verifiedOnly: boolean;
  /**
   * Vehicle-class bracket, or null for the open board across all classes.
   * The difference between "fastest phone in the world" and "fastest stock
   * Miata" — see src/vehicles/brackets.ts.
   */
  bracket?: string | null;
};
