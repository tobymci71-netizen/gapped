/**
 * Synthetic GPS fixture traces with known ground truth.
 *
 * All traces run due north from a fixed origin so distance maths is easy to
 * reason about: 1 degree latitude ≈ 111,194.9 m (2πR/360 with R = 6371008.8 m).
 */

import { Fix } from '../types';

export const ORIGIN = { lat: 51.5, lon: -0.12 };
export const M_PER_DEG_LAT = (2 * Math.PI * 6371008.8) / 360;

type TraceOpts = {
  startT?: number;
  accuracyM?: number | (() => number);
  withImu?: boolean;
};

/** Build a trace from a speed profile: speeds[i] is speed (m/s) at second i. */
export function traceFromSpeeds(speeds: number[], opts: TraceOpts = {}): Fix[] {
  const startT = opts.startT ?? 1_700_000_000_000;
  const fixes: Fix[] = [];
  let lat = ORIGIN.lat;
  let prevSpeed = 0;
  for (let i = 0; i < speeds.length; i++) {
    const v = speeds[i];
    if (i > 0) {
      // advance by the mean speed over the second (trapezoid), due north
      lat += ((prevSpeed + v) / 2) / M_PER_DEG_LAT;
    }
    prevSpeed = v;
    const accel = i > 0 ? (v - speeds[i - 1]) / 9.80665 : 0; // longitudinal, in g
    const accuracy =
      typeof opts.accuracyM === 'function'
        ? opts.accuracyM()
        : opts.accuracyM ?? 5 + Math.sin(i * 1.7) * 1.5; // natural jitter by default
    fixes.push({
      t: startT + i * 1000,
      lat,
      lon: ORIGIN.lon,
      speedMs: v,
      accuracyM: accuracy,
      altitudeM: 30,
      heading: 0,
      ...(opts.withImu === false
        ? {}
        : {
            accelX: accel,
            accelY: 0.02 * Math.sin(i), // road noise
            accelZ: 0.03 * Math.cos(i * 0.7),
          }),
      pressureHpa: 1013 + Math.sin(i * 0.1),
      isMock: false,
    });
  }
  return fixes;
}

/** 10 Hz variant for the 0-60 pull (dt = 100 ms). */
export function traceFromSpeeds10Hz(speeds: number[], opts: TraceOpts = {}): Fix[] {
  const startT = opts.startT ?? 1_700_000_000_000;
  const fixes: Fix[] = [];
  let lat = ORIGIN.lat;
  let prevSpeed = 0;
  for (let i = 0; i < speeds.length; i++) {
    const v = speeds[i];
    if (i > 0) {
      lat += (((prevSpeed + v) / 2) * 0.1) / M_PER_DEG_LAT;
    }
    prevSpeed = v;
    const accel = i > 0 ? (v - speeds[i - 1]) / 0.1 / 9.80665 : 0;
    fixes.push({
      t: startT + i * 100,
      lat,
      lon: ORIGIN.lon,
      speedMs: v,
      accuracyM: typeof opts.accuracyM === 'function' ? opts.accuracyM() : opts.accuracyM ?? 5 + Math.sin(i) * 1.2,
      altitudeM: 30,
      heading: 0,
      accelX: accel,
      accelY: 0.01,
      accelZ: 0.02,
      pressureHpa: 1013,
      isMock: false,
    });
  }
  return fixes;
}

/**
 * Clean 60 s cruise at 20 m/s.
 * Ground truth: distance ≈ 1180 m (accel from 0 in first second), max 20 m/s.
 */
export function cleanCruise(): Fix[] {
  const speeds = Array.from({ length: 60 }, (_, i) => (i === 0 ? 0 : 20));
  return traceFromSpeeds(speeds);
}

/**
 * A textbook 0-60 pull at 10 Hz: 3 s standstill, then constant 5 m/s²
 * to past 60 mph (26.8224 m/s → crossed at t = 5.36 s after launch).
 * Ground truth (with 1-ft rollout at constant a): t_rollout = sqrt(2·0.3048/5)
 * ≈ 0.349 s, so expected 0-60 ≈ 5.36 − 0.349 ≈ 5.02 s.
 */
export function zeroSixtyPull(): Fix[] {
  const speeds: number[] = [];
  for (let i = 0; i < 30; i++) speeds.push(0); // 3 s standstill
  for (let i = 1; i <= 60; i++) speeds.push(Math.min(i * 0.1 * 5, 30)); // 5 m/s²
  return traceFromSpeeds10Hz(speeds);
}

/** Same pull but with a lift mid-run — must NOT produce a 0-60 time. */
export function dirtyPullWithLift(): Fix[] {
  const speeds: number[] = [];
  for (let i = 0; i < 30; i++) speeds.push(0);
  for (let i = 1; i <= 30; i++) speeds.push(i * 0.1 * 5); // to 15 m/s
  for (let i = 0; i < 10; i++) speeds.push(15 - i * 0.3); // lift: decel 3 m/s²
  for (let i = 1; i <= 40; i++) speeds.push(12 + i * 0.1 * 5);
  return traceFromSpeeds10Hz(speeds);
}

/** Teleport spoof: mid-cruise the position jumps ~5 km in one second. */
export function teleportSpoof(): Fix[] {
  const fixes = cleanCruise();
  for (let i = 30; i < fixes.length; i++) {
    fixes[i] = { ...fixes[i], lat: fixes[i].lat + 0.045 }; // ~5 km jump at i=30
  }
  return fixes;
}

/** Simulator signature: perfectly constant accuracy, no jitter. */
export function simulatedRoute(): Fix[] {
  return traceFromSpeeds(
    Array.from({ length: 60 }, (_, i) => (i === 0 ? 0 : 25)),
    { accuracyM: 5 },
  );
}

/** Mock-provider trace (Android GPS spoofing app). */
export function mockProviderTrace(): Fix[] {
  return cleanCruise().map((f) => ({ ...f, isMock: true }));
}

/**
 * Physically impossible: speed profile of a jet, sustained 30 m/s² for 10 s.
 */
export function jetAccelTrace(): Fix[] {
  const speeds = Array.from({ length: 20 }, (_, i) => i * 30);
  return traceFromSpeeds(speeds);
}

/** Cruise with one garbage fix (accuracy 500 m, speed 90 m/s) that gating must reject. */
export function cruiseWithGlitch(): Fix[] {
  const fixes = cleanCruise();
  fixes[30] = { ...fixes[30], speedMs: 90, accuracyM: 500 };
  return fixes;
}
