import { AUTO_END_HOLD_MS, AUTO_START_HOLD_MS, DriveEngine } from '../engine';
import { Fix } from '../types';
import { degrees, epochMs, gForce, metres, mps } from '@/types/units';

const T0 = 1_700_000_000_000;

function fix(t: number, speedMs: number): Fix {
  return {
    t: epochMs(t),
    lat: degrees(51.5),
    lon: degrees(-0.12),
    speedMs: mps(speedMs),
    accuracyM: metres(5),
  };
}

describe('DriveEngine auto start/stop', () => {
  test('auto-starts after sustained motion > 15 km/h for 30 s', () => {
    const e = new DriveEngine();
    let started = false;
    for (let s = 0; s <= AUTO_START_HOLD_MS / 1000; s++) {
      const events = e.onFix(fix(T0 + s * 1000, 10)); // 10 m/s = 36 km/h
      if (events.some((ev) => ev.type === 'start')) started = true;
    }
    expect(started).toBe(true);
    expect(e.getState()).toBe('recording');
  });

  test('the run-up fixes are included in the drive once it starts', () => {
    const e = new DriveEngine();
    const all: ReturnType<DriveEngine['onFix']> = [];
    for (let s = 0; s <= AUTO_START_HOLD_MS / 1000; s++) {
      all.push(...e.onFix(fix(T0 + s * 1000, 10)));
    }
    const fixEvents = all.filter((ev) => ev.type === 'fix');
    // every armed fix should be flushed into the drive
    expect(fixEvents.length).toBeGreaterThanOrEqual(AUTO_START_HOLD_MS / 1000);
  });

  test('brief motion does not start a drive', () => {
    const e = new DriveEngine();
    for (let s = 0; s < 10; s++) e.onFix(fix(T0 + s * 1000, 10));
    // drops below threshold before 30 s hold
    const events = e.onFix(fix(T0 + 10_000, 0.5));
    expect(events.length).toBe(0);
    expect(e.getState()).toBe('idle');
  });

  test('auto-ends after 3 min stationary', () => {
    const e = new DriveEngine();
    e.startManual(epochMs(T0));
    e.onFix(fix(T0 + 1000, 20));
    let ended = false;
    const stationaryStart = T0 + 2000;
    for (let s = 0; s <= AUTO_END_HOLD_MS / 1000; s++) {
      const events = e.onFix(fix(stationaryStart + s * 1000, 0));
      if (events.some((ev) => ev.type === 'end')) ended = true;
    }
    expect(ended).toBe(true);
    expect(e.getState()).toBe('idle');
  });

  test('a stop at the lights does not end the drive', () => {
    const e = new DriveEngine();
    e.startManual(epochMs(T0));
    e.onFix(fix(T0 + 1000, 20));
    // 60 s stationary — under the 3 min hold
    for (let s = 0; s < 60; s++) {
      const events = e.onFix(fix(T0 + 2000 + s * 1000, 0));
      expect(events.some((ev) => ev.type === 'end')).toBe(false);
    }
    // pulls away again
    e.onFix(fix(T0 + 63_000, 15));
    expect(e.getState()).toBe('recording');
  });

  test('manual stop ends immediately', () => {
    const e = new DriveEngine();
    e.startManual(epochMs(T0));
    const events = e.stopManual(epochMs(T0 + 5000));
    expect(events).toEqual([{ type: 'end', at: T0 + 5000 }]);
    expect(e.getState()).toBe('idle');
  });

  test('adaptive IMU rate: 10 Hz under hard accel, 1 Hz cruising', () => {
    const e = new DriveEngine();
    e.startManual(epochMs(T0));
    expect(e.desiredImuHz(gForce(0.05))).toBe(1);
    expect(e.desiredImuHz(gForce(0.6))).toBe(10);
    e.stopManual(epochMs(T0 + 1000));
    expect(e.desiredImuHz(gForce(0.6))).toBe(1); // not recording → battery discipline
  });
});
