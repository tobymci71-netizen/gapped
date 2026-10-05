/**
 * Focus proof: a variant for every focus, the copy as docs/ONBOARDING.md
 * words it, and samples that behave like the boards they imitate.
 */

import { SAMPLE_BOARD_ROWS } from '@/board/sampleRows';
import { msToKmh, msToMph } from '@/types/units';
import { FOCUS_OPTIONS } from '../../flow';
import {
  focusProofCopy,
  PROOF_POINTS,
  rankPosition,
  SAMPLE_FRIENDS,
  SAMPLE_RANK,
  SAMPLE_SPEED_CAP_MPH,
  SAMPLE_TOP_SPEED_ROW,
  SAMPLE_ZERO_SIXTY_S,
} from '../focusProof';
import { easeOutCubic } from '../useCountUp';

describe('focusProofCopy', () => {
  test('every focus has its own title and body', () => {
    const copies = FOCUS_OPTIONS.map((o) => focusProofCopy(o.key, 'car'));
    expect(new Set(copies.map((c) => c.title)).size).toBe(FOCUS_OPTIONS.length);
    for (const c of copies) {
      expect(c.title).not.toBe('');
      expect(c.body).not.toBe('');
    }
  });

  test('worded as the doc words it', () => {
    expect(focusProofCopy('topSpeed', 'car')).toEqual({
      title: 'Your top speed, verified',
      body: "Every run is re-checked on our servers before it counts. No spoofed GPS, no typed-in numbers, and no top speed over its country's ranking limit makes the boards.",
    });
    expect(focusProofCopy('zeroToSixty', 'car')).toEqual({
      title: 'Measured, not guessed',
      body: 'From a standstill of at least two seconds, with a one-foot rollout. No clean start, no number.',
    });
    expect(focusProofCopy('beatFriends', 'car')).toEqual({
      title: 'See how you compare',
      body: "Add friends by username and compare real drive stats. Following is one-way, so nobody lands on a stranger's screen.",
    });
    expect(focusProofCopy('localRanking', 'car')).toEqual({
      title: 'Your country, your board',
      body: "Every verified run places on your country's board and the global one, so you can see where you and your car stand.",
    });
  });

  test('a rider is told about their bike', () => {
    expect(focusProofCopy('localRanking', 'bike').body).toMatch(/your bike stand\.$/);
  });

  test('local ranking does not sell class brackets, which are Pro', () => {
    const { title, body } = focusProofCopy('localRanking', 'car');
    expect(`${title} ${body}`).not.toMatch(/class|like yours/i);
  });

  test('friends compare, nobody races, and nothing is a launch', () => {
    for (const o of FOCUS_OPTIONS) {
      const { title, body } = focusProofCopy(o.key, 'car');
      expect(`${title} ${body}`).not.toMatch(/\brac(e|es|ing)\b|launch|fastest/i);
    }
  });

  test('top speed says what is never ranked', () => {
    expect(focusProofCopy('topSpeed', 'bike').body).toMatch(
      /no top speed over its country's ranking limit makes the boards/,
    );
  });

  test('no copy promises a multiplier or a made-up figure', () => {
    for (const o of FOCUS_OPTIONS) {
      const { title, body } = focusProofCopy(o.key, 'car');
      expect(`${title} ${body}`).not.toMatch(/\d(\.\d+)?x\b|%/);
    }
  });

  test('the three marks', () => {
    expect(PROOF_POINTS).toEqual(['Real drive data', 'Progress history', 'Ranking context']);
  });
});

describe('samples', () => {
  test('the top-speed row is a Board tab sample, in either unit', () => {
    const row = SAMPLE_BOARD_ROWS.find((r) => r.username === SAMPLE_TOP_SPEED_ROW.name);
    expect(row).toBeDefined();
    expect(SAMPLE_TOP_SPEED_ROW.vehicle).toBe(row?.vehicle);
    expect(Math.round(msToMph(SAMPLE_TOP_SPEED_ROW.topSpeed))).toBe(row?.mph);
    // The first within the cap, so it is the Board tab's fastest sample a
    // national board could rank.
    expect(row).toBe(SAMPLE_BOARD_ROWS.find((r) => r.mph <= SAMPLE_SPEED_CAP_MPH));
  });

  test('no sample on the step is a speed the copy beside it says is never ranked', () => {
    // "nothing over the national speed limit is ranked": the UK's is 70 mph,
    // and verify-drive's default ceiling is 130 km/h.
    expect(SAMPLE_SPEED_CAP_MPH).toBe(70);
    for (const ms of [SAMPLE_TOP_SPEED_ROW.topSpeed, ...SAMPLE_FRIENDS.map((f) => f.topSpeed)]) {
      expect(msToMph(ms)).toBeLessThanOrEqual(SAMPLE_SPEED_CAP_MPH);
      expect(msToKmh(ms)).toBeLessThanOrEqual(130);
    }
  });

  test('no sample speed is faster than the board sample it borrows from', () => {
    // The flow's samples are road speeds; this step sits just before the
    // safety acknowledgement.
    const ceiling = msToMph(SAMPLE_TOP_SPEED_ROW.topSpeed) + 0.5;
    for (const f of SAMPLE_FRIENDS) expect(msToMph(f.topSpeed)).toBeLessThan(ceiling);
  });

  test('the 0–60 sample is the fixture the server measures', () => {
    expect(SAMPLE_ZERO_SIXTY_S).toBe(5.02);
  });

  test('the friends board is ranked, with you on it once', () => {
    const speeds = SAMPLE_FRIENDS.map((f) => f.topSpeed);
    expect([...speeds].sort((a, b) => b - a)).toEqual(speeds);
    expect(SAMPLE_FRIENDS.filter((f) => f.you)).toHaveLength(1);
    // Everyone else is visibly a sample, even cropped out of the card.
    for (const f of SAMPLE_FRIENDS.filter((x) => !x.you)) expect(f.name).toMatch(/^sample_/);
  });

  test('the rank card puts you inside the field', () => {
    expect(SAMPLE_RANK.rank).toBeGreaterThanOrEqual(1);
    expect(SAMPLE_RANK.rank).toBeLessThanOrEqual(SAMPLE_RANK.of);
  });
});

describe('rankPosition', () => {
  test('#1 is the left end and last is the right', () => {
    expect(rankPosition(1, 48)).toBe(0);
    expect(rankPosition(48, 48)).toBe(1);
    expect(rankPosition(7, 48)).toBeCloseTo(6 / 47);
  });

  test('clamps, and survives a field of one', () => {
    expect(rankPosition(0, 10)).toBe(0);
    expect(rankPosition(11, 10)).toBe(1);
    expect(rankPosition(1, 1)).toBe(0);
  });
});

describe('easeOutCubic', () => {
  test('starts at 0, ends at 1, front-loaded, clamped', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});
