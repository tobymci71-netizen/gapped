/**
 * The drive screen's "not ranked" line: it names the country's ranking limit
 * in the driver's units, and never calls it a speed limit.
 */

import { NOT_RANKED_FALLBACK, notRankedLine } from '../notRanked';

const GB_70_MPH = 31.2928;
const DEFAULT_130_KMH = 130 / 3.6;

test("names the country's ranking limit in the driver's units", () => {
  expect(notRankedLine({ ceilingMs: GB_70_MPH, country: 'GB' }, 'imperial')).toBe(
    'Top speed above the United Kingdom ranking limit (70 mph): not ranked',
  );
  expect(notRankedLine({ ceilingMs: DEFAULT_130_KMH, country: 'DE' }, 'metric')).toBe(
    'Top speed above the Germany ranking limit (130 km/h): not ranked',
  );
});

test('a country it cannot name still gets the figure', () => {
  expect(notRankedLine({ ceilingMs: DEFAULT_130_KMH, country: null }, 'imperial')).toBe(
    'Top speed above the ranking limit (81 mph): not ranked',
  );
});

test('a drive checked before the ceiling was recorded keeps the plain line', () => {
  expect(notRankedLine({ ceilingMs: null, country: 'GB' }, 'imperial')).toBe(NOT_RANKED_FALLBACK);
  expect(notRankedLine({ ceilingMs: Number.NaN, country: 'GB' }, 'metric')).toBe(NOT_RANKED_FALLBACK);
});

test('never says "speed limit": for Germany there is none', () => {
  expect(notRankedLine({ ceilingMs: DEFAULT_130_KMH, country: 'DE' }, 'metric')).not.toMatch(
    /speed limit/i,
  );
});
