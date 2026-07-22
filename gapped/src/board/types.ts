export type BoardMetric = 'top_speed' | 'distance' | 'trip_count' | 'zero_to_60';
export type BoardScope = 'global' | 'country' | 'friends';
export type BoardPeriod = 'day' | 'week' | 'month' | 'all';

export type BoardRow = {
  id: string;
  rank: number;
  username: string;
  /** ISO country code or null. */
  country: string | null;
  vehicle: string | null;
  /** SI value (m/s, metres, count, seconds) — converted at render. */
  value: number;
  verification: 'verified' | 'unverified';
  /**
   * Benchmark ghosts (spec §C2): non-human pace targets, visually distinct,
   * no profile link. `sample` rows exist only pre-first-drive and are
   * labelled SAMPLE (spec §C6). Never presented as real people.
   */
  kind: 'user' | 'you' | 'benchmark' | 'sample';
  /** Provenance line for benchmarks, e.g. "manufacturer figure". */
  note?: string;
};

export type BoardQuery = {
  metric: BoardMetric;
  scope: BoardScope;
  period: BoardPeriod;
  verifiedOnly: boolean;
};
