/**
 * Which version of a proof screen to show, decided from real counts only.
 *
 * docs/ONBOARDING.md, rule 1: every number on a proof screen comes from the
 * backend, and below a threshold — or offline — the screen switches to an
 * honest early-stage variant with no number in it. The reference app this flow
 * was studied from prints "1M+ miles" and "2.4x faster" whatever the data says;
 * Gapped's pitch is the board you can believe, so the first screens are not
 * allowed to be where it starts making numbers up. These functions are where
 * that is enforced, so the screens never compare a count to a threshold
 * themselves.
 *
 * Pure, and kept apart from the fetches in ./socialProof (which re-exports
 * everything here) so that the network layer's imports cannot reach the tests.
 */

/**
 * One make's row from `make_popularity(p_kind)`. Counts distinct drivers by
 * their main vehicle's make, for one vehicle kind.
 */
export type MakePopularityRow = {
  make: string;
  /** Distinct drivers whose main vehicle is this make. */
  drivers: number;
  /** 1 = most drivers. The server's ranking; never recomputed here. */
  rank: number;
  /** This make's drivers as a PERCENTAGE of all drivers of the kind, 0–100. */
  share: number;
};

/** `country_activity(p_country)`. */
export type CountryActivity = {
  /** Distinct drivers from the country with a verified run on the board. */
  drivers: number;
  /** Distinct drivers from the country who recorded a drive yesterday. */
  droveYesterday: number;
};

/** A row on the make-proof chart. */
export type MakeNeighbor = MakePopularityRow & {
  /** The person's own make — drawn lit (red), the others dimmer. */
  isYours: boolean;
};

export type BrandProof =
  | {
      kind: 'ranked';
      /** Drivers of the person's make — the big number. */
      count: number;
      /** "#{rank} most popular on Gapped". */
      rank: number;
      /** Percentage, 0–100. Print it with `formatShare`. */
      share: number;
      /** Up to five rows centred on the person's make, ranked order. */
      neighbors: MakeNeighbor[];
    }
  | { kind: 'early' };

export type CountryProof =
  | { kind: 'yesterday'; n: number }
  | { kind: 'onBoard'; n: number }
  | { kind: 'early' };

/** The ranked make variant needs at least this many drivers of the make… */
export const MIN_MAKE_DRIVERS = 5;
/** …and at least this many makes with any drivers, or "#1" means nothing. */
export const MIN_MAKES_WITH_DRIVERS = 3;
/** Both country lines need at least this many drivers behind them. */
export const MIN_COUNTRY_DRIVERS = 10;
/** Rows on the make chart. */
export const MAKE_CHART_ROWS = 5;

/** A count the screen may print: a finite number, at least `min`. */
function atLeast(n: number, min: number): boolean {
  return Number.isFinite(n) && n >= min;
}

/**
 * Makes are matched ignoring case and surrounding space: the catalogue and
 * "Not listed? Add it yourself" can disagree on "BMW" and "bmw" for the same
 * badge, and the person's own make must still be found.
 */
function sameMake(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The make-proof variant for `make`, from `make_popularity` rows.
 *
 * Ranked when the make has at least MIN_MAKE_DRIVERS drivers and at least
 * MIN_MAKES_WITH_DRIVERS makes have any; early otherwise — including no data
 * (null: offline or no backend), no make chosen, and a make nobody else drives.
 */
export function brandProof(
  rows: readonly MakePopularityRow[] | null | undefined,
  make: string | null | undefined,
): BrandProof {
  if (!rows || !make) return { kind: 'early' };

  const populated = rows.filter((r) => atLeast(r.drivers, 1));
  if (populated.length < MIN_MAKES_WITH_DRIVERS) return { kind: 'early' };

  // Ranked order, ties broken stably so the chart cannot reshuffle between
  // renders: more drivers first, then the make's name.
  const ordered = [...populated].sort(
    (a, b) => a.rank - b.rank || b.drivers - a.drivers || a.make.localeCompare(b.make),
  );
  const at = ordered.findIndex((r) => sameMake(r.make, make));
  if (at < 0) return { kind: 'early' };

  const yours = ordered[at];
  if (!atLeast(yours.drivers, MIN_MAKE_DRIVERS) || !Number.isFinite(yours.rank)) {
    return { kind: 'early' };
  }

  // Centred on the person's make where the list allows, pinned to either end
  // where it does not: the top make shows the four below it, the last shows
  // the four above.
  const start = Math.max(
    0,
    Math.min(at - Math.floor(MAKE_CHART_ROWS / 2), ordered.length - MAKE_CHART_ROWS),
  );
  const neighbors = ordered
    .slice(start, start + MAKE_CHART_ROWS)
    .map((r, i) => ({ ...r, isYours: start + i === at }));

  return {
    kind: 'ranked',
    count: yours.drivers,
    rank: yours.rank,
    share: Number.isFinite(yours.share) ? yours.share : 0,
    neighbors,
  };
}

/**
 * The country-proof line, in the order docs/ONBOARDING.md prefers: drivers who
 * drove yesterday, then drivers on the board, then the early variant. Each
 * needs MIN_COUNTRY_DRIVERS behind it. Null (offline, no backend) is early.
 */
export function countryProof(activity: CountryActivity | null | undefined): CountryProof {
  if (!activity) return { kind: 'early' };
  if (atLeast(activity.droveYesterday, MIN_COUNTRY_DRIVERS)) {
    return { kind: 'yesterday', n: activity.droveYesterday };
  }
  if (atLeast(activity.drivers, MIN_COUNTRY_DRIVERS)) {
    return { kind: 'onBoard', n: activity.drivers };
  }
  return { kind: 'early' };
}

/**
 * A share for "{share}% of all Gapped drivers", without the share sign — the
 * copy supplies it. Whole percent; a make under one percent prints "<1"
 * rather than rounding to a "0" that says nobody drives it.
 */
export function formatShare(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return '0';
  if (share < 1) return '<1';
  return String(Math.min(100, Math.round(share)));
}
