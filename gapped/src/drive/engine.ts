/**
 * Recording state machine. Pure logic — no platform imports — so the
 * auto-start/auto-end behaviour is unit-testable with synthetic fix streams.
 *
 * Spec (Phase 2):
 *  - auto-start on sustained motion > 15 km/h for 30 s
 *  - auto-end after 3 min stationary
 *  - adaptive sampling: 1 Hz cruising, 10 Hz when |accel| exceeds threshold
 */

import { Fix } from './types';
import { EpochMs, GForce, MetresPerSecond, mps } from '@/types/units';

export type EngineState = 'idle' | 'arming' | 'recording' | 'stopping';

export type EngineEvent =
  | { type: 'start'; at: EpochMs }
  | { type: 'fix'; fix: Fix }
  | { type: 'end'; at: EpochMs };

export const AUTO_START_SPEED_MS: MetresPerSecond = mps(15 / 3.6); // 15 km/h
export const AUTO_START_HOLD_MS = 30_000;
export const AUTO_END_SPEED_MS: MetresPerSecond = mps(1.0);
export const AUTO_END_HOLD_MS = 3 * 60_000;

/** |accel| (g) above which we want 10 Hz IMU sampling (0-60 capture). */
export const HIGH_RATE_ACCEL_G = 0.25;

/**
 * How much history from BEFORE sustained motion an auto-started drive keeps.
 *
 * The arming buffer used to hold only fixes above 15 km/h, and any slower fix
 * emptied it — so the standstill and the 0-15 km/h part of the launch that
 * triggered the recording never reached the WAL, and that launch could never
 * produce a 0-60 (detection needs a ≥2 s standstill hold, then the whole
 * pull). 10 s covers the hold plus even a gentle pull to 15 km/h; there is no
 * value in keeping a long parked dwell.
 */
export const PRE_ROLL_MS = 10_000;

/** Hard cap on buffered fixes while not recording, whatever the fix rate. */
const MAX_BUFFERED_FIXES = 600;

export class DriveEngine {
  private state: EngineState = 'idle';
  private motionSince: EpochMs | null = null;
  private stationarySince: EpochMs | null = null;
  /**
   * Every fix seen while not recording, trimmed to the run since motion began
   * plus PRE_ROLL_MS before it — so an auto-started drive includes its run-up
   * AND the launch that led into it.
   */
  private recent: Fix[] = [];

  getState(): EngineState {
    return this.state;
  }

  /** Manual start — user pressed the button while safely parked. */
  startManual(at: EpochMs): EngineEvent[] {
    if (this.state === 'recording') return [];
    // Only the run-up of a drive that was already arming comes along — not
    // the pre-roll. Parked, the standstill before a launch is recorded live
    // from here on, and the drive should not start before the button press.
    const since = this.motionSince;
    const runUp = since != null ? this.recent.filter((f) => f.t >= since) : [];
    this.state = 'recording';
    this.stationarySince = null;
    this.motionSince = null;
    this.recent = [];
    const events: EngineEvent[] = [{ type: 'start', at }];
    for (const f of runUp) events.push({ type: 'fix', fix: f });
    return events;
  }

  /** Manual stop. */
  stopManual(at: EpochMs): EngineEvent[] {
    if (this.state !== 'recording') return [];
    this.state = 'idle';
    this.motionSince = null;
    this.stationarySince = null;
    return [{ type: 'end', at }];
  }

  /**
   * Feed a fix; returns events to act on (open WAL drive, append fix,
   * finalize). Speed for the state machine prefers device speed, else 0.
   */
  onFix(fix: Fix): EngineEvent[] {
    const speed = fix.speedMs ?? mps(0);
    const events: EngineEvent[] = [];

    switch (this.state) {
      case 'idle':
      case 'arming': {
        this.recent.push(fix);
        if (speed > AUTO_START_SPEED_MS) {
          if (this.motionSince == null) this.motionSince = fix.t;
          this.state = 'arming';
          if (fix.t - this.motionSince >= AUTO_START_HOLD_MS) {
            const from = this.motionSince - PRE_ROLL_MS;
            const drive = this.recent.filter((f) => f.t >= from);
            this.state = 'recording';
            this.stationarySince = null;
            this.motionSince = null;
            this.recent = [];
            // The drive starts at its first recorded fix, which is now in the
            // pre-roll — so the WAL's started_at agrees with the summary's.
            events.push({ type: 'start', at: drive[0].t });
            for (const f of drive) events.push({ type: 'fix', fix: f });
            break;
          }
        } else {
          // Motion lapsed before the hold completed. The fixes stay: they
          // are the pre-roll for the next attempt, which may be a launch.
          this.state = 'idle';
          this.motionSince = null;
        }
        // Keep the run since motion began (or nothing, idle) plus the
        // pre-roll before it; cap so a long slow crawl can't grow it unboundedly.
        const keepFrom = (this.motionSince ?? fix.t) - PRE_ROLL_MS;
        let drop = 0;
        while (drop < this.recent.length && this.recent[drop].t < keepFrom) drop++;
        drop = Math.max(drop, this.recent.length - MAX_BUFFERED_FIXES);
        if (drop > 0) this.recent.splice(0, drop);
        break;
      }
      case 'recording': {
        events.push({ type: 'fix', fix });
        if (speed < AUTO_END_SPEED_MS) {
          if (this.stationarySince == null) this.stationarySince = fix.t;
          if (fix.t - this.stationarySince >= AUTO_END_HOLD_MS) {
            this.state = 'idle';
            this.stationarySince = null;
            events.push({ type: 'end', at: fix.t });
          }
        } else {
          this.stationarySince = null;
        }
        break;
      }
      case 'stopping':
        break;
    }
    return events;
  }

  /**
   * Desired IMU sample rate given current dynamics: 10 Hz under hard
   * accel/braking (0-60 needs it), 1 Hz cruising (battery discipline).
   */
  desiredImuHz(currentAccelG: GForce | null): 1 | 10 {
    if (this.state !== 'recording') return 1;
    return currentAccelG != null && Math.abs(currentAccelG) > HIGH_RATE_ACCEL_G ? 10 : 1;
  }
}
