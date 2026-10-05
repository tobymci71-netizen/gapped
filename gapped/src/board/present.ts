/**
 * How the Ranks tab words and measures a board: the figure and unit each row
 * shows, the hero's position and gap line, the length of each row's streak
 * bar, and what VoiceOver says. Pure, so the screen's copy rules — above all
 * the safety rule on gap copy — are tested rather than remembered.
 *
 * The safety rule (docs/DESIGN.md, "Honesty and safety in the visuals"): a gap
 * to the driver ahead ("4.7 mi behind jayden_r") is shown for Distance and
 * Drives only. Top speed and 0–60 are numbers a driver could chase on a public
 * road, so their boards state a position and a value and nothing that frames
 * another driver's figure as something to close in on.
 */

import { distanceForDisplay, speedForDisplay, type UnitPref } from '@/drive/units';
import { metres, raw } from '@/types/units';
import type { BoardMetric, BoardPeriod, BoardRow, BoardScope } from './types';

/**
 * Where the rows on a board came from: the server answering the query as
 * asked, this device's own drives (no backend, or it could not be reached),
 * or the labelled SAMPLE board shown before a first drive.
 */
export type BoardOrigin = 'server' | 'device' | 'sample';

/** A board's origin, from what fetchBoard returned (BoardResult). */
export function boardOrigin(r: { source: 'server' | 'local'; isSample: boolean }): BoardOrigin {
  return r.source === 'server' ? 'server' : r.isSample ? 'sample' : 'device';
}

/** The caption's name for a board built from this device's drives. */
export const DEVICE_SCOPE = 'This device';
/** ...and for the SAMPLE board. */
export const SAMPLE_SCOPE = 'Sample';

/**
 * Who a board ranks, as its caption, its hero and VoiceOver name it. A board
 * built from this device's drives is not the World board, whatever the inert
 * segment above it still shows: a big "P1" over "World · longest drive" there
 * would claim first place in the world for a ranking of your own drives. With
 * no board landed yet (`origin` null) it names the scope chosen.
 */
export function scopeName(
  scope: BoardScope,
  countryName: string | null,
  origin: BoardOrigin | null,
): string {
  if (origin === 'device') return DEVICE_SCOPE;
  if (origin === 'sample') return SAMPLE_SCOPE;
  switch (scope) {
    case 'global':
      return 'World';
    case 'friends':
      return 'Friends';
    case 'country':
      return countryName ?? 'Country';
  }
}

/** A row's value, split so the figure and its unit can be set in different faces. */
export type ValueParts = {
  /** "33.8", "65", "12", "4.12". */
  figure: string;
  /** "mi", "km/h", "drives", "s". */
  unit: string;
  /** How VoiceOver should say it: "33.8 miles", not "33.8 m i". */
  spoken: string;
};

/**
 * The figure and unit a row shows. Rounds exactly as formatDistance and
 * formatSpeed do (one decimal for distance, whole numbers for speed), so a
 * value reads the same on the board as everywhere else in the app.
 */
export function valueParts(row: BoardRow, pref: UnitPref): ValueParts {
  switch (row.metric) {
    case 'top_speed': {
      const { value, unit } = speedForDisplay(row.value, pref);
      const figure = `${Math.round(value)}`;
      return {
        figure,
        unit,
        spoken: `${figure} ${unit === 'mph' ? 'miles per hour' : 'kilometres per hour'}`,
      };
    }
    case 'distance': {
      const { value, unit } = distanceForDisplay(row.value, pref);
      const figure = value.toFixed(1);
      return { figure, unit, spoken: `${figure} ${unit === 'mi' ? 'miles' : 'kilometres'}` };
    }
    case 'trip_count': {
      const n = Math.round(row.value);
      const unit = n === 1 ? 'drive' : 'drives';
      return { figure: `${n}`, unit, spoken: `${n} ${unit}` };
    }
    case 'zero_to_60': {
      const figure = row.value.toFixed(2);
      return { figure, unit: 's', spoken: `${figure} seconds` };
    }
    default: {
      const unhandled: never = row;
      return unhandled;
    }
  }
}

/**
 * What a board ranks by, as a phrase. Distance is each driver's longest single
 * drive in the window — their best entry (board_top, migration 0020; the
 * local board's `better`) — not the miles they added up, so it says so.
 */
export function boardBasis(metric: BoardMetric): string {
  switch (metric) {
    case 'distance':
      return 'longest drive';
    case 'trip_count':
      return 'drives recorded';
    case 'top_speed':
      return 'top speed';
    case 'zero_to_60':
      return 'best 0–60 time';
  }
}

/** The window, as the hero and the period chip's VoiceOver label say it. */
export function periodWords(period: BoardPeriod): string {
  switch (period) {
    case 'day':
      return 'last 24 hours';
    case 'week':
      return 'last 7 days';
    case 'month':
      return 'last 30 days';
    case 'all':
      return 'all-time';
  }
}

/** True for the two metrics that may show a gap to the driver ahead. */
export function showsGap(metric: BoardMetric): boolean {
  return metric === 'distance' || metric === 'trip_count';
}

/** The line under the hero's figure: how far the driver directly ahead is. */
export type GapLine = { text: string; spoken: string };

/**
 * "4.7 mi behind jayden_r", or null.
 *
 * Null for Top speed and 0–60, always (see the header). Null too when the row
 * ahead is not another real driver — a BENCHMARK ghost on the device board is
 * nobody to be behind — and when there is no row ahead (P1).
 */
export function gapLine(rows: BoardRow[], you: BoardRow, pref: UnitPref): GapLine | null {
  if (!showsGap(you.metric)) return null;
  const ahead = rows.find((r) => r.rank === you.rank - 1);
  if (!ahead || ahead.kind !== 'user') return null;
  const name = ahead.username;
  if (you.metric === 'distance' && ahead.metric === 'distance') {
    const gap = Math.max(0, raw(ahead.value) - raw(you.value));
    const { value, unit } = distanceForDisplay(metres(gap), pref);
    const figure = value.toFixed(1);
    if (Number(figure) === 0) return { text: `Level with ${name}`, spoken: `Level with ${name}` };
    return {
      text: `${figure} ${unit} behind ${name}`,
      spoken: `${figure} ${unit === 'mi' ? 'miles' : 'kilometres'} behind ${name}`,
    };
  }
  if (you.metric === 'trip_count' && ahead.metric === 'trip_count') {
    const gap = Math.max(0, Math.round(raw(ahead.value) - raw(you.value)));
    if (gap === 0) return { text: `Level with ${name}`, spoken: `Level with ${name}` };
    const text = `${gap} drive${gap === 1 ? '' : 's'} behind ${name}`;
    return { text, spoken: text };
  }
  return null;
}

/** The viewer's place on a board, for the hero. */
export type BoardHeroModel = {
  you: BoardRow;
  /** The row directly ahead (rank − 1), whoever it is. */
  ahead: BoardRow | null;
  /** P1, when it is not already `ahead` and is not you. */
  leader: BoardRow | null;
};

/** The viewer's row and the rows ahead of it, or null when they are not on the board. */
export function boardHero(rows: BoardRow[]): BoardHeroModel | null {
  const you = rows.find((r) => r.kind === 'you');
  if (!you) return null;
  const ahead = rows.find((r) => r.rank === you.rank - 1) ?? null;
  const leader = you.rank > 2 ? (rows.find((r) => r.rank === 1) ?? null) : null;
  return { you, ahead, leader };
}

/**
 * Each row's bar length as a share of the board's best, 0–1, keyed by row id.
 * Every bar starts at the same origin and the best reaches the edge: for 0–60,
 * where lower wins, that is the quickest time, and a slower time is shorter.
 */
export function barProgress(rows: BoardRow[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  const values = rows.map((r) => raw(r.value)).filter((v) => Number.isFinite(v) && v > 0);
  if (values.length === 0) {
    rows.forEach((r) => out.set(r.id, 0));
    return out;
  }
  const lowerWins = rows[0]?.metric === 'zero_to_60';
  const best = lowerWins ? Math.min(...values) : Math.max(...values);
  for (const r of rows) {
    const v = raw(r.value);
    const p = !Number.isFinite(v) || v <= 0 ? 0 : lowerWins ? best / v : v / best;
    out.set(r.id, Math.max(0, Math.min(1, p)));
  }
  return out;
}

/** A row's tags, in the order they are drawn after the name. */
export type RowTag = 'you' | 'sample' | 'benchmark' | 'unverified';

/**
 * What a row says about itself besides its name. Verified rows carry a tick
 * instead of a tag; SAMPLE and BENCHMARK rows are never people, so they never
 * carry "Unverified" (they are labelled for what they are).
 */
export function rowTags(row: BoardRow): RowTag[] {
  const tags: RowTag[] = [];
  if (row.kind === 'you') tags.push('you');
  if (row.kind === 'sample') tags.push('sample');
  if (row.kind === 'benchmark') tags.push('benchmark');
  if ((row.kind === 'you' || row.kind === 'user') && row.verification === 'unverified') {
    tags.push('unverified');
  }
  return tags;
}

/** True when the row shows the verified tick. */
export function rowVerified(row: BoardRow): boolean {
  return (row.kind === 'you' || row.kind === 'user') && row.verification === 'verified';
}

/**
 * The small line under a row's name: the vehicle, or a ghost's provenance
 * ("manufacturer figure", "your own record"). Null when there is none.
 */
export function rowSubLine(row: BoardRow): string | null {
  return row.vehicle || row.note || null;
}

/**
 * A row as one VoiceOver sentence: "3, toby, you, verified, 33.8 miles". The
 * row is a single element, so its sub line is said here too, last: a 0–60
 * benchmark's "manufacturer figure" is what makes it honest.
 */
export function rowAccessibilityLabel(row: BoardRow, pref: UnitPref): string {
  const parts = [`${row.rank}`, row.username];
  for (const tag of rowTags(row)) parts.push(tag);
  if (rowVerified(row)) parts.push('verified');
  parts.push(valueParts(row, pref).spoken);
  const sub = rowSubLine(row);
  if (sub) parts.push(sub);
  return parts.join(', ');
}

/**
 * The hero as one VoiceOver sentence: "You're P3 on the World board for
 * longest drive: 33.8 miles, last 7 days. 4.7 miles behind jayden_r." On a
 * board of this device's drives: "You're P1 on this device's board for…".
 */
export function heroAccessibilityLabel(
  hero: BoardHeroModel,
  board: { scopeName: string; metric: BoardMetric; period: BoardPeriod },
  gap: GapLine | null,
  pref: UnitPref,
): string {
  const value = valueParts(hero.you, pref).spoken;
  const where =
    board.scopeName === DEVICE_SCOPE ? "this device's board" : `the ${board.scopeName} board`;
  const head = `You're P${hero.you.rank} on ${where} for ${boardBasis(
    board.metric,
  )}: ${value}, ${periodWords(board.period)}.`;
  return gap ? `${head} ${gap.spoken}.` : head;
}

/** The hero's road: tags over the cars ahead, and whether your own car is on it. */
export type HeroScene = {
  /** Tag over the car directly ahead ("P2"), or null for no car there. */
  ahead: string | null;
  /** Tag over the leader further up the road ("P1"), or null. */
  leader: string | null;
  /** Your car, nearest the camera, tagged "You". */
  you: boolean;
};

/** The road with nobody on it: the absent hero's scene, and the speed boards'. */
export const EMPTY_ROAD: HeroScene = { ahead: null, leader: null, you: false };

/** What the hero shows, decided here so the safety rule is tested, not remembered. */
export type HeroView =
  | {
      kind: 'placed';
      position: number;
      /** "33.8 mi". */
      value: string;
      /** "last 7 days". */
      period: string;
      gap: string | null;
      scene: HeroScene;
      accessibilityLabel: string;
    }
  | { kind: 'absent'; title: string; detail: string; sample: boolean };

/**
 * The hero for a board, or null when the board is empty (the list's empty
 * state says so instead).
 *
 * On the board: position, value, window and — Distance and Drives only — the
 * gap to the driver ahead, over a road with their tail lights. On Top speed
 * and 0–60 the road is empty: no cars ahead, no gap, nothing to close in on.
 *
 * Not on it: the SAMPLE board says it is one; any other board invites a drive
 * ("verified" only while the verified filter really applies).
 */
export function heroView(
  rows: BoardRow[],
  board: {
    metric: BoardMetric;
    period: BoardPeriod;
    scopeName: string;
    isSample: boolean;
    verifiedShown: boolean;
  },
  pref: UnitPref,
): HeroView | null {
  if (rows.length === 0) return null;
  const hero = boardHero(rows);
  if (hero) {
    const { you, ahead, leader } = hero;
    const gap = gapLine(rows, you, pref);
    const v = valueParts(you, pref);
    const chase = showsGap(board.metric);
    return {
      kind: 'placed',
      position: you.rank,
      value: `${v.figure} ${v.unit}`,
      period: periodWords(board.period),
      gap: gap?.text ?? null,
      scene: chase
        ? {
            ahead: ahead ? `P${ahead.rank}` : null,
            leader: leader && leader !== ahead ? `P${leader.rank}` : null,
            you: true,
          }
        : EMPTY_ROAD,
      accessibilityLabel: heroAccessibilityLabel(hero, board, gap, pref),
    };
  }
  if (board.isSample) {
    return {
      kind: 'absent',
      sample: true,
      title: 'Sample board',
      detail: 'Record your first drive to start the real one.',
    };
  }
  return {
    kind: 'absent',
    sample: false,
    title: board.verifiedShown
      ? 'Record a verified drive to join the board'
      : 'Record a drive to join the board',
    detail: `${board.scopeName} · ${periodWords(board.period)}`,
  };
}
