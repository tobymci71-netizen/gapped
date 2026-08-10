/**
 * VIN parsing.
 *
 * A VIN is the only way to get a vehicle's real drivetrain, power and weight
 * without asking the driver — and asking the driver cannot work here, because
 * those three values pick which leaderboard bracket a run competes in. A
 * self-declared 90 hp / 1800 kg puts a 500 hp car in the slowest class.
 *
 * So: the client sends a VIN, the server decodes it against NHTSA vPIC, and
 * the specs are written server-side. This module is the pure part — shared
 * with the Edge Function via `npm run build:edge` so both ends agree on what
 * counts as a VIN.
 */

/** I, O and Q are excluded so they cannot be confused with 1 and 0. */
const VIN_ALPHABET = /^[A-HJ-NPR-Z0-9]{17}$/;

/** Transliteration table for the check digit (ISO 3779 / 49 CFR 565). */
const TRANSLITERATE: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export type VinCheck = {
  /** Normalised (trimmed, uppercased) VIN, present only when the format is valid. */
  vin: string | null;
  validFormat: boolean;
  /**
   * Whether the position-9 check digit agrees.
   *
   * Advisory, never a rejection: the check digit is mandatory in North America
   * but not in Europe, and plenty of legitimate UK and EU vehicles fail it.
   * Rejecting on this would turn away exactly the drivers this app is for.
   */
  checkDigitValid: boolean;
  reason: string | null;
};

export function checkVin(input: string): VinCheck {
  const vin = input.trim().toUpperCase();

  if (vin.length !== 17) {
    return {
      vin: null,
      validFormat: false,
      checkDigitValid: false,
      reason: `A VIN is 17 characters — that one is ${vin.length}.`,
    };
  }
  if (!VIN_ALPHABET.test(vin)) {
    return {
      vin: null,
      validFormat: false,
      checkDigitValid: false,
      reason: 'A VIN never contains the letters I, O or Q.',
    };
  }

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const value = c >= '0' && c <= '9' ? Number(c) : TRANSLITERATE[c];
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);

  return {
    vin,
    validFormat: true,
    checkDigitValid: vin[8] === expected,
    reason: null,
  };
}

/**
 * vPIC reports drive type as free text that varies by model year and decoder
 * version ("4WD/4-Wheel Drive/4x4", "AWD/All-Wheel Drive", "FWD/Front-Wheel
 * Drive", "Rear-Wheel Drive"). Normalised to the four values the bracket
 * schema allows; anything unrecognised is null, which lands the vehicle in the
 * open class rather than guessing it into the wrong one.
 */
export function normaliseDriveType(raw: string | null | undefined): 'fwd' | 'rwd' | 'awd' | '4wd' | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  // Order matters: "4WD/4-Wheel Drive" also contains "wheel drive", and AWD
  // strings sometimes mention 4x4.
  if (s.includes('4wd') || s.includes('4x4') || s.includes('four-wheel') || s.includes('4-wheel')) {
    return '4wd';
  }
  if (s.includes('awd') || s.includes('all-wheel') || s.includes('all wheel')) return 'awd';
  if (s.includes('fwd') || s.includes('front-wheel') || s.includes('front wheel')) return 'fwd';
  if (s.includes('rwd') || s.includes('rear-wheel') || s.includes('rear wheel')) return 'rwd';
  return null;
}

const LB_PER_KG = 2.2046226218;

/** vPIC curb weight is in pounds. Null unless it is a believable car mass. */
export function curbWeightKgFromLb(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const lb = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(lb) || lb <= 0) return null;
  const kg = Math.round(lb / LB_PER_KG);
  // A motorbike can be 120 kg; a heavy pickup ~4000 kg. Outside that the field
  // is a GVWR class code or junk, and a wrong weight silently mis-brackets.
  return kg >= 80 && kg <= 5000 ? kg : null;
}

/** vPIC engine brake horsepower, as a number, or null if absent/implausible. */
export function powerHpFrom(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const hp = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(hp) || hp <= 0) return null;
  return hp >= 5 && hp <= 2000 ? Math.round(hp) : null;
}
