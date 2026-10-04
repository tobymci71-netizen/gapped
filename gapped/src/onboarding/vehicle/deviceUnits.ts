/**
 * The device side of the unit default: reads the locale and, once, offers the
 * result to the profile. The rules themselves are pure, in ./localeUnits.
 */

import { I18nManager, Platform, Settings } from 'react-native';
import { useProfile } from '@/state/profile';
import { defaultUnitForLocales } from './localeUnits';

/**
 * The device's locale identifiers, most region-faithful first. No package:
 * expo-localization is not installed, and React Native already exposes what
 * this needs.
 *
 * - iOS `AppleLocale` is the Region setting itself ("en_GB"), independent of
 *   the language the phone is set to — a British phone in US English still
 *   says GB here. Read from the user-defaults dictionary React Native's
 *   Settings module mirrors.
 * - Android's I18nManager reports the configuration locale ("en_GB").
 * - `Intl` (Hermes) is the fallback on both. It can lose the region when the
 *   runtime has no data for that exact language–region pair, which is why it
 *   comes last.
 *
 * Each read is guarded: a missing native module must cost the default, never
 * the screen.
 */
export function deviceLocaleTags(): string[] {
  const tags: string[] = [];
  const push = (read: () => unknown) => {
    try {
      const v = read();
      if (typeof v === 'string' && v) tags.push(v);
    } catch {
      // Unavailable on this platform or build; the next source may answer.
    }
  };
  if (Platform.OS === 'ios') push(() => Settings.get('AppleLocale'));
  if (Platform.OS === 'android') push(() => I18nManager.getConstants().localeIdentifier);
  push(() => Intl.DateTimeFormat().resolvedOptions().locale);
  return tags;
}

/** Set once the default has been offered, so it is offered once per launch. */
let offered = false;

/**
 * Starts `unitPref` at the device's road-speed unit, before the person has
 * chosen one.
 *
 * The profile cannot tell "metric because it was chosen" from "metric
 * because that is the first-run value", so this decides by timing instead: it
 * runs once per launch, during onboarding, the first time a screen asks. The
 * unit step asks as it mounts, so going back past it and returning keeps the
 * person's pick.
 *
 * Across launches it goes by how far the person got. A country is only ever
 * set on the step after the unit step (setCountry has no other caller), so a
 * profile holding one has been past the unit cards and its unit is the
 * person's own: the app killed at the username step must not come back with
 * their km/h quietly turned into mph. What remains unprotected is a pick made
 * on the unit step itself and then killed before Continue; on relaunch the
 * default is offered again on the very screen that changes it. A finished
 * profile is never touched.
 *
 * Callable from any screen that shows a speed before the unit step (the
 * welcome dial, for instance), and idempotent across them.
 */
export function offerLocaleUnitDefault(): void {
  if (offered) return;
  offered = true;
  const { onboarded, country, unitPref, setUnitPref } = useProfile.getState();
  if (onboarded || country) return;
  const unit = defaultUnitForLocales(deviceLocaleTags());
  if (unit !== unitPref) setUnitPref(unit);
}

/**
 * Lets the default be offered again in this launch. For account deletion
 * only: reset() puts `unitPref` back to the store's first-run value, and the
 * onboarding that follows in the same process would otherwise start a British
 * phone on km/h, because the once-per-launch offer was spent on the account
 * that has just been deleted. Call it after reset(), never before — offered to
 * the old profile, the default would find it onboarded and do nothing.
 */
export function rearmLocaleUnitDefault(): void {
  offered = false;
}
