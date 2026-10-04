/**
 * Which speed unit a fresh install should start on, from the device locale.
 *
 * The unit step defaults from the locale and the person overrides it on the
 * same screen (docs/ONBOARDING.md, step 5; the reference recording held mph
 * because the phone was British). Pure: the device read lives in
 * ./deviceUnits, so these rules are testable without a phone.
 *
 * The question is ROAD speed, not the measurement system. The two disagree in
 * exactly the place that matters most here: CLDR lists the UK as metric
 * (`en-GB` measures in litres and kilometres on paper), but every British
 * speed limit and speedometer reads mph. A table keyed on "metric vs
 * imperial" would hand a British driver km/h on their first screen.
 */

import type { UnitPref } from '@/drive/units';

/**
 * Regions whose road speed limits are signed in miles per hour: the United
 * States and the United Kingdom, their territories and Crown dependencies
 * that follow them, and the handful of countries with close historical ties
 * that kept mph on the road (several Caribbean and Pacific states, Liberia).
 *
 * Deliberately conservative. A region missing from here defaults to km/h,
 * which the person corrects with one tap on the very screen that shows the
 * default; a wrong guess costs a tap, not a wrong stat.
 */
export const MPH_REGIONS: ReadonlySet<string> = new Set([
  // United States, and territories that sign US-style
  'US',
  'PR',
  'GU',
  'VI',
  'AS',
  'MP',
  'UM',
  // Compact of Free Association states
  'MH',
  'FM',
  'PW',
  // United Kingdom, Crown dependencies and the overseas territories that
  // sign in mph (Gibraltar and Bermuda use km/h and are not here)
  'GB',
  'IM',
  'JE',
  'GG',
  'AI',
  'VG',
  'KY',
  'FK',
  'MS',
  'SH',
  'TC',
  // Countries that kept mph on the road
  'AG',
  'BS',
  'BZ',
  'DM',
  'GD',
  'KN',
  'LC',
  'VC',
  'WS',
  'LR',
]);

/**
 * The region subtag of a locale identifier, upper-cased, or null when it has
 * none (a bare "fr", or "es-419", whose numeric region is a continent and so
 * cannot decide a country's signage).
 *
 * Accepts both spellings the platforms hand back: BCP 47 from `Intl`
 * ("en-GB", "zh-Hant-TW") and ICU from iOS and Android ("en_GB",
 * "sr_Latn_RS", "en_GB@calendar=gregorian"). Stops at an extension or
 * private-use singleton, so "en-u-rg-gbzzzz" is read as region-less rather
 * than mistaken for anything.
 */
export function regionOfLocale(tag: string | null | undefined): string | null {
  if (typeof tag !== 'string') return null;
  const base = tag.split(/[@.]/)[0];
  const parts = base.split(/[-_]/).filter(Boolean);
  // parts[0] is the language; a region can only follow it.
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (p.length === 1) return null; // -u-, -x-: extensions, not a region
    if (/^[A-Za-z]{2}$/.test(p)) return p.toUpperCase();
    if (/^\d{3}$/.test(p)) return null; // UN M.49 area, not a country
    // 4 letters is a script ("Hant"); 5–8 is a variant. Keep looking.
  }
  return null;
}

/** km/h unless `region` signs its roads in mph. */
export function unitForRegion(region: string | null | undefined): UnitPref {
  return region && MPH_REGIONS.has(region.toUpperCase()) ? 'imperial' : 'metric';
}

/**
 * The default unit from the locale identifiers the device reports, most
 * specific source first. The first identifier that names a region decides; a
 * device that names none (or an empty list) gets km/h, the unit most of the
 * world drives in.
 */
export function defaultUnitForLocales(tags: readonly (string | null | undefined)[]): UnitPref {
  for (const tag of tags) {
    const region = regionOfLocale(tag);
    if (region) return unitForRegion(region);
  }
  return 'metric';
}
