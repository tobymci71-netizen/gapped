/**
 * The make-proof screen's arithmetic: the count's ramp, how it prints, and
 * how long a bar is drawn.
 */

import { barFraction, easeOutCubic, formatCount, rampAt } from '../numbers';

describe('easeOutCubic', () => {
  it('runs 0 → 1 and clamps outside', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it('is front-loaded and never overshoots', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    let last = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(1);
      last = v;
    }
  });
});

describe('rampAt', () => {
  it('starts at 0, ends exactly on the target', () => {
    expect(rampAt(0, 460, 1520)).toBe(0);
    expect(rampAt(460, 460, 1520)).toBe(1520);
    expect(rampAt(10_000, 460, 1520)).toBe(1520);
  });

  it('never goes below zero for a frame delivered early', () => {
    expect(rampAt(-50, 460, 1520)).toBe(0);
  });

  it('jumps to the target when there is no time to ramp', () => {
    expect(rampAt(0, 0, 68)).toBe(68);
  });

  it('reads 0 for a target that is not a number', () => {
    expect(rampAt(100, 460, Number.NaN)).toBe(0);
  });
});

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1,000'],
    [1520, '1,520'],
    [180250, '180,250'],
    [1234567, '1,234,567'],
  ])('%d → %s', (n, s) => {
    expect(formatCount(n)).toBe(s);
  });

  it('rounds the fractional values a ramp produces', () => {
    expect(formatCount(1519.6)).toBe('1,520');
    expect(formatCount(0.4)).toBe('0');
  });

  it('prints nonsense as 0 rather than "NaN"', () => {
    expect(formatCount(Number.NaN)).toBe('0');
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('0');
  });

  it('keeps a sign only when there is something to sign', () => {
    expect(formatCount(-1520)).toBe('-1,520');
    expect(formatCount(-0.2)).toBe('0');
  });
});

describe('barFraction', () => {
  it('draws the leading make full width and the rest against it', () => {
    expect(barFraction(3.2, 3.2)).toBe(1);
    expect(barFraction(1.6, 3.2)).toBeCloseTo(0.5);
  });

  it('keeps a sliver visible for a tiny share', () => {
    expect(barFraction(0.01, 40)).toBe(0.04);
    expect(barFraction(0.01, 40, 0.1)).toBe(0.1);
  });

  it('never exceeds the track', () => {
    expect(barFraction(5, 4)).toBe(1);
  });

  it('falls back to the sliver on bad input', () => {
    expect(barFraction(Number.NaN, 3)).toBe(0.04);
    expect(barFraction(2, 0)).toBe(0.04);
  });
});
