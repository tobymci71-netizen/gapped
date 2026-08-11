import {
  Degrees,
  EpochMs,
  GForce,
  Hectopascals,
  Metres,
  MetresPerSecond,
  Seconds,
} from '@/types/units';

/**
 * Core recording types. Everything is SI internally, ALWAYS:
 * metres, seconds, metres/second. Conversion happens at render only (units.ts).
 */

export type Fix = {
  /** Epoch milliseconds. */
  t: EpochMs;
  lat: Degrees;
  lon: Degrees;
  /** Device-reported (Doppler) speed, m/s. Cross-checked against derived. */
  speedMs: MetresPerSecond | null;
  /** Reported horizontal accuracy, metres. */
  accuracyM: Metres | null;
  altitudeM?: Metres | null;
  /** Degrees, 0–360. */
  heading?: Degrees | null;
  /** IMU sample nearest to this fix, in g (gravity-removed user acceleration). */
  accelX?: GForce | null;
  accelY?: GForce | null;
  accelZ?: GForce | null;
  pressureHpa?: Hectopascals | null;
  /** Android mock-location provider flag. */
  isMock?: boolean;
};

export type DriveSummary = {
  startedAt: EpochMs;
  endedAt: EpochMs;
  distanceM: Metres;
  durationS: Seconds;
  maxSpeedMs: MetresPerSecond;
  avgSpeedMs: MetresPerSecond;
  /** Peak |acceleration| in g, from IMU. Null if no IMU data. */
  maxG: GForce | null;
  /** Highest rolling-window (2 s) average |acceleration| in g. Null if no IMU data. */
  avgG: GForce | null;
  /** Seconds, 1-foot rollout convention. Null unless a clean window was detected. */
  zeroTo60S: Seconds | null;
  /** Fixes that survived accuracy gating, in order. */
  fixCount: number;
};

export type PlausibilityCheck = {
  check:
    | 'reconcile'
    | 'mock_provider'
    | 'teleport'
    | 'sustained_accel'
    | 'zero_jitter'
    | 'speed_agreement';
  pass: boolean;
  detail: string;
};

export type PlausibilityReport = {
  verdict: 'plausible' | 'implausible';
  checks: PlausibilityCheck[];
};
