/**
 * The unit step's default. The case that matters most is the one a
 * measurement-system table gets wrong: Britain, metric on paper, mph on every
 * road sign.
 */

import { defaultUnitForLocales, MPH_REGIONS, regionOfLocale, unitForRegion } from '../localeUnits';

describe('regionOfLocale', () => {
  it.each([
    ['en-GB', 'GB'],
    ['en_GB', 'GB'],
    ['en-us', 'US'],
    ['zh-Hant-TW', 'TW'],
    ['sr_Latn_RS', 'RS'],
    ['en_GB@calendar=gregorian', 'GB'],
    ['en_US_POSIX', 'US'],
    ['de-DE-1996', 'DE'],
    ['en-GB.UTF-8', 'GB'],
  ])('%s → %s', (tag, region) => {
    expect(regionOfLocale(tag)).toBe(region);
  });

  it.each([['fr'], ['es-419'], ['zh-Hant'], ['en-u-rg-gbzzzz'], ['x-private'], ['']])(
    '%s has no country region',
    (tag) => {
      expect(regionOfLocale(tag)).toBeNull();
    },
  );

  it('tolerates whatever a native module hands back', () => {
    expect(regionOfLocale(null)).toBeNull();
    expect(regionOfLocale(undefined)).toBeNull();
    expect(regionOfLocale(42 as unknown as string)).toBeNull();
  });
});

describe('unitForRegion', () => {
  it('signs the UK and the US in mph', () => {
    expect(unitForRegion('GB')).toBe('imperial');
    expect(unitForRegion('US')).toBe('imperial');
  });

  it('follows the Crown dependencies and US territories that drive in mph', () => {
    for (const r of ['IM', 'JE', 'GG', 'PR', 'GU']) expect(unitForRegion(r)).toBe('imperial');
  });

  it('keeps km/h for neighbours that left mph behind', () => {
    // Ireland, Canada, Australia, Gibraltar and Bermuda all sign in km/h.
    for (const r of ['IE', 'CA', 'AU', 'GI', 'BM', 'DE', 'FR']) {
      expect(unitForRegion(r)).toBe('metric');
    }
  });

  it('is not case sensitive and defaults to km/h when it cannot tell', () => {
    expect(unitForRegion('gb')).toBe('imperial');
    expect(unitForRegion(null)).toBe('metric');
    expect(unitForRegion(undefined)).toBe('metric');
    expect(unitForRegion('')).toBe('metric');
  });

  it('holds only two-letter upper-case codes', () => {
    for (const r of MPH_REGIONS) expect(r).toMatch(/^[A-Z]{2}$/);
  });
});

describe('defaultUnitForLocales', () => {
  it('lets the first identifier that names a region decide', () => {
    // A British phone set to US English: the region setting comes first.
    expect(defaultUnitForLocales(['en_GB', 'en-US'])).toBe('imperial');
    expect(defaultUnitForLocales(['de_DE', 'en-GB'])).toBe('metric');
  });

  it('skips identifiers with no region rather than defaulting on them', () => {
    expect(defaultUnitForLocales([null, 'en', 'en-GB'])).toBe('imperial');
    expect(defaultUnitForLocales(['es-419', 'en-US'])).toBe('imperial');
  });

  it('defaults to km/h when nothing names a region', () => {
    expect(defaultUnitForLocales([])).toBe('metric');
    expect(defaultUnitForLocales(['fr', undefined])).toBe('metric');
  });
});
