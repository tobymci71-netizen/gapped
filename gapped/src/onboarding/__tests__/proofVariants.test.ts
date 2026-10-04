/**
 * The thresholds in docs/ONBOARDING.md, held exactly. A proof screen that
 * prints a number it should not have — "#1 most popular" over a field of two
 * makes, "3 drivers from Jersey" — is the first lie the app would tell, so the
 * boundaries are tested on both sides.
 */

import {
  brandProof,
  countryProof,
  formatShare,
  MIN_COUNTRY_DRIVERS,
  MIN_MAKE_DRIVERS,
  MIN_MAKES_WITH_DRIVERS,
  type MakePopularityRow,
} from '../proofVariants';

const row = (make: string, drivers: number, rank: number, share: number): MakePopularityRow => ({
  make,
  drivers,
  rank,
  share,
});

/** Eight makes, ranked. */
const ROWS: MakePopularityRow[] = [
  row('BMW', 40, 1, 25),
  row('Volkswagen', 30, 2, 18.75),
  row('Ford', 25, 3, 15.625),
  row('Audi', 20, 4, 12.5),
  row('Toyota', 15, 5, 9.375),
  row('Honda', 12, 6, 7.5),
  row('Mazda', 10, 7, 6.25),
  row('Porsche', 8, 8, 5),
];

describe('thresholds', () => {
  test('are the documented values', () => {
    expect(MIN_MAKE_DRIVERS).toBe(5);
    expect(MIN_MAKES_WITH_DRIVERS).toBe(3);
    expect(MIN_COUNTRY_DRIVERS).toBe(10);
  });
});

describe('brandProof', () => {
  test('ranked: count, rank and share come straight from the make’s row', () => {
    const p = brandProof(ROWS, 'Audi');
    expect(p).toMatchObject({ kind: 'ranked', count: 20, rank: 4, share: 12.5 });
  });

  test('five rows centred on the person’s make', () => {
    const p = brandProof(ROWS, 'Audi');
    if (p.kind !== 'ranked') throw new Error('expected ranked');
    expect(p.neighbors.map((n) => n.make)).toEqual(['Volkswagen', 'Ford', 'Audi', 'Toyota', 'Honda']);
    expect(p.neighbors.filter((n) => n.isYours).map((n) => n.make)).toEqual(['Audi']);
  });

  test('the top make shows the four below it; the last, the four above', () => {
    const top = brandProof(ROWS, 'BMW');
    const last = brandProof(ROWS, 'Porsche');
    if (top.kind !== 'ranked' || last.kind !== 'ranked') throw new Error('expected ranked');
    expect(top.neighbors.map((n) => n.make)).toEqual(['BMW', 'Volkswagen', 'Ford', 'Audi', 'Toyota']);
    expect(top.neighbors[0].isYours).toBe(true);
    expect(last.neighbors.map((n) => n.make)).toEqual(['Audi', 'Toyota', 'Honda', 'Mazda', 'Porsche']);
    expect(last.neighbors[4].isYours).toBe(true);
  });

  test('fewer makes than chart rows shows them all', () => {
    const p = brandProof(ROWS.slice(0, 3), 'Ford');
    if (p.kind !== 'ranked') throw new Error('expected ranked');
    expect(p.neighbors.map((n) => n.make)).toEqual(['BMW', 'Volkswagen', 'Ford']);
  });

  test('rows arriving out of order are charted in rank order', () => {
    const p = brandProof([...ROWS].reverse(), 'Ford');
    if (p.kind !== 'ranked') throw new Error('expected ranked');
    expect(p.neighbors.map((n) => n.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  test('the make is found whatever its case or spacing', () => {
    expect(brandProof(ROWS, '  bmw ').kind).toBe('ranked');
  });

  test('exactly MIN_MAKE_DRIVERS drivers is ranked; one fewer is early', () => {
    const rows = [row('BMW', 40, 1, 70), row('Ford', 10, 2, 20), row('Kia', 5, 3, 10)];
    expect(brandProof(rows, 'Kia').kind).toBe('ranked');
    const fewer = [row('BMW', 40, 1, 70), row('Ford', 10, 2, 20), row('Kia', 4, 3, 10)];
    expect(brandProof(fewer, 'Kia')).toEqual({ kind: 'early' });
  });

  test('exactly MIN_MAKES_WITH_DRIVERS makes is ranked; two is early', () => {
    const three = [row('BMW', 40, 1, 60), row('Ford', 20, 2, 30), row('Kia', 6, 3, 10)];
    expect(brandProof(three, 'BMW').kind).toBe('ranked');
    expect(brandProof(three.slice(0, 2), 'BMW')).toEqual({ kind: 'early' });
  });

  test('a make with zero drivers does not count towards the field', () => {
    const rows = [row('BMW', 40, 1, 80), row('Ford', 10, 2, 20), row('Kia', 0, 3, 0)];
    expect(brandProof(rows, 'BMW')).toEqual({ kind: 'early' });
  });

  test('a make nobody else drives is early, not "#0"', () => {
    expect(brandProof(ROWS, 'Lotus')).toEqual({ kind: 'early' });
  });

  test('no data, no rows and no make are all early', () => {
    expect(brandProof(null, 'BMW')).toEqual({ kind: 'early' });
    expect(brandProof(undefined, 'BMW')).toEqual({ kind: 'early' });
    expect(brandProof([], 'BMW')).toEqual({ kind: 'early' });
    expect(brandProof(ROWS, null)).toEqual({ kind: 'early' });
  });

  test('a malformed count is never printed', () => {
    const rows = [row('BMW', Number.NaN, 1, 50), row('Ford', 20, 2, 30), row('Kia', 6, 3, 10)];
    expect(brandProof(rows, 'BMW')).toEqual({ kind: 'early' });
  });
});

describe('countryProof', () => {
  test('prefers drove-yesterday when it clears the bar', () => {
    expect(countryProof({ drivers: 500, droveYesterday: 42 })).toEqual({ kind: 'yesterday', n: 42 });
  });

  test('falls back to on-the-board when yesterday is too few', () => {
    expect(countryProof({ drivers: 25, droveYesterday: 9 })).toEqual({ kind: 'onBoard', n: 25 });
  });

  test('exactly MIN_COUNTRY_DRIVERS qualifies; one fewer does not', () => {
    expect(countryProof({ drivers: 0, droveYesterday: 10 })).toEqual({ kind: 'yesterday', n: 10 });
    expect(countryProof({ drivers: 10, droveYesterday: 0 })).toEqual({ kind: 'onBoard', n: 10 });
    expect(countryProof({ drivers: 9, droveYesterday: 9 })).toEqual({ kind: 'early' });
  });

  test('no data is early', () => {
    expect(countryProof(null)).toEqual({ kind: 'early' });
    expect(countryProof(undefined)).toEqual({ kind: 'early' });
  });

  test('a malformed count is never printed', () => {
    expect(countryProof({ drivers: Number.NaN, droveYesterday: Number.POSITIVE_INFINITY })).toEqual({
      kind: 'early',
    });
  });
});

describe('formatShare', () => {
  test('whole percent', () => {
    expect(formatShare(12.5)).toBe('13');
    expect(formatShare(25)).toBe('25');
  });

  test('under one percent is "<1", never a misleading 0', () => {
    expect(formatShare(0.4)).toBe('<1');
  });

  test('bad or empty values', () => {
    expect(formatShare(0)).toBe('0');
    expect(formatShare(Number.NaN)).toBe('0');
    expect(formatShare(140)).toBe('100');
  });
});
