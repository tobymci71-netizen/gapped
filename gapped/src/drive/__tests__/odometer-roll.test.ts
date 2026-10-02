/**
 * The live speed readout's digit roll (AnimatedNumber.planRoll). It lives with
 * the drive tests because the drive HUD is where the direction matters: the
 * number falls as often as it rises.
 */

import { planRoll } from '@/components/AnimatedNumber';

// Both libraries ship jest mocks; the native modules don't exist under jest.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

const REST = 10;
/** The digit a strip slot shows. */
const glyph = (slot: number) => ((Math.round(slot) % 10) + 10) % 10;

describe('planRoll', () => {
  test('a drop of one rolls back one place, not forward through nine', () => {
    // 61 → 60: units 1 → 0
    const r = planRoll(REST + 1, 1, 0, -1);
    expect(r.target - r.start).toBe(-1);
    expect(glyph(r.target)).toBe(0);
  });

  test('a rise of one rolls forward one place', () => {
    const r = planRoll(REST + 1, 1, 2, 1);
    expect(r.target - r.start).toBe(1);
    expect(glyph(r.target)).toBe(2);
  });

  test('9 → 0 on the way up still turns forward, with the tens column', () => {
    // 59 → 60
    const units = planRoll(REST + 9, 9, 0, 1);
    const tens = planRoll(REST + 5, 5, 6, 1);
    expect(units.target - units.start).toBe(1);
    expect(tens.target - tens.start).toBe(1);
  });

  test('0 → 9 on the way down turns back, with the tens column', () => {
    // 60 → 59
    const units = planRoll(REST + 0, 0, 9, -1);
    const tens = planRoll(REST + 6, 6, 5, -1);
    expect(units.target - units.start).toBe(-1);
    expect(tens.target - tens.start).toBe(-1);
    expect(glyph(units.target)).toBe(9);
  });

  test('a unit switch (109 → 68) rolls every column the way the number went', () => {
    // units 9 → 8 and tens 0 → 6, both down
    const units = planRoll(REST + 9, 9, 8, -1);
    const tens = planRoll(REST + 0, 0, 6, -1);
    expect(units.target - units.start).toBe(-1);
    expect(tens.target - tens.start).toBe(-4);
    expect(glyph(tens.target)).toBe(6);
  });

  test('a value arriving mid-roll carries on from where the strip visibly is', () => {
    // 3 → 4 is 60% done (slot 13.6) when 5 arrives: continue forward 13.6 → 15
    const r = planRoll(13.6, 4, 5, 1);
    expect(r.start).toBeCloseTo(13.6);
    expect(r.target).toBe(15);
  });

  test('reversing mid-roll goes back the short way, not round the strip', () => {
    // 60 → 59 is halfway (units at slot 9.5, heading for 9) when 60 comes back
    const r = planRoll(9.5, 9, 0, 1);
    expect(glyph(r.start - 0.5)).toBe(9); // same picture as the live 9.5
    expect(r.target - r.start).toBeCloseTo(0.5);
    expect(glyph(r.target)).toBe(0);
  });

  test('a roll that wrapped into the third run is rebased, so the strip never runs out', () => {
    // 9 → 0 forward is mid-way at 19.8 (heading for slot 20) when 1 arrives
    const r = planRoll(19.8, 0, 1, 1);
    expect(r.target - r.start).toBeCloseTo(1.2);
    expect(glyph(r.target)).toBe(1);
  });

  test('every plan stays on the 30-row strip and rests in the middle run', () => {
    for (let from = 0; from < 10; from++) {
      for (let to = 0; to < 10; to++) {
        for (const dir of [1, -1] as const) {
          for (const offset of [-0.49, 0, 0.49]) {
            for (const run of [0, 10, 20]) {
              const live = run + from + offset;
              if (live < 0 || live > 29) continue;
              const r = planRoll(live, from, to, dir);
              expect(r.start).toBeGreaterThanOrEqual(0);
              expect(r.start).toBeLessThanOrEqual(29);
              expect(r.target).toBeGreaterThanOrEqual(0);
              expect(r.target).toBeLessThanOrEqual(29);
              expect(glyph(r.target)).toBe(to);
              expect(r.rest).toBe(REST + to);
              // never more than nine places, and always the way the number went
              expect(Math.abs(r.target - (REST + from))).toBeLessThanOrEqual(9);
              if (to !== from) expect(Math.sign(r.target - (REST + from))).toBe(dir);
            }
          }
        }
      }
    }
  });
});
