/**
 * Branded numeric types for every physical quantity in the app.
 *
 * WHY THIS EXISTS
 * ---------------
 * During a device walkthrough the speedometer read 313 km/h while the phone
 * was stationary. The cause: a value already converted for display was passed
 * into `speedForDisplay`, which expects m/s, so it was converted a second
 * time. 87 (mph, for display) became 87 m/s became 313 km/h.
 *
 * Nothing caught it. Typecheck, lint and 238 unit tests were all green, and
 * the call site had been introduced by a *polish* batch — a change intended to
 * reduce risk. Every quantity in the app was a `number`, so every quantity was
 * interchangeable with every other quantity.
 *
 * These types make that class of mistake a compile error.
 *
 * ZERO RUNTIME COST
 * -----------------
 * A brand is a phantom property that exists only in the type system. At
 * runtime a `MetresPerSecond` IS a `number` — same value, same representation,
 * no wrapper, no allocation, no validation. The smart constructors below
 * compile to identity: `mps(x)` emits `x`. Safe on the recording hot path.
 *
 * HOW TO USE
 * ----------
 *  - Brand a raw number ONLY through a smart constructor (`mps`, `metres`, …).
 *  - Move between units ONLY through a conversion function below.
 *  - At the SQLite and network boundaries values are plain numbers; brand them
 *    on read and unbrand them on write using src/types/boundary.ts. Those
 *    functions are the ONLY sanctioned casts outside this file.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * Arithmetic on a branded value yields a plain `number` (`a + b` widens),
 * which is intentional: the result of mixing quantities has no unit until you
 * assert one, and asserting one is exactly the moment worth being explicit
 * about. Internal maths therefore works in raw numbers and re-brands on
 * return. Brands live on the *interfaces* — parameters, return types and
 * stored fields — which is where cross-unit mistakes actually happen.
 */

declare const __brand: unique symbol;

/** A nominal wrapper that exists only at compile time. */
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Speed ───────────────────────────────────────────────────────────────────
/** Metres per second. The canonical internal speed unit — everything stored
 *  or computed is this; conversion happens at render only. */
export type MetresPerSecond = Brand<number, 'm/s'>;
/** Kilometres per hour. A DISPLAY unit: never stored, never computed with. */
export type Kmh = Brand<number, 'km/h'>;
/** Miles per hour. A DISPLAY unit: never stored, never computed with. */
export type Mph = Brand<number, 'mph'>;

// ── Distance ────────────────────────────────────────────────────────────────
/** Metres. The canonical internal distance unit. */
export type Metres = Brand<number, 'm'>;
/** Kilometres. Display only. */
export type Kilometres = Brand<number, 'km'>;
/** Miles. Display only. */
export type Miles = Brand<number, 'mi'>;

// ── Time ────────────────────────────────────────────────────────────────────
/** Seconds. Durations and elapsed times. */
export type Seconds = Brand<number, 's'>;
/** Milliseconds since the Unix epoch. Distinct from Seconds so a timestamp
 *  can never be handed to something expecting a duration. */
export type EpochMs = Brand<number, 'epoch-ms'>;

// ── Acceleration ────────────────────────────────────────────────────────────
/**
 * Multiples of standard gravity.
 *
 * NOTE, unresolved: the values currently flowing into this type come from
 * expo-sensors' Accelerometer, which reports total acceleration INCLUDING
 * gravity (~1.0 at rest), while src/drive/types.ts documents them as
 * gravity-removed. Branding does not fix that — it is a sensor question that
 * needs a real drive to settle. See the IMU findings in the project notes.
 */
export type GForce = Brand<number, 'g'>;
/** Metres per second squared. Used where acceleration is derived from the
 *  speed profile rather than read from the IMU. */
export type MetresPerSecondSq = Brand<number, 'm/s^2'>;

// ── Geo and misc ────────────────────────────────────────────────────────────
/** Decimal degrees — latitude, longitude and compass bearing. */
export type Degrees = Brand<number, 'deg'>;
/** Hectopascals, from the barometer. */
export type Hectopascals = Brand<number, 'hPa'>;
/** Kilograms — vehicle kerb weight. */
export type Kilograms = Brand<number, 'kg'>;
/** Metric horsepower as reported by NHTSA vPIC. */
export type Horsepower = Brand<number, 'hp'>;

// ── Smart constructors ──────────────────────────────────────────────────────
// The ONLY sanctioned way to brand a raw number. Each is an identity function
// at runtime; TypeScript erases the cast entirely.

export const mps = (n: number): MetresPerSecond => n as MetresPerSecond;
export const kmh = (n: number): Kmh => n as Kmh;
export const mph = (n: number): Mph => n as Mph;
export const metres = (n: number): Metres => n as Metres;
export const kilometres = (n: number): Kilometres => n as Kilometres;
export const miles = (n: number): Miles => n as Miles;
export const seconds = (n: number): Seconds => n as Seconds;
export const epochMs = (n: number): EpochMs => n as EpochMs;
export const gForce = (n: number): GForce => n as GForce;
export const mps2 = (n: number): MetresPerSecondSq => n as MetresPerSecondSq;
export const degrees = (n: number): Degrees => n as Degrees;
export const hectopascals = (n: number): Hectopascals => n as Hectopascals;
export const kilograms = (n: number): Kilograms => n as Kilograms;
export const horsepower = (n: number): Horsepower => n as Horsepower;

/** Strip a brand back to a plain number. Use at serialisation boundaries and
 *  when handing a value to a numeric API that does not care about units. */
export const raw = (n: Brand<number, string>): number => n as number;

// ── Conversion factors ──────────────────────────────────────────────────────
export const MS_PER_MPH = 0.44704;
export const MS_PER_KMH = 1 / 3.6;
export const METERS_PER_MILE = 1609.344;
export const METERS_PER_KM = 1000;
/** Standard gravity, m/s². */
export const G_MS2 = 9.80665;

// ── Conversions ─────────────────────────────────────────────────────────────
// The ONLY sanctioned way to move between units. Each consumes one branded
// type and produces another, so a double conversion cannot type-check: the
// output of msToKmh is Kmh, and nothing accepting MetresPerSecond will take it.

export const msToMph = (v: MetresPerSecond): Mph => mph(v / MS_PER_MPH);
export const msToKmh = (v: MetresPerSecond): Kmh => kmh(v * 3.6);
export const mphToMs = (v: Mph): MetresPerSecond => mps(v * MS_PER_MPH);
export const kmhToMs = (v: Kmh): MetresPerSecond => mps(v * MS_PER_KMH);

export const metersToMiles = (v: Metres): Miles => miles(v / METERS_PER_MILE);
export const metersToKm = (v: Metres): Kilometres => kilometres(v / METERS_PER_KM);
export const milesToMeters = (v: Miles): Metres => metres(v * METERS_PER_MILE);
export const kmToMeters = (v: Kilometres): Metres => metres(v * METERS_PER_KM);

export const gToMs2 = (v: GForce): MetresPerSecondSq => mps2(v * G_MS2);
export const ms2ToG = (v: MetresPerSecondSq): GForce => gForce(v / G_MS2);

// ── Display quantities ──────────────────────────────────────────────────────
/**
 * A value already converted for the user's preference, with its unit label.
 *
 * The brand is a UNION (`Mph | Kmh`) because which one it is depends on a
 * runtime preference, not on anything statically knowable. That union is the
 * mechanism that closes the 313 km/h loop: nothing accepting
 * `MetresPerSecond` will take a `Mph | Kmh`, so a display value can never be
 * fed back into a conversion. It is a one-way door by construction.
 */
export type DisplaySpeed = { value: Mph | Kmh; unit: 'mph' | 'km/h' };
export type DisplayDistance = { value: Miles | Kilometres; unit: 'mi' | 'km' };

/** The value a dial or readout renders. Deliberately NOT MetresPerSecond. */
export type DisplaySpeedValue = Mph | Kmh;
export type DisplayDistanceValue = Miles | Kilometres;
