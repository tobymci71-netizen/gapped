/**
 * Regression tests for the 313 km/h bug.
 *
 * On a device walkthrough the welcome speedometer read 313 km/h while the
 * phone was stationary. `demoSpeed` held 87 — already converted to mph for
 * display — and it was passed to `speedForDisplay`, which takes m/s. 87 m/s is
 * 313 km/h. Typecheck, lint and 238 tests were all green.
 *
 * Two things are asserted here: the value the dial actually receives is in
 * m/s, and the type system now refuses the mistake that produced it.
 */

import { speedForDisplay, formatSpeed } from '../units';
import { Kmh, kmh, mps, msToKmh, msToMph } from '@/types/units';

/** The welcome hero's demo speed, mirroring app/onboarding/index.tsx. */
const DEMO_MS = mps(38.9);

describe('the speedometer is fed m/s, not display units', () => {
  test('the hero demo speed renders ~140 km/h, not 313', () => {
    const metric = speedForDisplay(DEMO_MS, 'metric');
    expect(metric.value).toBeCloseTo(140, 0);
    expect(metric.unit).toBe('km/h');
    // The bug's signature: 87 m/s would have produced this.
    expect(metric.value).not.toBeCloseTo(313, 0);
  });

  test('the same SI value renders ~87 mph imperial', () => {
    const imperial = speedForDisplay(DEMO_MS, 'imperial');
    expect(imperial.value).toBeCloseTo(87, 0);
    expect(imperial.unit).toBe('mph');
  });

  test('a value already in display units cannot be converted again', () => {
    const displayed = msToKmh(DEMO_MS); // Kmh
    // @ts-expect-error Kmh is not MetresPerSecond — this is the 313 km/h bug,
    // and it is now a compile error rather than a screenshot.
    speedForDisplay(displayed, 'metric');
    // @ts-expect-error the same mistake through the formatting helper.
    formatSpeed(msToMph(DEMO_MS), 'imperial');
  });

  test('a bare number cannot stand in for a speed', () => {
    // @ts-expect-error 87 could be anything; the unit has to be stated.
    speedForDisplay(87, 'metric');
  });

  test('conversions are one-way by type: display units have no route back in', () => {
    const asKmh: Kmh = kmh(140);
    // @ts-expect-error km/h is not the canonical internal unit.
    speedForDisplay(asKmh, 'metric');
    // Round-tripping requires saying so explicitly, which is the point.
    expect(asKmh).toBeCloseTo(140, 5);
  });

  test('branding is free at runtime — a branded value IS its number', () => {
    // Guards the zero-cost claim: no wrapper, no boxing, identical value.
    expect(mps(38.9)).toBe(38.9);
    expect(typeof mps(38.9)).toBe('number');
    expect(JSON.stringify({ v: mps(38.9) })).toBe('{"v":38.9}');
  });
});
