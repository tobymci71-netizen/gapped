// AUTO-GENERATED from src/ by scripts/build-edge-shared.mjs — do not edit here.
/**
 * Core recording types. Everything is SI internally, ALWAYS:
 * metres, seconds, metres/second. Conversion happens at render only (units.ts).
 */

export type Fix = {
  /** Epoch milliseconds. */
  t: number;
  lat: number;
  lon: number;
  /** Device-reported (Doppler) speed, m/s. Cross-checked against derived. */
  speedMs: number | null;
  /** Reported horizontal accuracy, metres. */
  accuracyM: number | null;
  altitudeM?: number | null;
  /** Degrees, 0–360. */
  heading?: number | null;
  /** IMU sample nearest to this fix, in g (gravity-removed user acceleration). */
  accelX?: number | null;
  accelY?: number | null;
  accelZ?: number | null;
  pressureHpa?: number | null;
  /** Android mock-location provider flag. */
  isMock?: boolean;
};

export type DriveSummary = {
  startedAt: number;
  endedAt: number;
  distanceM: number;
  durationS: number;
  maxSpeedMs: number;
  avgSpeedMs: number;
  /** Peak |acceleration| in g, from IMU. Null if no IMU data. */
  maxG: number | null;
  /** Highest rolling-window (2 s) average |acceleration| in g. Null if no IMU data. */
  avgG: number | null;
  /** Seconds, 1-foot rollout convention. Null unless a clean window was detected. */
  zeroTo60S: number | null;
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
