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
 * The running build number.
 *
 * EAS owns this under `appVersionSource: remote` and injects the resolved value
 * into the manifest at build time; `app.json` deliberately has no
 * `ios.buildNumber` for it to disagree with. In a dev client there is nothing
 * to inject, so this returns null and the gate stands down.
 */
export function currentBuildNumber(): number | null {
  const ios = Constants.expoConfig?.ios?.buildNumber;
  const android = Constants.expoConfig?.android?.versionCode;
  const raw = ios ?? (android != null ? String(android) : undefined);
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export async function checkVersionGate(
  platform: 'ios' | 'android',
): Promise<VersionGate> {
  if (!supabase) return { status: 'ok' };

  const build = currentBuildNumber();
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
