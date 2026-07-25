import { sanitiseHeading } from '../heading';

describe('sanitiseHeading', () => {
  test('a real bearing passes through unchanged', () => {
    expect(sanitiseHeading(0)).toBe(0);
    expect(sanitiseHeading(270)).toBe(270);
    expect(sanitiseHeading(359.9)).toBe(359.9);
    expect(sanitiseHeading(360)).toBe(360);
  });

  test("iOS's -1 'no course' sentinel is rejected, not wrapped to 359", () => {
    expect(sanitiseHeading(-1)).toBeNull();
  });

  test('out-of-range and non-finite values are rejected', () => {
    expect(sanitiseHeading(361)).toBeNull();
    expect(sanitiseHeading(-0.5)).toBeNull();
    expect(sanitiseHeading(NaN)).toBeNull();
    expect(sanitiseHeading(Infinity)).toBeNull();
  });

  test('absent values stay absent', () => {
    expect(sanitiseHeading(null)).toBeNull();
    expect(sanitiseHeading(undefined)).toBeNull();
  });
});
