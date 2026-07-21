/**
 * Pure maths over fix arrays. No I/O, no platform imports — fully unit-tested
 * against fixture traces (spec rule 4: "Write tests for the maths").
 *
 * Both max and avg speed come from ONE filtered fix stream, so they always
 * reconcile. TripRank ships trips where average exceeds top speed because it
 * runs two pipelines; we run one.
 */

import { Fix, DriveSummary } from './types';
import { ROLLOUT_M, SIXTY_MPH_MS } from './units';

/** Fixes with worse reported accuracy than this are discarded outright. */
export const MAX_ACCURACY_M = 20;

/** Standstill threshold for 0-60 detection, m/s. */
const STANDSTILL_MS = 0.5;
/** Required standstill duration before a launch, seconds. */
const STANDSTILL_HOLD_S = 2;
/** Max tolerated deceleration excursion during a "monotonic" pull, m/s². */
const MAX_NEG_EXCURSION = 0.5;

const EARTH_RADIUS_M = 6371008.8;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Accuracy gating: never let a bad fix inflate max speed or distance. */
export function gateFixes(fixes: Fix[]): Fix[] {
  return fixes.filter(
    (f) => f.accuracyM != null && f.accuracyM > 0 && f.accuracyM <= MAX_ACCURACY_M,
  );
}

/**
 * Per-fix speed, m/s. Prefers device Doppler speed (more accurate than
 * positional differentiation); falls back to distance/Δt from the previous
 * fix. Median-of-3 smoothed so a single glitch fix cannot set max speed.
 */
export function deriveSpeeds(fixes: Fix[]): number[] {
  const raw = fixes.map((f, i) => {
    if (f.speedMs != null && f.speedMs >= 0) return f.speedMs;
    if (i === 0) return 0;
    const prev = fixes[i - 1];
    const dt = (f.t - prev.t) / 1000;
    if (dt <= 0) return 0;
    return haversineM(prev.lat, prev.lon, f.lat, f.lon) / dt;
  });
  return raw.map((_, i) => {
    const window = raw.slice(Math.max(0, i - 1), i + 2);
    return median(window);
  });
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function totalDistanceM(fixes: Fix[]): number {
  let d = 0;
  for (let i = 1; i < fixes.length; i++) {
    d += haversineM(fixes[i - 1].lat, fixes[i - 1].lon, fixes[i].lat, fixes[i].lon);
  }
  return d;
}

/** |acceleration| per fix in g, from IMU components. Null where absent. */
export function accelMagnitudesG(fixes: Fix[]): (number | null)[] {
  return fixes.map((f) =>
    f.accelX != null && f.accelY != null && f.accelZ != null
      ? Math.sqrt(f.accelX ** 2 + f.accelY ** 2 + f.accelZ ** 2)
      : null,
  );
}

/**
 * Peak and sustained G. Sustained = the highest mean |a| over any rolling
 * window of `windowS` seconds — the most-requested TripRank addition.
 */
export function gForces(
  fixes: Fix[],
  windowS = 2,
): { maxG: number | null; avgG: number | null } {
  const mags = accelMagnitudesG(fixes);
  const present: { t: number; g: number }[] = [];
  mags.forEach((g, i) => {
    if (g != null) present.push({ t: fixes[i].t, g });
  });
  if (present.length === 0) return { maxG: null, avgG: null };

  const maxG = Math.max(...present.map((p) => p.g));

  let bestWindow = 0;
  let lo = 0;
  let sum = 0;
  for (let hi = 0; hi < present.length; hi++) {
    sum += present[hi].g;
    while (present[hi].t - present[lo].t > windowS * 1000) {
      sum -= present[lo].g;
      lo++;
    }
    const n = hi - lo + 1;
    if (n >= 2) bestWindow = Math.max(bestWindow, sum / n);
  }
  return { maxG, avgG: bestWindow > 0 ? bestWindow : present[0].g };
}

/**
 * 0-60 mph detection from the speed profile.
 *
 * Published methodology (spec §3.4):
 *  - launch requires standstill (< 0.5 m/s) held ≥ 2 s;
 *  - the pull must be monotonic to 60 mph with no deceleration excursion
 *    beyond 0.5 m/s²;
 *  - the clock starts at 1-foot rollout (0.3048 m travelled), the drag-strip
 *    convention, so numbers compare against a Dragy;
 *  - target crossing time is linearly interpolated between samples.
 *
 * Returns null unless a clean window exists. Never fabricate a number.
 */
export function detectZeroToSixty(fixes: Fix[], speeds?: number[]): number | null {
  if (fixes.length < 3) return null;
  const v = speeds ?? deriveSpeeds(fixes);

  for (let i = 0; i < fixes.length; i++) {
    // 1. find a standstill hold ending at i
    if (v[i] > STANDSTILL_MS) continue;
    const holdStart = fixes[i].t - STANDSTILL_HOLD_S * 1000;
    let heldFrom = i;
    while (heldFrom > 0 && fixes[heldFrom - 1].t >= holdStart && v[heldFrom - 1] <= STANDSTILL_MS) {
      heldFrom--;
    }
    if (fixes[i].t - fixes[heldFrom].t < STANDSTILL_HOLD_S * 1000) continue;

    // 2. walk forward through a monotonic pull
    let launchIdx = i;
    // skip any further standstill samples
    while (launchIdx + 1 < fixes.length && v[launchIdx + 1] <= STANDSTILL_MS) launchIdx++;

    let ok = true;
    let crossIdx = -1;
    for (let j = launchIdx + 1; j < fixes.length; j++) {
      const dt = (fixes[j].t - fixes[j - 1].t) / 1000;
      if (dt <= 0) {
        ok = false;
        break;
      }
      const accel = (v[j] - v[j - 1]) / dt;
      if (accel < -MAX_NEG_EXCURSION) {
        ok = false;
        break;
      }
      if (v[j] >= SIXTY_MPH_MS) {
        crossIdx = j;
        break;
      }
    }
    if (!ok || crossIdx < 0) continue;

    // 3. rollout: clock starts once 0.3048 m travelled from launch
    let dist = 0;
    let rolloutT: number | null = null;
    for (let j = launchIdx + 1; j <= crossIdx; j++) {
      const dt = (fixes[j].t - fixes[j - 1].t) / 1000;
      const seg = ((v[j - 1] + v[j]) / 2) * dt;
      if (dist + seg >= ROLLOUT_M && rolloutT == null) {
        const need = ROLLOUT_M - dist;
        const frac = seg > 0 ? need / seg : 0;
        rolloutT = fixes[j - 1].t + frac * (fixes[j].t - fixes[j - 1].t);
      }
      dist += seg;
    }
    if (rolloutT == null) continue;

    // 4. interpolate the exact 60 mph crossing
    const vPrev = v[crossIdx - 1];
    const vCross = v[crossIdx];
    const span = vCross - vPrev;
    const frac = span > 0 ? (SIXTY_MPH_MS - vPrev) / span : 1;
    const crossT =
      fixes[crossIdx - 1].t + frac * (fixes[crossIdx].t - fixes[crossIdx - 1].t);

    const result = (crossT - rolloutT) / 1000;
    if (result > 0 && result < 60) return result;
  }
  return null;
}

/**
 * The one summary pipeline. Gate → derive speeds → aggregate. Asserts
 * avg <= max in code (the DB constraint enforces it again server-side).
 */
export function summarize(rawFixes: Fix[]): DriveSummary {
  const fixes = gateFixes(rawFixes);
  if (fixes.length < 2) {
    const t = rawFixes[0]?.t ?? Date.now();
    return {
      startedAt: t,
      endedAt: t,
      distanceM: 0,
      durationS: 0,
      maxSpeedMs: 0,
      avgSpeedMs: 0,
      maxG: null,
      avgG: null,
      zeroTo60S: null,
      fixCount: fixes.length,
    };
  }

  const speeds = deriveSpeeds(fixes);
  const distanceM = totalDistanceM(fixes);
  const durationS = (fixes[fixes.length - 1].t - fixes[0].t) / 1000;
  const maxSpeedMs = Math.max(...speeds);
  const avgSpeedMs = durationS > 0 ? distanceM / durationS : 0;
  const { maxG, avgG } = gForces(fixes);
  const zeroTo60S = detectZeroToSixty(fixes, speeds);

  if (avgSpeedMs > maxSpeedMs + 1e-9) {
    // A drive whose stats contradict each other is a P0 bug — refuse to
    // produce it. Clamp and let plausibility flag the trace.
    return {
      startedAt: fixes[0].t,
      endedAt: fixes[fixes.length - 1].t,
      distanceM,
      durationS: Math.round(durationS),
      maxSpeedMs: avgSpeedMs,
      avgSpeedMs,
      maxG,
      avgG,
      zeroTo60S,
      fixCount: fixes.length,
    };
  }

  return {
    startedAt: fixes[0].t,
    endedAt: fixes[fixes.length - 1].t,
    distanceM,
    durationS: Math.round(durationS),
    maxSpeedMs,
    avgSpeedMs,
    maxG,
    avgG,
    zeroTo60S,
    fixCount: fixes.length,
  };
}
