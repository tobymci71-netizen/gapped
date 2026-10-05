import {
  clockLabel,
  driveVehicleLabel,
  durationFigure,
  spokenDistanceUnit,
  spokenSpeedUnit,
  tickLabel,
} from '../format';

const at = (iso: string) => Date.parse(iso);
const GB = { locale: 'en-GB', timeZone: 'UTC' };

describe('the clock on the speed trace', () => {
  test('reads as driveTitle writes it', () => {
    expect(clockLabel(at('2026-10-05T13:00:00Z'), GB)).toBe('13:00');
    expect(clockLabel(at('2026-10-05T08:30:00Z'), GB)).toBe('08:30');
    expect(clockLabel(at('2026-10-05T13:00:00Z'), { locale: 'en-US', timeZone: 'UTC' })).toBe(
      '1:00 PM',
    );
    // A non-English device gets en-GB rather than a mixed-language axis.
    expect(clockLabel(at('2026-10-05T13:00:00Z'), { locale: 'de-DE', timeZone: 'UTC' })).toBe(
      '13:00',
    );
  });

  test('inner ticks are minutes, the hour is the whole clock', () => {
    expect(tickLabel(at('2026-10-05T13:05:00Z'), GB)).toBe(':05');
    expect(tickLabel(at('2026-10-05T14:00:00Z'), GB)).toBe('14:00');
  });
});

describe('durationFigure', () => {
  test.each([
    [25 * 60, '25', 'min', '25 minutes'],
    [60, '1', 'min', '1 minute'],
    [20, '<1', 'min', 'under a minute'],
    [65 * 60, '1:05', 'h', '1 hour 5 minutes'],
    [120 * 60, '2:00', 'h', '2 hours'],
  ])('%ss is %s %s', (s, value, unit, spoken) => {
    expect(durationFigure(s)).toEqual({ value, unit, spoken });
  });
});

test('units are spoken in full', () => {
  expect(spokenSpeedUnit('mph')).toBe('miles per hour');
  expect(spokenSpeedUnit('km/h')).toBe('kilometres per hour');
  expect(spokenDistanceUnit('mi')).toBe('miles');
  expect(spokenDistanceUnit('km')).toBe('kilometres');
});

describe('driveVehicleLabel', () => {
  const profile = {
    vehicleId: 'main',
    vehicleMake: 'BMW',
    vehicleModel: 'M3',
    extraVehicles: [{ id: 'extra', kind: 'car' as const, make: 'Mazda', model: 'MX-5' }],
  };

  test('names the car the drive was recorded in', () => {
    expect(driveVehicleLabel('main', profile)).toBe('BMW M3');
    expect(driveVehicleLabel('extra', profile)).toBe('Mazda MX-5');
  });

  test('does not credit a drive to a car it was not recorded in', () => {
    // Recorded in a car since replaced, or before any car was chosen.
    expect(driveVehicleLabel('replaced', profile)).toBeNull();
    expect(driveVehicleLabel(null, profile)).toBeNull();
  });
});
