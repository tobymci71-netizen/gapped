/**
 * Narrowest-board selection (spec §C1) — the highest-leverage algorithm in
 * Phase 2. With a small user base, "3rd fastest RWD in Yorkshire today" is
 * true, achievable, and feels competitive; "#8,412 globally" feels dead.
 * Always surface the narrowest board where the user ranks well.
 */

export type BoardCandidate = {
  /** Human label, e.g. "RWD · Stock · Yorkshire · today". */
  label: string;
  /** User's rank on this board (1-based). */
  rank: number;
  /** Total entries on this board. */
  size: number;
  /** Higher = narrower (global=0, country=1, region=2, bracket=3, +period slice). */
  narrowness: number;
};

/**
 * Score: podium beats top-decile beats everything; narrowness breaks ties;
 * boards where the user is bottom-half score negative and are never chosen
 * over any positive candidate. A board of one ("1st of 1") is honest but
 * empty bragging — penalised below any real competition.
 */
export function scoreCandidate(c: BoardCandidate): number {
  if (c.size <= 0 || c.rank <= 0) return -Infinity;
  const frac = c.rank / c.size;
  let score = 0;
  if (c.size === 1) {
    score = 5; // alone on the board — better than ranking badly, worse than beating anyone
  } else if (c.rank === 1) {
    score = 100;
  } else if (c.rank <= 3) {
    score = 80;
  } else if (frac <= 0.1) {
    score = 60;
  } else if (frac <= 0.25) {
    score = 40;
  } else if (frac <= 0.5) {
    score = 15;
  } else {
    score = -10;
  }
  // narrowness is a tiebreaker, never the headline
  return score + c.narrowness * 2 + Math.min(c.size, 50) / 50;
}

export function pickBestBoard(candidates: BoardCandidate[]): BoardCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  return sorted[0];
}

/** Ordinal: 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th". */
export function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  if (rem10 === 1) return `${n}st`;
  if (rem10 === 2) return `${n}nd`;
  if (rem10 === 3) return `${n}rd`;
  return `${n}th`;
}
