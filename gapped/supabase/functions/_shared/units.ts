// AUTO-GENERATED from src/ by scripts/build-edge-shared.mjs — do not edit here.
/**
 * The single unit-conversion layer. One canonical unit (SI) is stored;
 * conversion happens here, at render, and nowhere else.
 *
 * TripRank displays a 124 mph run as "79 km/h" on its leaderboard because it
 * converts in the wrong place. This module is why we don't.
 */

export type UnitPref = 'metric' | 'imperial';

export const MS_PER_MPH = 0.44704;
export const MS_PER_KMH = 1 / 3.6;
export const METERS_PER_MILE = 1609.344;

/** 60 mph in m/s — the 0-60 target speed. */
export const SIXTY_MPH_MS = 60 * MS_PER_MPH;

/** 1-foot rollout, metres (drag-strip convention; published methodology). */
export const ROLLOUT_M = 0.3048;

export function msToMph(ms: number): number {
  return ms / MS_PER_MPH;
}

export function msToKmh(ms: number): number {
  return ms * 3.6;
}

export function metersToMiles(m: number): number {
  return m / METERS_PER_MILE;
}

export function metersToKm(m: number): number {
  return m / 1000;
}

export function speedForDisplay(ms: number, pref: UnitPref): { value: number; unit: string } {
  return pref === 'imperial'
    ? { value: msToMph(ms), unit: 'mph' }
    : { value: msToKmh(ms), unit: 'km/h' };
}

export function distanceForDisplay(m: number, pref: UnitPref): { value: number; unit: string } {
  return pref === 'imperial'
    ? { value: metersToMiles(m), unit: 'mi' }
    : { value: metersToKm(m), unit: 'km' };
}

export function formatSpeed(ms: number, pref: UnitPref): string {
  const { value, unit } = speedForDisplay(ms, pref);
  return `${Math.round(value)} ${unit}`;
}

export function formatDistance(m: number, pref: UnitPref): string {
  const { value, unit } = distanceForDisplay(m, pref);
  return `${value.toFixed(1)} ${unit}`;
}

export function formatDuration(totalS: number): string {
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
