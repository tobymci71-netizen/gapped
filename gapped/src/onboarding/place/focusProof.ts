/**
 * Focus proof — the step after "What matters to your drive?" — as data: the
 * words for each focus and the sample figures its visual is drawn from.
 *
 * Every figure here is a SAMPLE and the screen labels it as one (rule 1 in
 * docs/ONBOARDING.md: no invented numbers presented as real). The reference
 * app shows "improve up to 2.4x faster" under every answer; nothing like that
 * exists here, because Gapped has no study behind such a figure. What each
 * variant shows instead is the mechanism the copy describes — a verified row,
 * a timed launch, a rank in a class, a friends board — with the numbers
 * plainly marked as an example.
 */

import { SAMPLE_BOARD_ROWS } from '@/board/sampleRows';
import { MS_PER_MPH } from '@/drive/units';
import { mps } from '@/types/units';
import type { Focus } from '@/state/profile';
import type { MetresPerSecond } from '@/types/units';

/** A sample speed given in mph, as the board's sample rows are. */
const fromMph = (mph: number): MetresPerSecond => mps(mph * MS_PER_MPH);

export type FocusProofCopy = { title: string; body: string };

/**
 * docs/ONBOARDING.md, "Focus proof". `noun` is the vehicle the person chose
 * on the ride step: a motorbike rider is ranked against bikes like theirs.
 */
export function focusProofCopy(focus: Focus, noun: 'car' | 'bike'): FocusProofCopy {
  switch (focus) {
    case 'topSpeed':
      return {
        title: 'Your top speed, verified',
        body: 'Every run is re-checked on our servers before it counts. No spoofed GPS, no typed-in numbers.',
      };
    case 'zeroToSixty':
      return {
        title: 'Measured, not guessed',
        body: 'From a standstill of at least two seconds, with a one-foot rollout. No clean launch, no number.',
      };
    case 'localRanking':
      return {
        title: 'Your class, your country',
        body: `Boards split by ${noun} class and country, so you're ranked against ${noun}s like yours.`,
      };
    case 'beatFriends':
      return {
        title: 'Friends make it a race',
        body: "Add friends by username and race their real drive stats. Following is one-way, so nobody lands on a stranger's screen.",
      };
  }
}

/** The three lime marks under every variant. */
export const PROOF_POINTS = ['Real drive data', 'Progress history', 'Ranking context'] as const;
export type ProofPoint = (typeof PROOF_POINTS)[number];

/**
 * Top speed: one board row — the Board tab's own first sample row
 * (src/board/sampleRows.ts), the same one the welcome carousel shows: 82 mph,
 * 132 km/h.
 *
 * Not "You" and the person's own car. A VERIFIED speed printed beside a real
 * car they own is a made-up figure for that car, whatever tag sits over the
 * card (rule 1) — the paywall's sample share card leaves the car off for the
 * same reason. It is also a road speed, like every other sample in the flow:
 * this screen comes just before the safety acknowledgement, and an invented
 * 127 mph "verified" run would be the flow celebrating exactly what that
 * acknowledgement asks people not to do.
 */
export const SAMPLE_TOP_SPEED_ROW: {
  name: string;
  vehicle: string;
  topSpeed: MetresPerSecond;
} = {
  name: SAMPLE_BOARD_ROWS[0].username,
  vehicle: SAMPLE_BOARD_ROWS[0].vehicle,
  topSpeed: fromMph(SAMPLE_BOARD_ROWS[0].mph),
};

/**
 * 0–60: the time the server re-derives from the zeroSixtyPull fixture in
 * `npm run verify:roundtrip` (README, "Backend") — a real measurement of a
 * test trace, shown as a sample of what a launch looks like.
 */
export const SAMPLE_ZERO_SIXTY_S = 5.02;

/** Local ranking: where the sample rank card puts "you". */
export const SAMPLE_RANK = { rank: 7, of: 48 } as const;

export type SampleFriend = { name: string; topSpeed: MetresPerSecond; you?: true };

/**
 * Beat friends: a three-row friends board, ranked. Usernames say "sample" in
 * the name itself, as the board's own sample rows do (src/board/boards.ts),
 * so even a screenshot cropped past the SAMPLE tag cannot pass them off as
 * people.
 */
export const SAMPLE_FRIENDS: readonly SampleFriend[] = [
  { name: 'sample_friend_1', topSpeed: fromMph(76) },
  { name: 'You', topSpeed: fromMph(71), you: true },
  { name: 'sample_friend_2', topSpeed: fromMph(64) },
];

/**
 * Where a rank sits on a track from #1 (left, 0) to #`of` (right, 1). Pure
 * for the test; the card animates its marker to this.
 */
export function rankPosition(rank: number, of: number): number {
  if (!(of > 1)) return 0;
  return Math.min(1, Math.max(0, (rank - 1) / (of - 1)));
}
