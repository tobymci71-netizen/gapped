/**
 * Minimum supported build.
 *
 * Once a broken build is in the wild there is no way to tell it to stop. Adding
 * this later cannot help the builds already out there, because they will not
 * know to ask — which is the whole reason it goes in before the first
 * TestFlight rather than after the first incident.
 *
 * Deliberately not expo-updates. This does not push code, it refuses to run,
 * which still works when the bug is native — exactly the case OTA cannot fix.
 *
 * ─── FAILS OPEN, ON PURPOSE ──────────────────────────────────────────────────
 * If the build number cannot be determined, or the network is down, or the
 * table is unreachable, the app runs. The asymmetry is deliberate: a false
 * block bricks the app for every user at once with no recourse and no way to
 * ship a fix they can reach, whereas a missed block leaves things exactly as
 * they are today. The only state that blocks is a successful read that says so.
 */

import Constants from 'expo-constants';
import { supabase } from './supabase';

export type VersionGate =
  | { status: 'ok' }
  /** Blocked, with copy to show. `message` is null when the server had none. */
  | { status: 'blocked'; message: string | null };

/**
 * Which build number to compare, from what the platform reports. Pure — tested.
 *
 * Read from the NATIVE binary, never from `Constants.expoConfig`. expoConfig is
 * app.json as it stood at build time, embedded by expo-constants, and under
 * `appVersionSource: remote` EAS writes the resolved number into Info.plist /
 * build.gradle after prebuild — never into app.json, which deliberately has no
 * `ios.buildNumber` for it to disagree with. Reading expoConfig therefore gave
 * null on every EAS build, and the gate stood down for exactly the builds it
 * exists to stop.
 *
 * - iOS: `Constants.platform.ios.buildNumber` is CFBundleVersion, the number
 *   EAS set. Null in Expo Go.
 * - Android: expo-constants exposes no versionCode (its Android service returns
 *   an empty platform map), and expo-application, which does, is not a
 *   dependency. Null, so the gate stands down on Android rather than compare
 *   against a number that is not this binary's. Never fall back to the iOS
 *   value: the two counters are independent under remote versioning, and a
 *   cross-platform comparison is how a false block happens.
 * - Debug builds (a dev client): null. Their CFBundleVersion is prebuild's
 *   default "1", which says nothing about which release they are, and a dev
 *   client blocked by production's min_build is a developer locked out of
 *   their own app.
 *
 * Anything that is not a plain positive integer is null too. CFBundleVersion
 * may legally be "1.0.3"; parseInt would read that as 1 and block it.
 */
export function resolveBuildNumber(input: {
  platform: 'ios' | 'android';
  isDev: boolean;
  iosBuildNumber: string | null | undefined;
}): number | null {
  if (input.isDev || input.platform !== 'ios') return null;
  const raw = input.iosBuildNumber?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** The running binary's build number, or null when it cannot be known. */
export function currentBuildNumber(platform: 'ios' | 'android'): number | null {
  return resolveBuildNumber({
    platform,
    isDev: __DEV__,
    iosBuildNumber: Constants.platform?.ios?.buildNumber,
  });
}

export async function checkVersionGate(
  platform: 'ios' | 'android',
): Promise<VersionGate> {
  if (!supabase) return { status: 'ok' };

  const build = currentBuildNumber(platform);
  if (build == null) return { status: 'ok' };

  const { data, error } = await supabase
    .from('app_releases')
    .select('min_build, message')
    .eq('platform', platform)
    .maybeSingle();

  // Unreachable, unreadable, or no row: run. See the header.
  if (error || !data) return { status: 'ok' };

  return build < data.min_build
    ? { status: 'blocked', message: data.message ?? null }
    : { status: 'ok' };
}
