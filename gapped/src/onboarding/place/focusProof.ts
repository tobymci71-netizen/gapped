/**
 * Focus proof — the step after "What matters to your drive?" — as data: the
 * words for each focus and the sample figures its visual is drawn from.
 *
 * Every figure here is a SAMPLE and the screen labels it as one (rule 1 in
 * docs/ONBOARDING.md: no invented numbers presented as real). The reference
 * app shows "improve up to 2.4x faster" under every answer; nothing like that
 * exists here, because Gapped has no study behind such a figure. What each
 * variant shows instead is the mechanism the copy describes — a verified row,
 * a measured 0–60, a rank in your country, a friends board — with the numbers
 * plainly marked as an example.
 *
 * Nothing here invites speed. Top speed says what is never ranked (a speed
 * over the country's national limit, which verify-drive keeps off the
 * boards), a 0–60 is a measurement rather than a launch, and friends compare
 * rather than race.
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
 * on the ride step.
 */
export function focusProofCopy(focus: Focus, noun: 'car' | 'bike'): FocusProofCopy {
  switch (focus) {
    case 'topSpeed':
      return {
        title: 'Your top speed, verified',
        body: "Every run is re-checked on our servers before it counts. No spoofed GPS, no typed-in numbers, and no top speed over its country's ranking limit makes the boards.",
      };
    case 'zeroToSixty':
      return {
        title: 'Measured, not guessed',
        body: 'From a standstill of at least two seconds, with a one-foot rollout. No clean start, no number.',
      };
    // Country and global, not class: placement on those boards is Free, and
    // class brackets are Pro in the published plans matrix, so this screen
    // must not sell them as part of every drive.
    case 'localRanking':
      return {
        title: 'Your country, your board',
        body: `Every verified run places on your country's board and the global one, so you can see where you and your ${noun} stand.`,
      };
    case 'beatFriends':
      return {
        title: 'See how you compare',
        body: "Add friends by username and compare real drive stats. Following is one-way, so nobody lands on a stranger's screen.",
      };
  }
}

/** The three marks under every variant. */
export const PROOF_POINTS = ['Real drive data', 'Progress history', 'Ranking context'] as const;
export type ProofPoint = (typeof PROOF_POINTS)[number];

/**
 * The fastest any sample on this step may show: 70 mph (113 km/h), the UK's
 * motorway limit, and under the 130 km/h ceiling verify-drive ranks to where
 * a country has no limit of its own (supabase/functions/_shared
 * speedLimits.ts). The top-speed copy says nothing over the national limit is
 * ranked; a sample "verified" row above it, on the same screen, would show a
 * run that the UK's board, and most others, would never rank.
 */
export const SAMPLE_SPEED_CAP_MPH = 70;

/** The Board tab's first sample row within the cap (src/board/sampleRows.ts). */
const TOP_SPEED_SAMPLE =
  SAMPLE_BOARD_ROWS.find((r) => r.mph <= SAMPLE_SPEED_CAP_MPH) ??
  SAMPLE_BOARD_ROWS[SAMPLE_BOARD_ROWS.length - 1];

/**
 * Top speed: one board row — one of the Board tab's own sample rows
 * (src/board/sampleRows.ts), the first within SAMPLE_SPEED_CAP_MPH: as the
 * rows stand, 69 mph, 111 km/h.
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
  name: TOP_SPEED_SAMPLE.username,
  vehicle: TOP_SPEED_SAMPLE.vehicle,
  topSpeed: fromMph(TOP_SPEED_SAMPLE.mph),
};

/**
 * 0–60: the time the server re-derives from the zeroSixtyPull fixture in
 * `npm run verify:roundtrip` (README, "Backend") — a real measurement of a
 * test trace, shown as a sample of what a measured 0–60 looks like.
 */
export const SAMPLE_ZERO_SIXTY_S = 5.02;

/** Local ranking: where the sample rank card puts "you". */
export const SAMPLE_RANK = { rank: 7, of: 48 } as const;

export type SampleFriend = { name: string; topSpeed: MetresPerSecond; you?: true };

/**
 * Friends: a three-row friends board, ranked. Usernames say "sample" in
 * the name itself, as the board's own sample rows do (src/board/boards.ts),
 * so even a screenshot cropped past the SAMPLE tag cannot pass them off as
 * people. Within SAMPLE_SPEED_CAP_MPH, and no faster than the top-speed row.
 */
export const SAMPLE_FRIENDS: readonly SampleFriend[] = [
  { name: 'sample_friend_1', topSpeed: fromMph(67) },
  { name: 'You', topSpeed: fromMph(62), you: true },
  { name: 'sample_friend_2', topSpeed: fromMph(58) },
];

/**
 * Where a rank sits on a track from #1 (left, 0) to #`of` (right, 1). Pure
 * for the test; the card animates its marker to this.
 */
export function rankPosition(rank: number, of: number): number {
  if (!(of > 1)) return 0;
  return Math.min(1, Math.max(0, (rank - 1) / (of - 1)));
}
