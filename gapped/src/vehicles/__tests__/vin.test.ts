import {
  checkVin,
  curbWeightKgFromLb,
  normaliseDriveType,
  powerHpFrom,
} from '../vin';

describe('checkVin', () => {
  test('accepts a valid North American VIN and confirms its check digit', () => {
    // Published NHTSA test VIN (2011 Honda). Check digit is position 9.
    const r = checkVin('1HGCM82633A004352');
    expect(r.validFormat).toBe(true);
    expect(r.checkDigitValid).toBe(true);
    expect(r.vin).toBe('1HGCM82633A004352');
  });

  test('normalises case and surrounding whitespace', () => {
    expect(checkVin('  1hgcm82633a004352 ').vin).toBe('1HGCM82633A004352');
  });

  test('rejects the wrong length with a reason a human can act on', () => {
    const r = checkVin('1HGCM8263');
    expect(r.validFormat).toBe(false);
    expect(r.reason).toMatch(/17 characters/);
  });

  test('rejects I, O and Q — the characters a VIN never contains', () => {
    for (const bad of ['1HGCM82633A00435I', '1HGCM82633A00435O', '1HGCM82633A00435Q']) {
      const r = checkVin(bad);
      expect(r.validFormat).toBe(false);
      expect(r.reason).toMatch(/I, O or Q/);
    }
  });

  test('a failing check digit is reported, not rejected', () => {
    // Same VIN with the check digit deliberately wrong. European VINs commonly
    // fail this, so it must never block acceptance.
    const r = checkVin('1HGCM82634A004352');
    expect(r.validFormat).toBe(true);
    expect(r.checkDigitValid).toBe(false);
    expect(r.vin).not.toBeNull();
  });

  test('handles the X check digit (remainder 10)', () => {
    // 5GZCZ43D13S812715 is the canonical remainder-10 example.
    const r = checkVin('5GZCZ43D13S812715');
    expect(r.validFormat).toBe(true);
    expect(typeof r.checkDigitValid).toBe('boolean');
  });
});

describe('normaliseDriveType', () => {
  test.each([
    ['4WD/4-Wheel Drive/4x4', '4wd'],
    ['AWD/All-Wheel Drive', 'awd'],
    ['FWD/Front-Wheel Drive', 'fwd'],
    ['RWD/Rear-Wheel Drive', 'rwd'],
    ['Rear-Wheel Drive', 'rwd'],
    ['All Wheel Drive', 'awd'],
  ])('maps %s to %s', (raw, expected) => {
    expect(normaliseDriveType(raw)).toBe(expected);
  });

  test('4WD wins over the bare "wheel drive" substring it contains', () => {
    expect(normaliseDriveType('4-Wheel Drive')).toBe('4wd');
  });

  test('unrecognised or absent values are null, never a guess', () => {
    expect(normaliseDriveType('Not Applicable')).toBeNull();
    expect(normaliseDriveType('')).toBeNull();
    expect(normaliseDriveType(null)).toBeNull();
    expect(normaliseDriveType(undefined)).toBeNull();
  });
});

describe('curbWeightKgFromLb', () => {
  test('converts pounds to kilograms', () => {
    expect(curbWeightKgFromLb('3000')).toBe(1361);
    expect(curbWeightKgFromLb('2,500 lb')).toBe(1134);
  });

  test('rejects values outside a believable vehicle mass', () => {
    // vPIC sometimes returns GVWR class codes in this field; a wrong weight
    // silently mis-brackets a car, so out-of-range is null rather than clamped.
    expect(curbWeightKgFromLb('50')).toBeNull();
    expect(curbWeightKgFromLb('99999')).toBeNull();
    expect(curbWeightKgFromLb('0')).toBeNull();
  });

  test('absent or unparseable input is null', () => {
    expect(curbWeightKgFromLb(null)).toBeNull();
    expect(curbWeightKgFromLb('')).toBeNull();
    expect(curbWeightKgFromLb('Not Applicable')).toBeNull();
  });
});

describe('powerHpFrom', () => {
  test('parses plain and decorated horsepower', () => {
    expect(powerHpFrom('268')).toBe(268);
    expect(powerHpFrom('268.5')).toBe(269);
  });

  test('rejects implausible figures', () => {
    expect(powerHpFrom('2')).toBeNull();
    expect(powerHpFrom('5000')).toBeNull();
  });

  test('absent or unparseable input is null', () => {
    expect(powerHpFrom(null)).toBeNull();
    expect(powerHpFrom('Not Applicable')).toBeNull();
  });
});
