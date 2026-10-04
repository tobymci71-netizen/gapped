/**
 * The "Top speed" card on the carousel's second page: three rows of the real
 * board when there are three to show, otherwise three sample rows that say
 * they are samples (docs/ONBOARDING.md, rule 1, "No invented numbers").
 *
 * No backend here: the fetch lives with the page (./BoardPage), and only types
 * come from the board module, so these rules are tested without one.
 */

import type { BoardResult } from '@/board/boards';
import { SAMPLE_BOARD_ROWS } from '@/board/sampleRows';
import { MS_PER_MPH } from '@/drive/units';
import { mps, raw, type MetresPerSecond } from '@/types/units';

/** Rows on the card. The reference shows a podium, and so does this. */
export const INTRO_BOARD_SIZE = 3;

export type IntroBoardRow = {
  key: string;
  rank: number;
  name: string;
  /** Second line: the driver's country on a real row, the car on a sample. */
  detail: string | null;
  speed: MetresPerSecond;
  sample: boolean;
};

export type IntroBoard = {
  /** The card's top-right label: the person's country code, or "Global". */
  scopeLabel: string;
  rows: IntroBoardRow[];
  sample: boolean;
};

/**
 * The Board tab's own pre-first-drive sample (src/board/sampleRows.ts), top
 * three: the same names, cars and speeds, so the sample someone meets here is
 * the one they meet again on the Board tab. Road-legal speeds, labelled SAMPLE
 * on every row, never presented as people.
 */
export const INTRO_SAMPLE_ROWS: readonly { name: string; vehicle: string; mph: number }[] =
  SAMPLE_BOARD_ROWS.slice(0, INTRO_BOARD_SIZE).map((s) => ({
    name: s.username,
    vehicle: s.vehicle,
    mph: s.mph,
  }));

export const GLOBAL_LABEL = 'Global';

/**
 * The top three rows of a board the server answered, or null when there is
 * no such board to show.
 *
 * Only a server answer counts. The local fallback is this device's own drives
 * and benchmark ghosts, which is not "where you stack up" against anyone, and
 * a sample board is already a sample. Only people count as rows: benchmark
 * and sample kinds are skipped. Fewer than three is null too, because a
 * podium with one driver on it reads as a broken card rather than an early
 * board, and the sample says "early" more honestly.
 */
export function realBoardRows(result: BoardResult | null | undefined): IntroBoardRow[] | null {
  if (!result || result.source !== 'server' || result.isSample) return null;
  const people = result.rows.filter(
    (r) =>
      (r.kind === 'user' || r.kind === 'you') &&
      r.metric === 'top_speed' &&
      Number.isFinite(raw(r.value)) &&
      raw(r.value) > 0,
  );
  if (people.length < INTRO_BOARD_SIZE) return null;
  return people.slice(0, INTRO_BOARD_SIZE).map((r, i) => ({
    key: r.id,
    rank: i + 1,
    name: r.username,
    detail: r.country,
    // Narrowed by the metric filter above, but the type can't see through
    // a filter, so the speed is re-read from the tagged value.
    speed: r.metric === 'top_speed' ? r.value : mps(0),
    sample: false,
  }));
}

/** The sample card, under the given scope label. */
export function sampleIntroBoard(scopeLabel: string = GLOBAL_LABEL): IntroBoard {
  return {
    scopeLabel,
    sample: true,
    rows: INTRO_SAMPLE_ROWS.map((s, i) => ({
      key: `sample-${i}`,
      rank: i + 1,
      name: s.name,
      detail: s.vehicle,
      speed: mps(s.mph * MS_PER_MPH),
      sample: true,
    })),
  };
}

/**
 * The boards to ask for, in order: the person's country first when they have
 * one (relaunching mid-onboarding, or Back from a later step), then the world.
 * A thin country board falls through to the global one rather than straight
 * to the sample, so a real board is shown whenever one exists.
 */
export function boardAttempts(
  country: string | null,
): { scope: 'country' | 'global'; label: string }[] {
  return country
    ? [
        { scope: 'country', label: country },
        { scope: 'global', label: GLOBAL_LABEL },
      ]
    : [{ scope: 'global', label: GLOBAL_LABEL }];
}

/**
 * `p`'s answer, or null when it rejects or has not answered within `ms`.
 * Never rejects. The wait is cleared as soon as `p` settles: a race against a
 * bare timeout left a timer running out its full budget behind every answer
 * that came back in time.
 */
export function settleWithin<T>(p: Promise<T>, ms: number): Promise<T | null> {
  if (!(ms > 0)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const wait = setTimeout(() => resolve(null), ms);
    p.then(
      (value) => {
        clearTimeout(wait);
        resolve(value);
      },
      () => {
        clearTimeout(wait);
        resolve(null);
      },
    );
  });
}

/** Spoken rank for a row: "1st", "2nd", "3rd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
