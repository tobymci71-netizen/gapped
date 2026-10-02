import { AUTO_END_HOLD_MS, AUTO_START_HOLD_MS, DriveEngine, PRE_ROLL_MS } from '../engine';
import { detectZeroToSixty } from '../stats';
import { Fix } from '../types';
import { degrees, epochMs, gForce, metres, mps } from '@/types/units';
import { traceFromSpeeds, traceFromSpeeds10Hz } from './fixtures';

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

  test('an auto-started drive keeps the launch that started it, so its 0-60 is measurable', () => {
    // Parked 5 s, then 5 m/s² to 30 m/s (past 60 mph), then 40 s of cruise.
    const speeds: number[] = [];
    for (let i = 0; i < 50; i++) speeds.push(0);
    for (let i = 1; i <= 60; i++) speeds.push(i * 0.1 * 5);
    for (let i = 0; i < 400; i++) speeds.push(30);
    const trace = traceFromSpeeds10Hz(speeds);

    const e = new DriveEngine();
    const events = trace.flatMap((f) => e.onFix(f));
    const start = events.find((ev) => ev.type === 'start');
    const recorded = events.flatMap((ev) => (ev.type === 'fix' ? [ev.fix] : []));

    expect(e.getState()).toBe('recording');
    // Without the pre-roll the first recorded fix was already above 15 km/h.
    expect(recorded[0].speedMs).toBe(0);
    expect(start).toEqual({ type: 'start', at: recorded[0].t });
    const full = detectZeroToSixty(trace);
    expect(full).not.toBeNull();
    expect(detectZeroToSixty(recorded)).toBeCloseTo(full as number, 5);
  });

  test('at the real 1 Hz GPS rate, a launch after a long park keeps its 0-60 through the trimmed pre-roll', () => {
    // 60 s parked (far longer than the pre-roll), 3 m/s² to 30 m/s, 40 s cruise.
    const speeds: number[] = [];
    for (let s = 0; s < 60; s++) speeds.push(0);
    for (let s = 1; s <= 10; s++) speeds.push(s * 3);
    for (let s = 0; s < 40; s++) speeds.push(30);
    const trace = traceFromSpeeds(speeds);

    const e = new DriveEngine();
    const events = trace.flatMap((f) => e.onFix(f));
    const recorded = events.flatMap((ev) => (ev.type === 'fix' ? [ev.fix] : []));

    expect(e.getState()).toBe('recording');
    // Trimmed: the park is mostly gone, but the standstill hold survived.
    expect(recorded.length).toBeLessThan(trace.length - 45);
    expect(recorded[0].speedMs).toBe(0);
    const full = detectZeroToSixty(trace);
    expect(full).not.toBeNull();
    expect(detectZeroToSixty(recorded)).toBeCloseTo(full as number, 5);
  });

  test('the pre-roll is bounded: a long parked dwell is not recorded', () => {
    const e = new DriveEngine();
    const events: ReturnType<DriveEngine['onFix']> = [];
    for (let s = 0; s < 120; s++) events.push(...e.onFix(fix(T0 + s * 1000, 0)));
    const motionAt = T0 + 120_000;
    for (let s = 0; s <= AUTO_START_HOLD_MS / 1000; s++) {
      events.push(...e.onFix(fix(motionAt + s * 1000, 10)));
    }
    const recorded = events.flatMap((ev) => (ev.type === 'fix' ? [ev.fix] : []));
    expect(e.getState()).toBe('recording');
    expect(recorded[0].t).toBeGreaterThanOrEqual(motionAt - PRE_ROLL_MS);
    expect(recorded[0].t).toBeLessThan(motionAt);
  });

  test('motion that lapses stays in the pre-roll for the next attempt', () => {
    const e = new DriveEngine();
    const events: ReturnType<DriveEngine['onFix']> = [];
    // creep forward, stop at a junction, then pull away for good
    for (let s = 0; s < 3; s++) events.push(...e.onFix(fix(T0 + s * 1000, 6)));
    for (let s = 3; s < 6; s++) events.push(...e.onFix(fix(T0 + s * 1000, 0)));
    for (let s = 6; s <= 6 + AUTO_START_HOLD_MS / 1000; s++) {
      events.push(...e.onFix(fix(T0 + s * 1000, 10)));
    }
    const recorded = events.flatMap((ev) => (ev.type === 'fix' ? [ev.fix] : []));
    expect(recorded[0].t).toBe(T0);
  });

  test('manual start while parked records from the press, not the pre-roll', () => {
    const e = new DriveEngine();
    for (let s = 0; s < 8; s++) e.onFix(fix(T0 + s * 1000, 0));
    expect(e.startManual(epochMs(T0 + 8000))).toEqual([{ type: 'start', at: T0 + 8000 }]);
  });

  test('manual start while arming brings the run-up along', () => {
    const e = new DriveEngine();
    e.onFix(fix(T0, 0));
    for (let s = 1; s <= 5; s++) e.onFix(fix(T0 + s * 1000, 10));
    const events = e.startManual(epochMs(T0 + 5500));
    expect(events[0]).toEqual({ type: 'start', at: T0 + 5500 });
    expect(events.filter((ev) => ev.type === 'fix')).toHaveLength(5);
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
