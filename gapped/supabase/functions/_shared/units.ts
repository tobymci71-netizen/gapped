// AUTO-GENERATED from src/ by scripts/build-edge-shared.mjs — do not edit here.
/**
 * The single unit-conversion layer. One canonical unit (SI) is stored;
 * conversion happens here, at render, and nowhere else.
 *
 * TripRank displays a 124 mph run as "79 km/h" on its leaderboard because it
 * converts in the wrong place. This module is why we don't.
 *
 * The quantity types live in src/types/units.ts. The functions here take
 * branded SI inputs and return branded display outputs, so converting an
 * already-converted value — the 313 km/h bug — cannot compile: nothing here
 * accepts a `Mph | Kmh`.
 */

import {
  DisplayDistance,
  DisplaySpeed,
  Metres,
  MetresPerSecond,
  Seconds,
  metersToKm,
  metersToMiles,
  msToKmh,
  msToMph,
  mps,
  metres as metresOf,
} from './unit-types.ts';

export type UnitPref = 'metric' | 'imperial';

// Re-exported so existing importers of '@/drive/units' keep working; the
// definitions live in types/units.ts alongside the brands they convert.
export {
  METERS_PER_MILE,
  MS_PER_KMH,
  MS_PER_MPH,
  metersToKm,
  metersToMiles,
  msToKmh,
  msToMph,
} from './unit-types.ts';

/** 60 mph in m/s — the 0-60 target speed. */
export const SIXTY_MPH_MS: MetresPerSecond = mps(60 * 0.44704);

/** 1-foot rollout, metres (drag-strip convention; published methodology). */
export const ROLLOUT_M: Metres = metresOf(0.3048);

/**
 * Convert a speed for display.
 *
 * Takes m/s and ONLY m/s. The return value is branded `Mph | Kmh`, which is
 * not assignable to `MetresPerSecond`, so its result can never be fed back in
 * here — the exact mistake that put 313 km/h on the welcome screen.
 */
export function speedForDisplay(ms: MetresPerSecond, pref: UnitPref): DisplaySpeed {
  return pref === 'imperial'
    ? { value: msToMph(ms), unit: 'mph' }
    : { value: msToKmh(ms), unit: 'km/h' };
}

export function distanceForDisplay(m: Metres, pref: UnitPref): DisplayDistance {
  return pref === 'imperial'
    ? { value: metersToMiles(m), unit: 'mi' }
    : { value: metersToKm(m), unit: 'km' };
}

export function formatSpeed(ms: MetresPerSecond, pref: UnitPref): string {
  const { value, unit } = speedForDisplay(ms, pref);
  return `${Math.round(value)} ${unit}`;
}

export function formatDistance(m: Metres, pref: UnitPref): string {
  const { value, unit } = distanceForDisplay(m, pref);
  return `${value.toFixed(1)} ${unit}`;
}

export function formatDuration(totalS: Seconds): string {
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
