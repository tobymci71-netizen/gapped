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

export class DriveEngine {
  private state: EngineState = 'idle';
  private motionSince: EpochMs | null = null;
  private stationarySince: EpochMs | null = null;
  /** Fixes seen while arming, so the drive includes the run-up. */
  private armingBuffer: Fix[] = [];

  getState(): EngineState {
    return this.state;
  }

  /** Manual start — user pressed the button while safely parked. */
  startManual(at: EpochMs): EngineEvent[] {
    if (this.state === 'recording') return [];
    this.state = 'recording';
    this.stationarySince = null;
    const events: EngineEvent[] = [{ type: 'start', at }];
    for (const f of this.armingBuffer) events.push({ type: 'fix', fix: f });
    this.armingBuffer = [];
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
        if (speed > AUTO_START_SPEED_MS) {
          if (this.motionSince == null) this.motionSince = fix.t;
          this.state = 'arming';
          this.armingBuffer.push(fix);
          // cap the buffer so a long slow crawl can't grow it unboundedly
          if (this.armingBuffer.length > 600) this.armingBuffer.shift();
          if (fix.t - this.motionSince >= AUTO_START_HOLD_MS) {
            this.state = 'recording';
            this.stationarySince = null;
            events.push({ type: 'start', at: this.motionSince });
            for (const f of this.armingBuffer) events.push({ type: 'fix', fix: f });
            this.armingBuffer = [];
            this.motionSince = null;
          }
        } else {
          // motion lapsed before the hold completed
          this.state = 'idle';
          this.motionSince = null;
          this.armingBuffer = [];
        }
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
