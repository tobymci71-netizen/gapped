import {
  bracketKey,
  bracketLabel,
  powerToWeightHpPerTonne,
  pwTier,
} from '../brackets';

describe('power-to-weight', () => {
  test('computes hp/tonne', () => {
    // Golf R: ~315 hp, ~1550 kg → ~203 hp/t
    expect(powerToWeightHpPerTonne(315, 1550)).toBeCloseTo(203.2, 1);
  });
  test('null on missing data — never guessed', () => {
    expect(powerToWeightHpPerTonne(null, 1550)).toBeNull();
    expect(powerToWeightHpPerTonne(315, null)).toBeNull();
    expect(powerToWeightHpPerTonne(0, 1550)).toBeNull();
  });
});

describe('tiers', () => {
  test('boundaries partition correctly', () => {
    expect(pwTier(50)).toBe('pw1');
    expect(pwTier(99.9)).toBe('pw1');
    expect(pwTier(100)).toBe('pw2');
    // NA Miata ~116 hp, ~960 kg → ~121 hp/t
    expect(pwTier(powerToWeightHpPerTonne(116, 960))).toBe('pw2');
    // Golf R ~203 hp/t
    expect(pwTier(203)).toBe('pw3');
    expect(pwTier(300)).toBe('pw4');
    // 992 GT3: 502 hp, 1418 kg → ~354 hp/t → pw4; McLaren 720S ~530 hp/t → pw5
    expect(pwTier(530)).toBe('pw5');
    expect(pwTier(null)).toBe('open');
  });
});

describe('bracket keys', () => {
  test('stock Miata and modified Miata land in different brackets', () => {
    const base = { drivetrain: 'rwd' as const, curbWeightKg: 960, factoryPowerHp: 116 };
    expect(bracketKey({ ...base, isModified: false })).toBe('rwd|stock|pw2');
    expect(bracketKey({ ...base, isModified: true })).toBe('rwd|modified|pw2');
  });

  test('Golf R (AWD hot hatch)', () => {
    expect(
      bracketKey({
        drivetrain: 'awd',
        curbWeightKg: 1550,
        factoryPowerHp: 315,
        isModified: false,
      }),
    ).toBe('awd|stock|pw3');
  });

  test('missing data degrades to the open tier, never a fabricated one', () => {
    expect(
      bracketKey({ drivetrain: null, curbWeightKg: null, factoryPowerHp: null, isModified: false }),
    ).toBe('any|stock|open');
  });

  test('labels are human-readable', () => {
    expect(bracketLabel('rwd|stock|pw2')).toBe('RWD · Stock · 100–170 hp/t');
    expect(bracketLabel('any|stock|open')).toBe('All drivetrains · Stock · Open class');
  });
});
