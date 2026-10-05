/**
 * The words onboarding asks a driver to agree to, and what has to be true
 * before it lets them.
 *
 * Pure, so the exact wording and the rule are both under test. The screens
 * that ask — the safety step, or the trust step when SAFETY_ACKNOWLEDGEMENT
 * is off (TERMS_ROUTE, src/onboarding/flow.ts) — and the trust step's note on
 * what is public all read from here, so no step can word an agreement
 * differently from another.
 *
 * Kept with the place steps because the location and focus steps share its
 * concern (what Gapped records, and where a top speed belongs); it is not
 * about places as such.
 */

import { PRIVACY_URL, TERMS_URL } from '@/config/links';

/**
 * The safeguard the whole top-speed board rests on, said where it is
 * agreed to. Top speed stays on the public boards only with it: a speed over
 * the country's national limit is never ranked (verify-drive), and this line
 * is why.
 */
export const SAFETY_LINE =
  'Top-speed and 0–60 runs belong on tracks and closed roads. Always obey speed limits.';

/** The first box: the guidelines above it. */
export const GUIDELINES_CHECK = 'I acknowledge these guidelines and agree to drive responsibly.';

/**
 * The second box. Gapped's minimum age is 18 (the Terms of Use), and every
 * run it measures is driven, so a licence is part of the same promise.
 */
export const AGE_CHECK = "I'm 18 or older and hold a valid driving licence.";

/** One public page, as a tappable phrase in a sentence. */
export type ConsentLink = { label: string; url: string };

export const TERMS_LINK: ConsentLink = { label: 'Terms of Use', url: TERMS_URL };
export const PRIVACY_LINK: ConsentLink = { label: 'Privacy Policy', url: PRIVACY_URL };

/**
 * "By continuing you agree to the Terms of Use and Privacy Policy" as runs of
 * plain text and links, in reading order, so the screen can make the two
 * names tappable without rewording the sentence. No full stop: the last run
 * is a link, and a stop set apart from it would read as a stray mark.
 */
export const TERMS_SENTENCE: readonly (string | ConsentLink)[] = [
  'By continuing you agree to the',
  TERMS_LINK,
  'and',
  PRIVACY_LINK,
];

/** The sentence as one string, for the tests and anything that cannot hold a link. */
export function sentenceText(runs: readonly (string | ConsentLink)[]): string {
  return runs.map((r) => (typeof r === 'string' ? r : r.label)).join(' ');
}

/**
 * What is public and what is not, on the trust step. Every clause has to stay
 * true of the app as it ships: the boards show a username, a country and the
 * run, with the day it was driven (board RPCs return `recorded_at` truncated
 * to the day); a drive's route is readable by its owner only (drives RLS,
 * 0001) and is never on a board.
 */
export const PUBLIC_DATA_LINE =
  'Your username, country and run results, including the date of each drive, are public on the leaderboards. Your routes never are.';

/**
 * Whether the step that asks may finish. Every box it shows must be ticked:
 * the safety step shows both, the trust step (safety off) only the age box,
 * since the guidelines it would acknowledge are not on screen.
 */
export function canAgree(checks: readonly boolean[]): boolean {
  return checks.length > 0 && checks.every(Boolean);
}
