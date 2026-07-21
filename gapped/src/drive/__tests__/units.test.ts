import {
  formatDistance,
  formatDuration,
  formatSpeed,
  metersToMiles,
  msToKmh,
  msToMph,
  SIXTY_MPH_MS,
} from '../units';

describe('units — one conversion layer, SI internal', () => {
  test('m/s → mph', () => {
    expect(msToMph(26.8224)).toBeCloseTo(60, 5);
    expect(msToMph(0)).toBe(0);
  });

  test('m/s → km/h', () => {
    expect(msToKmh(27.7778)).toBeCloseTo(100, 3);
  });

  test('60 mph constant is exact', () => {
    expect(SIXTY_MPH_MS).toBeCloseTo(26.8224, 4);
  });

  test('metres → miles', () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 6);
  });

  test('the TripRank bug: 124 mph must render as 124 mph imperial, ~200 km/h metric — never 79 km/h', () => {
    const ms = 124 * 0.44704;
    expect(formatSpeed(ms, 'imperial')).toBe('124 mph');
    expect(formatSpeed(ms, 'metric')).toBe('200 km/h');
  });

  test('distance formatting', () => {
    expect(formatDistance(1609.344 * 15.9, 'imperial')).toBe('15.9 mi');
    expect(formatDistance(2500, 'metric')).toBe('2.5 km');
  });

  test('duration formatting', () => {
    expect(formatDuration(1950)).toBe('32m 30s');
    expect(formatDuration(59)).toBe('59s');
    expect(formatDuration(3720)).toBe('1h 2m');
  });
});
