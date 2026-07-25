/**
 * Speed distribution over a recorded fix stream (You tab, §3.9).
 *
 * Bins are display bins — 10 mph and 20 km/h — and each unit is bucketed
 * exactly from the SI series rather than re-bucketed from the other. Converting
 * one histogram into the other would shift samples across boundaries and report
 * a distribution the trace does not contain.
 *
 * Runs the same gateFixes/deriveSpeeds pipeline as stats.ts, so the histogram
 * and the drive summary always describe the same filtered stream. A drive with
 * nothing to say contributes nothing; it never contributes zeros that a chart
 * could dress up as a reading.
 */

import { deriveSpeeds, gateFixes } from './stats';
import { Fix } from './types';
import { msToKmh, msToMph, UnitPref } from './units';

/** Bands per unit: the last one is open-ended ("100+", "200+"). */
export const BIN_COUNT = 11;
const MPH_BIN = 10;
const KMH_BIN = 20;

export type SpeedBins = { mph: number[]; kmh: number[] };

export function emptyBins(): SpeedBins {
  return {
    mph: new Array<number>(BIN_COUNT).fill(0),
    kmh: new Array<number>(BIN_COUNT).fill(0),
  };
}

function bucket(value: number, width: number): number {
  return Math.min(BIN_COUNT - 1, Math.floor(value / width));
}

/** Sample counts per speed band, from the gated and smoothed speed series. */
export function speedBins(fixes: Fix[]): SpeedBins {
  const bins = emptyBins();
  const gated = gateFixes(fixes);
  if (gated.length < 2) return bins;
  for (const ms of deriveSpeeds(gated)) {
    if (!Number.isFinite(ms) || ms < 0) continue;
    bins.mph[bucket(msToMph(ms), MPH_BIN)]++;
    bins.kmh[bucket(msToKmh(ms), KMH_BIN)]++;
  }
  return bins;
}

export function addBins(a: SpeedBins, b: SpeedBins): SpeedBins {
  return {
    mph: a.mph.map((n, i) => n + b.mph[i]),
    kmh: a.kmh.map((n, i) => n + b.kmh[i]),
  };
}

export function binsFor(bins: SpeedBins, pref: UnitPref): number[] {
  return pref === 'imperial' ? bins.mph : bins.kmh;
}

export function binTotal(bins: SpeedBins, pref: UnitPref): number {
  return binsFor(bins, pref).reduce((s, n) => s + n, 0);
}

/** Axis label for a band, e.g. "40–50" or "100+". */
export function binLabel(index: number, pref: UnitPref): string {
  const width = pref === 'imperial' ? MPH_BIN : KMH_BIN;
  const lo = index * width;
  return index === BIN_COUNT - 1 ? `${lo}+` : `${lo}–${lo + width}`;
}
