/**
 * The country step's count line, every variant, worded exactly — and the
 * country's name as it sits in a sentence, which is the part a driver from
 * the United Kingdom notices first when it is wrong.
 */

import { countryByCode, type Country } from '@/data/countries';
import { countryInSentence, countryLine, formatCount, spokenCountryLine } from '../countryCopy';

const c = (code: string): Country => {
  const found = countryByCode(code);
  if (!found) throw new Error(`no country ${code}`);
  return found;
};

describe('countryInSentence', () => {
  test.each([
    ['GB', 'the United Kingdom'],
    ['US', 'the United States'],
    ['AE', 'the United Arab Emirates'],
    ['NL', 'the Netherlands'],
    ['PH', 'the Philippines'],
    ['BS', 'the Bahamas'],
    ['IM', 'the Isle of Man'],
    ['KY', 'the Cayman Islands'],
    ['DO', 'the Dominican Republic'],
    ['PS', 'the Palestinian Territories'],
    ['VI', 'the U.S. Virgin Islands'],
    ['FR', 'France'],
    ['IT', 'Italy'],
    ['GE', 'Georgia'],
    ['VA', 'Vatican City'],
  ])('%s → %s', (code, expected) => {
    expect(countryInSentence(c(code))).toBe(expected);
  });
});

describe('formatCount', () => {
  test.each([
    [0, '0'],
    [10, '10'],
    [999, '999'],
    [1000, '1,000'],
    [20890, '20,890'],
    [180250, '180,250'],
    [1234567, '1,234,567'],
  ])('%d → %s', (n, expected) => {
    expect(formatCount(n)).toBe(expected);
  });

  test('rounds mid-count values and never prints a negative', () => {
    expect(formatCount(1234.6)).toBe('1,235');
    expect(formatCount(-3)).toBe('0');
  });
});

describe('countryLine', () => {
  test('drove yesterday', () => {
    const line = countryLine({ kind: 'yesterday', n: 20890 }, c('IT'));
    expect(line).toEqual({ kind: 'count', n: 20890, text: 'drivers from Italy drove with Gapped yesterday' });
    expect(spokenCountryLine(line)).toBe('20,890 drivers from Italy drove with Gapped yesterday');
  });

  test('on the board', () => {
    expect(countryLine({ kind: 'onBoard', n: 12 }, c('GB'))).toEqual({
      kind: 'count',
      n: 12,
      text: 'drivers from the United Kingdom are on the board',
    });
  });

  test('early: no number at all', () => {
    const line = countryLine({ kind: 'early' }, c('GB'));
    expect(line).toEqual({
      kind: 'early',
      text: 'Be the first from the United Kingdom on the board',
      detail: 'The United Kingdom board fills one verified run at a time.',
    });
    expect(spokenCountryLine(line)).not.toMatch(/\d/);
  });
});
