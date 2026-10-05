/**
 * The make-proof screen's sentences (docs/ONBOARDING.md, "Make proof"), built
 * here so the wording and its edge cases are tested in one place. Pure.
 */

import { formatShare } from '@/onboarding/proofVariants';
import { cleanName } from './draft';

type Noun = 'car' | 'bike';

/**
 * "{Make} drivers are already on Gapped".
 *
 * The contract's wording was "…already on the board", but the count above it
 * is `make_popularity`'s: drivers who finished onboarding with this make as
 * their main vehicle, not drivers with a verified run on a board. "On Gapped"
 * is what the number actually counts, and it matches "#N most popular on
 * Gapped" under it.
 */
export function rankedLine(make: string): string {
  return `${cleanName(make)} drivers are already on Gapped`;
}

/** "#{rank} most popular on Gapped". */
export function rankLine(rank: number): string {
  return `#${rank} most popular on Gapped`;
}

/**
 * "{share}% of all Gapped car drivers".
 *
 * The contract's wording is "of all Gapped drivers", but `make_popularity`
 * counts within one kind: a make's share is of the car drivers, or of the
 * bike drivers, never of everyone. Naming the kind keeps the sentence true —
 * rule 1 is about what a number claims, not only where it came from.
 */
export function shareLine(share: number, noun: Noun): string {
  return `${formatShare(share)}% of all Gapped ${noun} drivers`;
}

/** The lime closer under the chart. */
export function closerLine(noun: Noun): string {
  return `Your ${noun} connects you with drivers who share it.`;
}

/**
 * The early variant's title and body: no number, and no pretence of one. A
 * profile with no make (which the ride step does not allow, but a stored
 * profile from an older build could carry) gets the same sentences without
 * the blank where the make would be.
 *
 * The body used to end "Yours can be the one to beat". These are public
 * roads, and a drive is not something to beat; the body now says only what
 * happens to a verified drive.
 */
export function earlyCopy(make: string | null | undefined): { title: string; body: string } {
  const m = cleanName(make);
  return m
    ? {
        title: `Be one of the first ${m} drivers on the board`,
        body: `Each verified ${m} drive is added to the board as it comes in.`,
      }
    : {
        title: 'Be one of the first drivers on the board',
        body: 'Each verified drive is added to the board as it comes in.',
      };
}
