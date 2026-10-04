import { regionFromLocaleTag, regionFromLocaleTags } from '../deviceCountry';

describe('regionFromLocaleTag', () => {
  test.each([
    ['en-GB', 'GB'],
    ['en_GB', 'GB'],
    ['fr-FR', 'FR'],
    ['en-us', 'US'],
    ['zh-Hant-TW', 'TW'],
    ['sr-Latn-RS', 'RS'],
    ['en-US-u-ca-gregory', 'US'],
    // An alias goes through the same canonicalisation as every other way in.
    ['en-UK', 'GB'],
    // iOS keywords: a region override wins over the language's region…
    ['en_US@rg=gbzzzz', 'GB'],
    ['en_US@calendar=gregorian;rg=dezzzz', 'DE'],
    // …and any other keyword is not part of the region.
    ['en_GB@calendar=gregorian', 'GB'],
  ])('%s → %s', (tag, expected) => {
    expect(regionFromLocaleTag(tag)).toBe(expected);
  });

  test.each([
    ['en'],
    ['es-419'],
    // After a singleton is an extension: "ca" is a calendar, not Canada.
    ['en-u-ca-gregory'],
    ['en-ZZ'],
    [''],
  ])('%s → null', (tag) => {
    expect(regionFromLocaleTag(tag)).toBeNull();
  });

  test('no tag at all', () => {
    expect(regionFromLocaleTag(null)).toBeNull();
    expect(regionFromLocaleTag(undefined)).toBeNull();
  });
});

describe('regionFromLocaleTags', () => {
  test('the first source with a region wins', () => {
    expect(regionFromLocaleTags(['en_GB', 'en-US'])).toBe('GB');
  });

  test('a source without one is stepped over', () => {
    expect(regionFromLocaleTags(['en', 'es-419', 'fr-FR'])).toBe('FR');
  });

  test('no sources, or none with a region', () => {
    expect(regionFromLocaleTags([])).toBeNull();
    expect(regionFromLocaleTags(['en', 'und'])).toBeNull();
  });
});
