/**
 * The country the phone's own settings point at — offered as the first row of
 * the country sheet, never chosen for the person.
 *
 * Never chosen because the country decides which national board a driver is
 * ranked on, and the phone's region is a guess at that, not an answer: a
 * British phone in Spain for the summer is still a British driver, or is not.
 * One tap on a suggested row is the right price for getting that right.
 */

import { canonicaliseCountry, type CountryCode } from '@/data/countries';
import { deviceLocaleTags } from '@/onboarding/vehicle/deviceUnits';

/**
 * The region subtag of a BCP 47 locale ("en-GB" → GB), through the same
 * canonicalisation as every other way a country enters the app, so "en-UK"
 * suggests GB. Script subtags ("zh-Hant-TW") are stepped over; numeric regions
 * ("es-419", Latin America) and tags with no region give null, as does
 * anything after a singleton — the "ca" in "en-u-ca-gregory" is a calendar,
 * not Canada. iOS-style underscores ("en_GB") are accepted too, with their
 * keywords: "en_US@rg=gbzzzz" is iOS's US English with the Region set to the
 * United Kingdom, and the region override is the answer (GB); any other
 * keyword ("@calendar=…") is ignored.
 */
export function regionFromLocaleTag(tag: string | null | undefined): CountryCode | null {
  if (!tag) return null;
  const [base, keywords = ''] = tag.split('@');
  const override = /(?:^|;)rg=([a-z]{2})z{4}(?:;|$)/i.exec(keywords);
  if (override) return canonicaliseCountry(override[1]);
  const parts = base.replace(/_/g, '-').split('-');
  for (const part of parts.slice(1)) {
    if (part.length === 1) return null;
    if (/^[A-Za-z]{2}$/.test(part)) return canonicaliseCountry(part);
  }
  return null;
}

/**
 * The first region among `tags`, most trusted first — see deviceCountry.
 * Null when none of them carries one.
 */
export function regionFromLocaleTags(tags: readonly string[]): CountryCode | null {
  for (const tag of tags) {
    const region = regionFromLocaleTag(tag);
    if (region) return region;
  }
  return null;
}

/**
 * The device's country, from the same locale sources the unit step reads
 * (deviceLocaleTags, which says why each is trusted as it is): iOS's Region
 * setting first, which is the country the phone is set to whatever language
 * it speaks, then Android's configuration locale, then Hermes's Intl. Intl
 * alone follows the language: a British phone in US English suggested the
 * United States. Null when no source has a region; the sheet then simply has
 * no suggested row.
 */
export function deviceCountry(): CountryCode | null {
  return regionFromLocaleTags(deviceLocaleTags());
}
