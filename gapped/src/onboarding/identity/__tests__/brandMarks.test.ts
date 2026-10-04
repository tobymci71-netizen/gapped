import { ATTRIBUTION_OPTIONS } from '@/onboarding/flow';
import { BRAND_MARKS } from '../brandMarks';

/** SVG path commands and numbers only — anything else would fail to draw. */
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/;

describe('BRAND_MARKS', () => {
  it('has a mark for every answer on the attribution step, and no others', () => {
    expect(Object.keys(BRAND_MARKS).sort()).toEqual(ATTRIBUTION_OPTIONS.map((o) => o.key).sort());
  });

  it('is drawable path data on the 24-unit grid', () => {
    for (const [key, paths] of Object.entries(BRAND_MARKS)) {
      expect([key, paths.length > 0]).toEqual([key, true]);
      for (const d of paths) {
        expect([key, PATH_DATA.test(d)]).toEqual([key, true]);
        expect(d.trim()[0]).toMatch(/[Mm]/);
      }
    }
  });

  it('draws the two unbranded answers with closed shapes', () => {
    for (const d of [...BRAND_MARKS.friend, ...BRAND_MARKS.other]) expect(d.trim().endsWith('z')).toBe(true);
  });

  it('keeps every drawn coordinate of the unbranded marks inside the 24×24 grid', () => {
    // The generated circles and squares are the ones written by hand here;
    // the Simple Icons paths are copied verbatim and already fit.
    for (const d of BRAND_MARKS.other) {
      const abs = d.match(/^M([\d.]+) ([\d.]+)/);
      expect(abs).not.toBeNull();
      const [x, y] = [Number(abs![1]), Number(abs![2])];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(24);
      expect(y).toBeLessThanOrEqual(24);
    }
  });
});
