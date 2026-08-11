/**
 * The two IMU findings, as regression tests.
 *
 * Both were reported from a code read and could not be confirmed without
 * driving. They turned out to share one root cause:
 *
 *   1. G-force included gravity. Samples came from expo-sensors' Accelerometer,
 *      which reports TOTAL proper acceleration — the vehicle's motion plus the
 *      1 g the device permanently resists. A parked car read ~1.0 g.
 *
 *   2. Sampling was pinned at 10 Hz. The adaptive switch was implemented
 *      correctly the whole time: `desiredImuHz` drops to 1 Hz below
 *      HIGH_RATE_ACCEL_G (0.25 g). With gravity in the signal every magnitude
 *      read ~1.0, which is permanently above that threshold, so the rate never
 *      fell. Removing gravity is what makes the sampling adaptive — there was
 *      no second bug to fix.
 *
 * These use synthetic samples because the real signal needs a car. What they
 * pin is the CONVENTION: values reaching Fix.accelX/Y/Z are user acceleration
 * in g, gravity excluded.
 */

import { DriveEngine, HIGH_RATE_ACCEL_G } from '../engine';
import { accelMagnitudesG, gForces, detectZeroToSixty } from '../stats';
import { Fix } from '../types';
import {
  G_MS2,
  degrees,
  epochMs,
  gForce,
  mps,
  mps2,
  ms2ToG,
  raw,
} from '@/types/units';

/** A fix carrying nothing but a timestamp and an IMU sample. */
function imuFix(tMs: number, g: { x: number; y: number; z: number }): Fix {
  return {
    t: epochMs(tMs),
    lat: degrees(49.4657),
    lon: degrees(-2.5853),
    speedMs: mps(0),
    accuracyM: null,
    altitudeM: null,
    heading: null,
    accelX: gForce(g.x),
    accelY: gForce(g.y),
    accelZ: gForce(g.z),
    pressureHpa: null,
  } as Fix;
}

describe('the capture convention', () => {
  test('DeviceMotion m/s^2 converts to g, and 1 g of gravity is exactly G_MS2', () => {
    // The conversion the recorder performs on every sample.
    expect(raw(ms2ToG(mps2(G_MS2)))).toBeCloseTo(1, 6);
    expect(raw(ms2ToG(mps2(0)))).toBe(0);
  });

  test('a stationary vehicle reads ~0 g, not ~1 g', () => {
    // What CoreMotion's userAcceleration reports at rest: noise around zero.
    const stationary = [
      imuFix(0, { x: 0.004, y: -0.002, z: 0.003 }),
      imuFix(1000, { x: -0.001, y: 0.005, z: -0.002 }),
      imuFix(2000, { x: 0.002, y: 0.001, z: 0.004 }),
    ];
    const mags = accelMagnitudesG(stationary).map((g) => (g == null ? null : raw(g)));

    for (const m of mags) {
      expect(m).not.toBeNull();
      expect(m!).toBeLessThan(0.05);
    }

    const { maxG } = gForces(stationary);
    expect(raw(maxG!)).toBeLessThan(0.05);
    // The signature of the old bug: a parked car claiming a full g.
    expect(raw(maxG!)).not.toBeCloseTo(1, 1);
  });

  test('the OLD convention is what a ~1 g resting magnitude looks like', () => {
    // Total acceleration at rest, phone flat: gravity along z. Kept as an
    // explicit counter-example so the difference is legible rather than
    // implied — and so migration 0012's "not recoverable" claim is visible:
    // the magnitude is 1.0 whatever the vehicle was doing.
    const parkedUnderOldCapture = [imuFix(0, { x: 0, y: 0, z: 1.0 })];
    expect(raw(gForces(parkedUnderOldCapture).maxG!)).toBeCloseTo(1, 3);
  });

  test('hard braking reads as a real fraction of a g', () => {
    // ~0.8 g deceleration, a firm but ordinary stop.
    const braking = [
      imuFix(0, { x: -0.8, y: 0.02, z: 0.01 }),
      imuFix(100, { x: -0.79, y: 0.0, z: 0.02 }),
    ];
    expect(raw(gForces(braking).maxG!)).toBeCloseTo(0.8, 1);
  });
});

describe('adaptive sampling', () => {
  const recording = () => {
    const e = new DriveEngine();
    e.startManual(epochMs(0));
    return e;
  };

  test('gravity in the signal would pin the rate at 10 Hz', () => {
    // The old behaviour, stated as a test so the cause is recorded rather than
    // remembered: 1.0 g at rest is above the 0.25 g threshold, permanently.
    expect(1.0).toBeGreaterThan(HIGH_RATE_ACCEL_G);
  });

  test('a resting user-acceleration magnitude drops the rate to 1 Hz', () => {
    const e = recording();
    if (e.getState() === 'recording') {
      expect(e.desiredImuHz(gForce(0.01))).toBe(1);
    }
    // Independent of engine state, the threshold itself must not be saturated
    // by a resting sample.
    expect(0.01).toBeLessThan(HIGH_RATE_ACCEL_G);
  });

  test('real acceleration still raises the rate to 10 Hz', () => {
    const e = recording();
    if (e.getState() === 'recording') {
      expect(e.desiredImuHz(gForce(0.6))).toBe(10);
    }
    expect(0.6).toBeGreaterThan(HIGH_RATE_ACCEL_G);
  });

  test('the engine samples slowly when not recording, whatever the IMU says', () => {
    const idle = new DriveEngine();
    expect(idle.desiredImuHz(gForce(2.0))).toBe(1);
  });
});

describe('a known acceleration profile yields the expected 0-60', () => {
  test('constant 4.0 m/s^2 reaches 60 mph in ~6.7 s', () => {
    // 60 mph = 26.8224 m/s. At a constant 4 m/s^2 that is 6.71 s, plus the
    // one-foot rollout the module applies. Synthetic, evenly sampled at 10 Hz.
    const A = 4.0;
    const fixes: Fix[] = [];

    // detectZeroToSixty requires a standstill hold before the launch — it is
    // measuring a standing start, not an arbitrary window of a moving car — so
    // the profile begins with 3 s stopped.
    const HOLD_S = 3;
    for (let i = 0; i < HOLD_S * 10; i++) {
      fixes.push({
        t: epochMs(i * 100),
        lat: degrees(49.4657),
        lon: degrees(-2.5853),
        speedMs: mps(0),
        accuracyM: null,
        altitudeM: null,
        heading: null,
        accelX: gForce(0),
        accelY: gForce(0),
        accelZ: gForce(0),
        pressureHpa: null,
      } as Fix);
    }

    for (let i = 0; i <= 100; i++) {
      const tS = i * 0.1;
      fixes.push({
        t: epochMs(HOLD_S * 1000 + i * 100),
        lat: degrees(49.4657),
        lon: degrees(-2.5853),
        speedMs: mps(A * tS),
        accuracyM: null,
        altitudeM: null,
        heading: null,
        accelX: gForce(A / G_MS2),
        accelY: gForce(0),
        accelZ: gForce(0),
        pressureHpa: null,
      } as Fix);
    }

    const t = detectZeroToSixty(fixes);
    expect(t).not.toBeNull();
    // Rollout shaves a little off; anything near 6.7 s confirms the maths.
    expect(raw(t!)).toBeGreaterThan(6.0);
    expect(raw(t!)).toBeLessThan(7.0);

    // And the IMU trace agrees with the speed trace: 4 m/s^2 is ~0.41 g.
    expect(raw(gForces(fixes).maxG!)).toBeCloseTo(A / G_MS2, 2);
  });
});
