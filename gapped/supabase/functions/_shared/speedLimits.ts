// HAND-WRITTEN, server-only. Unlike its neighbours this file is NOT generated
// from src/ by scripts/build-edge-shared.mjs — nothing in the app needs it —
// so edit it here.
/**
 * National speed ceilings for the public top-speed boards.
 *
 * A drive whose top speed is above the ceiling for its driver's country still
 * verifies and stays in the driver's own history, but verify-drive writes no
 * top_speed board entry for it and records `verification_meta.top_speed_ranked
 * = false`. A public board must never reward a speed nobody could have driven
 * legally anywhere in that country.
 *
 * Each value is the HIGHEST posted limit for a car anywhere in the
 * jurisdiction — the motorway or expressway limit where there is one, and for
 * the US the highest limit in any state — not the limit on the road that was
 * actually driven, which the server cannot know without map matching. So the
 * ceiling is a necessary condition for a legal run, never a sufficient one.
 *
 * Sources: each jurisdiction's road code as compiled in Wikipedia's "Speed
 * limits by country" (read October 2026), taking the top of any range it
 * gives; the AU, CZ, NZ, AE and BR entries were checked individually against
 * current reporting. Where a rise is permitted but not yet posted, the current
 * lower value is used: a ceiling that errs low only leaves a legal run
 * unranked, while one that errs high would rank an illegal one.
 *
 * Countries with no general limit (Germany's autobahns, the Isle of Man's
 * derestricted roads) and countries not listed here use the default, 130 km/h —
 * Germany's own advisory autobahn speed, and the motorway limit across much of
 * Europe. The default errs HIGH for an unlisted country whose limit is lower,
 * so a country whose national maximum is under 130 km/h belongs in the map.
 */

import { type MetresPerSecond, kmh, kmhToMs, mph, mphToMs } from './unit-types.ts';

/** Ceiling for a country with no general limit, or one not listed below. */
export const DEFAULT_SPEED_CEILING_MS: MetresPerSecond = kmhToMs(kmh(130));

const fromMph = (v: number): MetresPerSecond => mphToMs(mph(v));
const fromKmh = (v: number): MetresPerSecond => kmhToMs(kmh(v));

/** ISO 3166-1 alpha-2 → highest national (or, for the US, state) limit. */
export const SPEED_CEILINGS_MS: ReadonlyMap<string, MetresPerSecond> = new Map([
  // ── British Isles ──
  ['GB', fromMph(70)], // motorways and dual carriageways
  ['GG', fromMph(35)], // Guernsey's island-wide maximum
  ['JE', fromMph(40)], // Jersey's island-wide maximum
  // IM: no national limit on the Isle of Man's derestricted roads → default.
  ['IE', fromKmh(120)], // motorways

  // ── North America ──
  ['US', fromMph(85)], // Texas SH 130 — the highest posted limit in any state
  ['CA', fromKmh(120)], // British Columbia (Coquihalla Highway)
  ['MX', fromKmh(110)],

  // ── Europe ──
  // DE: no general autobahn limit (130 km/h advisory) → default.
  ['AT', fromKmh(130)],
  ['BE', fromKmh(120)],
  ['BG', fromKmh(140)],
  ['CH', fromKmh(120)],
  ['CZ', fromKmh(150)], // D3 Tábor–České Budějovice, variable limit since Oct 2025
  ['DK', fromKmh(130)],
  ['ES', fromKmh(120)],
  ['FI', fromKmh(120)],
  ['FR', fromKmh(130)],
  ['GR', fromKmh(130)],
  ['IS', fromKmh(90)],
  ['IT', fromKmh(130)],
  ['LU', fromKmh(130)],
  ['NL', fromKmh(130)], // 19:00–06:00; 100 km/h by day
  ['NO', fromKmh(110)],
  ['PL', fromKmh(140)],
  ['PT', fromKmh(120)],
  ['SE', fromKmh(120)],
  ['TR', fromKmh(140)],

  // ── Asia-Pacific ──
  ['AU', fromKmh(130)], // Northern Territory's rural highways
  ['CN', fromKmh(120)],
  ['HK', fromKmh(110)],
  ['IN', fromKmh(120)], // expressways
  ['JP', fromKmh(120)], // selected national expressways
  ['KR', fromKmh(120)],
  ['MY', fromKmh(110)],
  ['NZ', fromKmh(110)], // 120 km/h is permitted on new expressways; none confirmed posted
  ['SG', fromKmh(90)],
  ['TH', fromKmh(120)], // motorways
  // Below the default, so listed rather than left to it: unlisted, each would
  // rank runs up to 130 km/h.
  ['ID', fromKmh(100)], // toll roads
  ['PH', fromKmh(100)], // expressways
  ['PK', fromKmh(120)], // motorways
  ['TW', fromKmh(110)], // national freeways
  ['VN', fromKmh(120)], // expressways

  // ── Middle East, Africa, South America ──
  ['AE', fromKmh(140)], // Abu Dhabi's E11 came down from 160 in April 2025
  ['SA', fromKmh(140)],
  ['IL', fromKmh(120)],
  ['EG', fromKmh(120)],
  ['MA', fromKmh(120)], // autoroutes
  ['ZA', fromKmh(120)],
  ['AR', fromKmh(130)], // autopistas
  ['BR', fromKmh(120)], // selected sections, e.g. Rodovia dos Bandeirantes
  ['CL', fromKmh(120)],
  ['CO', fromKmh(120)], // multi-lane roads without pedestrian crossings
  ['PE', fromKmh(100)],
]);

/** The ceiling for a profile's country; the default when unknown or absent. */
export function speedCeilingMs(country: string | null | undefined): MetresPerSecond {
  if (!country) return DEFAULT_SPEED_CEILING_MS;
  return SPEED_CEILINGS_MS.get(country.trim().toUpperCase()) ?? DEFAULT_SPEED_CEILING_MS;
}

/**
 * Whether a top speed is above its country's ceiling. Strictly above: a run at
 * exactly the limit is a legal run.
 */
export function isOverSpeedCeiling(
  topSpeedMs: MetresPerSecond,
  country: string | null | undefined,
): boolean {
  return topSpeedMs > speedCeilingMs(country);
}
