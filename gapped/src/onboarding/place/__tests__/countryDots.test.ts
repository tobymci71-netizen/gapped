/**
 * The dotted maps: the decoder against hand-made runs, and every one of the
 * generated maps against the format, so a bad regeneration fails here rather
 * than as a blank or garbled map on somebody's country step.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { COUNTRIES } from '@/data/countries';
import {
  countryDots,
  countryRegion,
  decodeRuns,
  discDots,
  dotCentres,
  DOT_FILL,
  fitDots,
  MAPPED_CODES,
} from '../countryDots';

const JSON_PATH = join(__dirname, '../../../data/countryDots.json');

describe('decodeRuns', () => {
  test('reads the documented example', () => {
    // ".k#3+.b" → 20 sea, 3 main, 1 near, 11 sea (on a 5 × 7 grid)
    expect(decodeRuns('.k#3+.b', 5, 7)).toEqual({ main: [20, 21, 22], near: [23] });
  });

  test('a run without a length is one cell', () => {
    expect(decodeRuns('#.#', 3, 1)).toEqual({ main: [0, 2], near: [] });
  });

  test('lengths are base 36, so runs over nine cells stay one token', () => {
    expect(decodeRuns('.z#', 37, 1).main).toEqual([35]);
    expect(decodeRuns('#10', 36, 1).main).toHaveLength(36);
  });

  test('runs flow across row ends', () => {
    // 3 columns: the main run starts at the end of row 0 and wraps into row 1.
    expect(decodeRuns('.2#3', 3, 2).main).toEqual([2, 3, 4]);
  });

  test('trailing sea may be left off', () => {
    expect(decodeRuns('#', 4, 4)).toEqual({ main: [0], near: [] });
    expect(decodeRuns('', 4, 4)).toEqual({ main: [], near: [] });
  });

  test('rejects runs that overflow the grid', () => {
    expect(() => decodeRuns('#5', 2, 2)).toThrow(/overflow/);
  });

  test('rejects anything that is not a run', () => {
    expect(() => decodeRuns('#3x', 4, 4)).toThrow();
    expect(() => decodeRuns('A#2', 4, 4)).toThrow();
    expect(() => decodeRuns('#0', 4, 4)).toThrow();
  });
});

describe('the generated maps', () => {
  test('stay well under the 400 KB budget', () => {
    expect(readFileSync(JSON_PATH).byteLength).toBeLessThan(400 * 1024);
  });

  test('cover every canonical country but the three below 1:50m', () => {
    const missing = COUNTRIES.map((c) => c.code)
      .filter((c) => !MAPPED_CODES.includes(c))
      .sort();
    expect(missing).toEqual(['BV', 'GI', 'UM']);
  });

  test('are keyed only by canonical codes', () => {
    const canonical = new Set<string>(COUNTRIES.map((c) => c.code));
    expect(MAPPED_CODES.filter((c) => !canonical.has(c))).toEqual([]);
  });

  test('every map decodes to something sane', () => {
    // One test over all 247, listing every failure by code, rather than 247
    // tests: a regeneration that breaks one map should say which, not drown it.
    const problems: string[] = [];
    for (const code of MAPPED_CODES) {
      const dots = countryDots(code);
      if (!dots) {
        problems.push(`${code}: no map`);
        continue;
      }
      const { cols, rows, main, near } = dots;
      const size = cols * rows;
      if (!(cols > 0 && rows > 0 && cols <= 255 && rows <= 255)) problems.push(`${code}: grid ${cols}×${rows}`);
      // The generator's readable minimum: never a handful of dots.
      if (main.length < 40) problems.push(`${code}: only ${main.length} main dots`);
      if ([...main, ...near].some((i) => i < 0 || i >= size)) problems.push(`${code}: cell out of range`);
      // A cell is one kind or the other, never both.
      const mainSet = new Set(main);
      if (near.some((i) => mainSet.has(i))) problems.push(`${code}: cell both main and near`);
    }
    expect(problems).toEqual([]);
  });

  test('countries the rules were written for come out as described', () => {
    // Alaska borders Canada, so it is land, drawn bright with the rest; only
    // its offshore islands are dim. (Dim, Alaska alone would be ~30% of it.)
    const us = countryDots('US')!;
    expect(us.near.length).toBeLessThan(us.main.length / 5);
    // Sicily and Sardinia: islands, drawn dim.
    expect(countryDots('IT')!.near.length).toBeGreaterThan(20);
    // New Zealand's two main islands are both main landmass.
    expect(countryDots('NZ')!.near.length).toBeLessThan(10);
  });

  test('a code with no map is null, not an empty map', () => {
    expect(countryDots('GI')).toBeNull();
    expect(countryDots('ZZ')).toBeNull();
    expect(countryDots(null)).toBeNull();
  });

  test('decodes once and returns the same object', () => {
    expect(countryDots('FR')).toBe(countryDots('FR'));
  });
});

describe('countryRegion', () => {
  const REGIONS = new Set([
    'Africa',
    'Antarctica',
    'Asia',
    'Europe',
    'North America',
    'Oceania',
    'South America',
  ]);

  test('every country has one of the continents, including those with no map', () => {
    for (const c of COUNTRIES) {
      expect(REGIONS.has(countryRegion(c.code) ?? '')).toBe(true);
    }
  });

  test('reads as people would expect', () => {
    expect(countryRegion('GB')).toBe('Europe');
    expect(countryRegion('US')).toBe('North America');
    expect(countryRegion('BR')).toBe('South America');
    expect(countryRegion('JP')).toBe('Asia');
    expect(countryRegion('AU')).toBe('Oceania');
    expect(countryRegion('GI')).toBe('Europe');
    // Natural Earth files the Maldives under "Seven seas"; nobody lives there.
    expect(countryRegion('MV')).toBe('Asia');
  });

  test('is null for nothing', () => {
    expect(countryRegion(null)).toBeNull();
    expect(countryRegion('ZZ')).toBeNull();
  });
});

describe('fitDots', () => {
  test('fits the limiting axis exactly and centres the other', () => {
    // 10 × 5 cells into 200 × 200: 20pt pitch, 50pt of space above and below.
    const l = fitDots(10, 5, 200, 200);
    expect(l.pitch).toBe(20);
    expect(l.x0).toBe(10);
    expect(l.y0).toBe(50 + 10);
    expect(l.radius).toBeCloseTo((20 * DOT_FILL) / 2);
  });

  test('cells stay square in a tall box', () => {
    const l = fitDots(4, 8, 400, 160);
    expect(l.pitch).toBe(20);
    expect(l.x0).toBe((400 - 80) / 2 + 10);
  });

  test('an unmeasured box draws nothing rather than negative sizes', () => {
    expect(fitDots(10, 10, 0, 0).pitch).toBe(0);
  });

  test('dot centres follow row-major cell indices', () => {
    const l = fitDots(3, 2, 30, 20);
    expect(dotCentres([0, 2, 4], 3, l)).toEqual([
      { x: 5, y: 5 },
      { x: 25, y: 5 },
      { x: 15, y: 15 },
    ]);
  });
});

describe('discDots', () => {
  test('is a filled disc inside its square', () => {
    const d = discDots(20);
    expect(d.cols).toBe(20);
    expect(d.near).toEqual([]);
    // πr² of a 20-cell disc is ~314 cells.
    expect(d.main.length).toBeGreaterThan(290);
    expect(d.main.length).toBeLessThan(330);
    // Corners are empty, the centre is not.
    expect(d.main).not.toContain(0);
    expect(d.main).toContain(10 * 20 + 10);
  });
});
