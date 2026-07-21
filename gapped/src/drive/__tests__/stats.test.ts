import {
  detectZeroToSixty,
  deriveSpeeds,
  gateFixes,
  gForces,
  haversineM,
  summarize,
  totalDistanceM,
} from '../stats';
import {
  cleanCruise,
  cruiseWithGlitch,
  dirtyPullWithLift,
  M_PER_DEG_LAT,
  ORIGIN,
  zeroSixtyPull,
} from './fixtures';

describe('haversine', () => {
  test('1 degree of latitude ≈ 111.195 km', () => {
    expect(haversineM(ORIGIN.lat, ORIGIN.lon, ORIGIN.lat + 1, ORIGIN.lon)).toBeCloseTo(
      M_PER_DEG_LAT,
      -1, // within 5 m
    );
  });
  test('zero distance for identical points', () => {
    expect(haversineM(51.5, -0.12, 51.5, -0.12)).toBe(0);
  });
});

describe('accuracy gating', () => {
  test('discards fixes with accuracy > 20 m', () => {
    const fixes = cruiseWithGlitch();
    const gated = gateFixes(fixes);
    expect(gated.length).toBe(fixes.length - 1);
    expect(gated.every((f) => (f.accuracyM ?? 99) <= 20)).toBe(true);
  });

  test('a bad fix cannot inflate max speed', () => {
    const summary = summarize(cruiseWithGlitch());
    // glitch fix claimed 90 m/s; real cruise is 20 m/s
    expect(summary.maxSpeedMs).toBeLessThan(25);
  });
});

describe('speed derivation', () => {
  test('median-of-3 suppresses a single glitch sample', () => {
    const fixes = cleanCruise();
    fixes[30] = { ...fixes[30], speedMs: 90 }; // in-band accuracy, absurd speed
    const speeds = deriveSpeeds(fixes);
    expect(Math.max(...speeds)).toBeLessThan(25);
  });

  test('falls back to positional speed when device speed is missing', () => {
    const fixes = cleanCruise().map((f) => ({ ...f, speedMs: null }));
    const speeds = deriveSpeeds(fixes);
    // steady 20 m/s cruise: derived positional speed should sit near 20
    const mid = speeds.slice(10, 50);
    for (const s of mid) expect(s).toBeGreaterThan(18);
    for (const s of mid) expect(s).toBeLessThan(22);
  });
});

describe('summary — the one pipeline', () => {
  test('distance, duration, max and avg reconcile on a clean cruise', () => {
    const summary = summarize(cleanCruise());
    expect(summary.durationS).toBe(59);
    // 58 s at 20 m/s + 10 m accel ramp ≈ 1170 m
    expect(summary.distanceM).toBeGreaterThan(1150);
    expect(summary.distanceM).toBeLessThan(1190);
    expect(summary.maxSpeedMs).toBeCloseTo(20, 1);
    // THE invariant TripRank ships violations of:
    expect(summary.avgSpeedMs).toBeLessThanOrEqual(summary.maxSpeedMs);
  });

  test('avg <= max holds on every fixture', () => {
    for (const fixes of [cleanCruise(), cruiseWithGlitch(), zeroSixtyPull(), dirtyPullWithLift()]) {
      const s = summarize(fixes);
      expect(s.avgSpeedMs).toBeLessThanOrEqual(s.maxSpeedMs + 1e-9);
    }
  });

  test('degenerate input produces zeros, not garbage', () => {
    const s = summarize([]);
    expect(s.distanceM).toBe(0);
    expect(s.maxSpeedMs).toBe(0);
    expect(s.zeroTo60S).toBeNull();
  });
});

describe('0-60 detection', () => {
  test('clean 5 m/s² pull: ≈5.02 s with 1-ft rollout', () => {
    const t = detectZeroToSixty(zeroSixtyPull());
    expect(t).not.toBeNull();
    // analytic: 26.8224/5 − sqrt(2·0.3048/5) ≈ 5.365 − 0.349 ≈ 5.02
    expect(t!).toBeGreaterThan(4.7);
    expect(t!).toBeLessThan(5.4);
  });

  test('a lift mid-pull disqualifies the run — null, never a fabricated number', () => {
    expect(detectZeroToSixty(dirtyPullWithLift())).toBeNull();
  });

  test('a cruise with no launch produces null', () => {
    expect(detectZeroToSixty(cleanCruise())).toBeNull();
  });
});

describe('G-force', () => {
  test('peak and sustained G from the IMU', () => {
    const { maxG, avgG } = gForces(zeroSixtyPull());
    expect(maxG).not.toBeNull();
    // 5 m/s² ≈ 0.51 g longitudinal
    expect(maxG!).toBeGreaterThan(0.45);
    expect(maxG!).toBeLessThan(0.65);
    expect(avgG).not.toBeNull();
    expect(avgG!).toBeLessThanOrEqual(maxG!);
  });

  test('no IMU data → nulls, never fabricated', () => {
    const noImu = cleanCruise().map((f) => ({
      ...f,
      accelX: null,
      accelY: null,
      accelZ: null,
    }));
    const { maxG, avgG } = gForces(noImu);
    expect(maxG).toBeNull();
    expect(avgG).toBeNull();
  });
});

describe('distance', () => {
  test('total distance matches the constructed profile', () => {
    const fixes = cleanCruise();
    const d = totalDistanceM(fixes);
    expect(d).toBeGreaterThan(1150);
    expect(d).toBeLessThan(1190);
  });
});
