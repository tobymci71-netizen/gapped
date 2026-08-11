/**
 * Guards the country list and the canonicalisation that feeds it.
 *
 * The failure these protect against is quiet: `board_top` filters entries with
 * `e.country = p_country`, so two codes meaning one country produce two
 * half-populated national boards and no error anywhere. Nothing throws, and
 * the app looks like it is working.
 */

import {
  COUNTRIES,
  COUNTRY_ALIASES,
  canonicaliseCountry,
  countryByCode,
  isCanonicalCountry,
} from '../countries';

/**
 * Widened to string[] on purpose. These tests check membership for arbitrary
 * inputs — aliases, reserved codes, typos — and a CountryCode[] would refuse
 * the very values the tests exist to prove are absent.
 */
const CODES: string[] = COUNTRIES.map((c) => c.code);

describe('the shipped list', () => {
  test('holds 249 assigned ISO 3166-1 codes plus XK', () => {
    expect(COUNTRIES).toHaveLength(250);
  });

  test('has no duplicate codes', () => {
    expect(new Set(CODES).size).toBe(CODES.length);
  });

  test('has no duplicate names — two rows for one country is the bug', () => {
    const names = COUNTRIES.map((c) => c.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  test('every code is two uppercase letters', () => {
    expect(CODES.filter((c) => !/^[A-Z]{2}$/.test(c))).toEqual([]);
  });

  test('the Crown Dependencies and Gibraltar ship', () => {
    // Assigned ISO codes, not reserved ones. Asserted by name because the
    // maintainer drives in one of them and a silent trim would lock him out.
    for (const code of ['GG', 'JE', 'IM', 'GI']) {
      expect(CODES).toContain(code);
    }
  });

  test('XK ships — Kosovo has no ISO code and no correct fallback', () => {
    expect(CODES).toContain('XK');
  });

  test('reserved, sentinel and macroregion codes do not ship', () => {
    for (const code of ['AC', 'TA', 'CP', 'DG', 'EA', 'IC', 'CQ', 'ZZ', 'EU', 'UN', 'QO', 'XA']) {
      expect(CODES).not.toContain(code);
    }
  });
});

describe('the alias map', () => {
  test('no alias is itself shippable — that would be the duplicate', () => {
    for (const from of Object.keys(COUNTRY_ALIASES)) {
      expect(CODES).not.toContain(from);
    }
  });

  test('every alias resolves to a code we actually ship', () => {
    for (const [from, to] of Object.entries(COUNTRY_ALIASES)) {
      expect({ from, shipped: CODES.includes(to) }).toEqual({ from, shipped: true });
    }
  });

  test('every alias key is uppercase', () => {
    for (const from of Object.keys(COUNTRY_ALIASES)) {
      expect(from).toBe(from.toUpperCase());
    }
  });

  /**
   * The completeness test, and the one that matters most. It re-derives the
   * aliases from the same source the generator used — CLDR, via Intl — rather
   * than trusting the committed map. A missing entry here is a country that
   * can still be split across two boards.
   *
   * Detecting aliases by comparing display names finds only 6 of these 16:
   * some aliases render under a different name than their target, so name
   * collision is not a sound test. Canonicalisation is.
   */
  test('covers every alias CLDR knows about', () => {
    const AZ = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
    const display = new Intl.DisplayNames(['en'], { type: 'region' });
    const missing: string[] = [];

    for (const a of AZ) {
      for (const b of AZ) {
        const code = a + b;
        if (display.of(code) === code) continue; // ICU does not know it
        const [tag] = Intl.getCanonicalLocales(`und-${code}`);
        const canonical = tag.split('-')[1] ?? code;
        if (canonical === code) continue; // not an alias
        // An alias onto something we ship must be in the map; an alias onto
        // something we do not ship (none today) would be unmappable anyway.
        if (CODES.includes(canonical) && COUNTRY_ALIASES[code] !== canonical) {
          missing.push(`${code}→${canonical}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('canonicaliseCountry', () => {
  test('passes a canonical code through', () => {
    expect(canonicaliseCountry('GB')).toBe('GB');
    expect(canonicaliseCountry('GG')).toBe('GG');
    expect(canonicaliseCountry('XK')).toBe('XK');
  });

  test('normalises case and surrounding whitespace', () => {
    expect(canonicaliseCountry('gb')).toBe('GB');
    expect(canonicaliseCountry('  gG  ')).toBe('GG');
  });

  test('maps the reserved alias that started this — UK is not GB', () => {
    // UK is exceptionally reserved in ISO 3166-1, not a typo and not withdrawn.
    // Any locale API can hand it to us.
    expect(canonicaliseCountry('UK')).toBe('GB');
    expect(canonicaliseCountry('uk')).toBe('GB');
  });

  test('maps formerly-used codes to their successor', () => {
    expect(canonicaliseCountry('ZR')).toBe('CD'); // Zaire → DR Congo
    expect(canonicaliseCountry('SU')).toBe('RU'); // Soviet Union → Russia
    expect(canonicaliseCountry('YU')).toBe('RS'); // Yugoslavia → Serbia
    expect(canonicaliseCountry('DD')).toBe('DE'); // East Germany → Germany
    expect(canonicaliseCountry('BU')).toBe('MM'); // Burma → Myanmar
  });

  test('rejects rather than passes through what it cannot map', () => {
    // Storing an unrecognised code would be rejected by the database
    // constraint and would break the national board in the meantime.
    expect(canonicaliseCountry('ZZ')).toBeNull(); // CLDR sentinel
    expect(canonicaliseCountry('QQ')).toBeNull(); // not a code
    expect(canonicaliseCountry('CQ')).toBeNull(); // reserved, not assigned
    expect(canonicaliseCountry('GBR')).toBeNull(); // alpha-3
    expect(canonicaliseCountry('')).toBeNull();
    expect(canonicaliseCountry('   ')).toBeNull();
    expect(canonicaliseCountry(null)).toBeNull();
    expect(canonicaliseCountry(undefined)).toBeNull();
  });

  test('is idempotent — canonicalising twice changes nothing', () => {
    for (const input of ['UK', 'gb', 'ZR', 'XK', 'GG', 'ZZ', 'QQ', '']) {
      const once = canonicaliseCountry(input);
      expect(canonicaliseCountry(once)).toBe(once);
    }
  });

  test('maps every alias onto a shippable code', () => {
    for (const from of Object.keys(COUNTRY_ALIASES)) {
      const result = canonicaliseCountry(from);
      expect(result).not.toBeNull();
      expect(CODES).toContain(result);
    }
  });
});

describe('lookups', () => {
  test('isCanonicalCountry accepts only shipped codes', () => {
    expect(isCanonicalCountry('GB')).toBe(true);
    expect(isCanonicalCountry('UK')).toBe(false); // an alias is not canonical
    expect(isCanonicalCountry('gb')).toBe(false); // exact match only
    expect(isCanonicalCountry(null)).toBe(false);
  });

  test('countryByCode returns a renderable entry, or nothing', () => {
    expect(countryByCode('GG')).toEqual({ code: 'GG', name: 'Guernsey', flag: '🇬🇬' });
    expect(countryByCode('UK')).toBeUndefined();
    expect(countryByCode(null)).toBeUndefined();
  });

  test('every shipped country has a two-codepoint regional-indicator flag', () => {
    for (const c of COUNTRIES) {
      expect([...c.flag]).toHaveLength(2);
      expect(c.flag.codePointAt(0)).toBeGreaterThanOrEqual(0x1f1e6);
    }
  });
});
