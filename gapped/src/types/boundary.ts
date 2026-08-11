/**
 * The unit boundary: SQLite and the network.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS FILE, AND src/types/units.ts, ARE THE ONLY PLACES IN THE CODEBASE
 * WHERE A CAST TO A BRANDED TYPE IS ALLOWED.
 *
 * Everywhere else, a value becomes branded by calling a smart constructor or
 * a conversion function. If you find yourself needing `as MetresPerSecond` in
 * a screen, a store or a maths module, that is not a typing inconvenience —
 * it means a quantity crossed a layer without anyone deciding what unit it
 * was in, which is precisely the bug this system exists to prevent.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Outside the app, quantities are plain numbers: SQLite columns are REAL,
 * PostgREST returns JSON numbers, and neither carries a unit. The functions
 * here are where a number acquires a unit (on read) and loses it (on write).
 *
 * The unit each column is in is a fact about the schema, documented here and
 * in the migrations: everything is SI — metres, seconds, metres per second.
 */

import {
  Degrees,
  EpochMs,
  GForce,
  Hectopascals,
  Horsepower,
  Kilograms,
  Metres,
  MetresPerSecond,
  Seconds,
  degrees,
  epochMs,
  gForce,
  hectopascals,
  horsepower,
  kilograms,
  metres,
  mps,
  raw,
  seconds,
} from '@/types/units';

// ── Reading: a plain number acquires its unit ───────────────────────────────
// Each function names the column family it is for, so the unit assumption is
// attached to the storage location rather than floating free.

export const readMps = (n: number): MetresPerSecond => mps(n);
export const readMetres = (n: number): Metres => metres(n);
export const readSeconds = (n: number): Seconds => seconds(n);
export const readEpochMs = (n: number): EpochMs => epochMs(n);
export const readG = (n: number): GForce => gForce(n);
export const readDegrees = (n: number): Degrees => degrees(n);
export const readHpa = (n: number): Hectopascals => hectopascals(n);
export const readKg = (n: number): Kilograms => kilograms(n);
export const readHp = (n: number): Horsepower => horsepower(n);

/** Nullable column variants — SQLite REAL and Postgres double precision are
 *  both nullable for every optional sensor field. */
export const readMpsOrNull = (n: number | null | undefined): MetresPerSecond | null =>
  n == null ? null : mps(n);
export const readMetresOrNull = (n: number | null | undefined): Metres | null =>
  n == null ? null : metres(n);
export const readSecondsOrNull = (n: number | null | undefined): Seconds | null =>
  n == null ? null : seconds(n);
export const readGOrNull = (n: number | null | undefined): GForce | null =>
  n == null ? null : gForce(n);
export const readDegreesOrNull = (n: number | null | undefined): Degrees | null =>
  n == null ? null : degrees(n);
export const readHpaOrNull = (n: number | null | undefined): Hectopascals | null =>
  n == null ? null : hectopascals(n);
export const readKgOrNull = (n: number | null | undefined): Kilograms | null =>
  n == null ? null : kilograms(n);
export const readHpOrNull = (n: number | null | undefined): Horsepower | null =>
  n == null ? null : horsepower(n);

// ── Sensor ingestion ────────────────────────────────────────────────────────
// The third boundary, and the same species as the other two: expo-location and
// expo-sensors hand us plain numbers whose units are a documented property of
// the platform API, not of the value. Asserted once, here.
//
//   CLLocation.speed / Android Location.getSpeed  → metres per second
//   CLLocation.altitude                           → metres
//   CLLocation.horizontalAccuracy                 → metres
//   CLLocation.course                             → degrees (see heading.ts)
//   expo-sensors Accelerometer                    → multiples of g
//   expo-sensors Barometer.pressure               → hectopascals
//   Date.now() / CLLocation.timestamp             → epoch milliseconds

export const sensorSpeed = readMpsOrNull;
export const sensorAccuracy = readMetresOrNull;
export const sensorAltitude = readMetresOrNull;
export const sensorHeading = readDegreesOrNull;
export const sensorAccel = readGOrNull;
export const sensorPressure = readHpaOrNull;
export const sensorTimestamp = readEpochMs;
/** Latitude and longitude are always present on a fix. */
export const sensorCoord = readDegrees;
/** `Date.now()` at a call site that needs a branded timestamp. */
export const nowEpochMs = (): EpochMs => epochMs(Date.now());

// ── Writing: a unit is dropped on the way out ───────────────────────────────
// `write` is deliberately generic and deliberately boring: the only thing it
// does is remove the brand. Nothing is converted on the way out, because
// everything stored is already SI.

export const write = raw;

export const writeOrNull = (v: { valueOf(): number } | null | undefined): number | null =>
  v == null ? null : Number(v);
