/**
 * The country picker's search. The queries here are the ones that used to
 * fail: a CLDR-name substring filter sent 'uk' to Ukraine alone and found
 * nothing for 'usa', 'britain' or 'turkey'.
 */

import { COUNTRIES } from '../countries';
import { COUNTRY_SYNONYMS, fold, searchCountries } from '../countrySearch';

const codes = (q: string) => searchCountries(q).map((c) => c.code as string);
const first = (q: string) => codes(q)[0];

describe('fold', () => {
  test('drops accents, case and punctuation so typed text meets CLDR names', () => {
    expect(fold('Türkiye')).toBe('turkiye');
    expect(fold('Côte d’Ivoire')).toBe('cote divoire');
    expect(fold("cote d'ivoire")).toBe('cote divoire');
    expect(fold('U.S. Virgin Islands')).toBe('us virgin islands');
    expect(fold('Bosnia & Herzegovina')).toBe('bosnia and herzegovina');
    expect(fold('Guinea-Bissau')).toBe('guinea bissau');
    expect(fold('  Åland  ')).toBe('aland');
  });
});

describe('searchCountries', () => {
  test('an empty or blank query returns the whole list, in order', () => {
    expect(searchCountries('')).toBe(COUNTRIES);
    expect(searchCountries('   ')).toBe(COUNTRIES);
  });

  test('the common names find the right country first', () => {
    expect(first('uk')).toBe('GB');
    expect(first('UK')).toBe('GB');
    expect(first('usa')).toBe('US');
    expect(first('us')).toBe('US');
    expect(first('america')).toBe('US');
    expect(first('britain')).toBe('GB');
    expect(first('england')).toBe('GB');
    expect(first('turkey')).toBe('TR');
    expect(first('holland')).toBe('NL');
    expect(first('uae')).toBe('AE');
    expect(first('ivory coast')).toBe('CI');
  });

  test('accented names are found without the accents', () => {
    expect(first('turkiye')).toBe('TR');
    expect(first('cote')).toBe('CI');
    expect(first('curacao')).toBe('CW');
    expect(first('reunion')).toBe('RE');
    expect(first('sao tome')).toBe('ST');
    expect(first('aland')).toBe('AX');
  });

  test('the real neighbours still show, after the best match', () => {
    // 'uk' is GB first, but someone looking for Ukraine still finds it.
    expect(codes('uk').slice(0, 2)).toEqual(['GB', 'UA']);
    // 'america' finds the US, then American Samoa.
    expect(codes('america').slice(0, 2)).toEqual(['US', 'AS']);
  });

  test('a name prefix ranks above a match in the middle of a name', () => {
    // 'us' used to list Australia, Austria, Belarus… above the United States.
    const us = codes('us');
    expect(us.indexOf('US')).toBe(0);
    expect(us.indexOf('VI')).toBeLessThan(us.indexOf('AU'));
  });

  test('a later word in a name matches', () => {
    expect(codes('korea')).toEqual(['KP', 'KR']);
    expect(first('kingdom')).toBe('GB');
  });

  test('ties keep alphabetical order', () => {
    expect(codes('congo')).toEqual(['CG', 'CD']);
  });

  test('a leading "the" is ignored', () => {
    expect(first('the gambia')).toBe('GM');
    expect(first('the netherlands')).toBe('NL');
  });

  test('"St." names are found spelled out', () => {
    expect(first('saint lucia')).toBe('LC');
    expect(first('st lucia')).toBe('LC');
  });

  test('retired ISO codes do not hijack common prefixes', () => {
    // AN (→ Curaçao) and BU (→ Myanmar) are aliases in countries.aliases.json.
    // Searching them would put Curaçao above Andorra for "an".
    expect(first('an')).toBe('AD');
    expect(first('bu')).toBe('BG');
  });

  test('nothing matching means no rows, not the whole list', () => {
    expect(codes('zzzz')).toEqual([]);
    expect(codes('...')).toEqual([]);
  });

  test('every synonym points at a country we ship — search cannot invent a code', () => {
    const shipped = new Set<string>(COUNTRIES.map((c) => c.code));
    for (const [name, code] of Object.entries(COUNTRY_SYNONYMS)) {
      expect({ name, shipped: shipped.has(code) }).toEqual({ name, shipped: true });
      // Keys must already be folded, or they could never match.
      expect(fold(name)).toBe(name);
    }
  });

  test('results are always rows from the list itself', () => {
    const rows = new Set(COUNTRIES);
    for (const q of ['uk', 'us', 'a', 'island', 'turkey']) {
      for (const c of searchCountries(q)) expect(rows.has(c)).toBe(true);
    }
  });
});
