import { deriveSpeeds } from '@/drive/stats';
import { formatSpeed } from '@/drive/units';
import { SAMPLE_DRIVE, SAMPLE_TOP_SPEED_MS } from '../sampleDrive';

const { summary, fixes } = SAMPLE_DRIVE;

describe('SAMPLE_DRIVE', () => {
  it('reads 60 mph / 97 km/h on the card: ordinary, not a speeding ticket', () => {
    expect(formatSpeed(summary.maxSpeedMs, 'imperial')).toBe('60 mph');
    expect(formatSpeed(summary.maxSpeedMs, 'metric')).toBe('97 km/h');
  });

  it('has fixes in time order, each strictly after the last', () => {
    for (let i = 1; i < fixes.length; i++) expect(fixes[i].t).toBeGreaterThan(fixes[i - 1].t);
  });

  it('agrees with itself: counts, times and averages match the fixes', () => {
    expect(summary.fixCount).toBe(fixes.length);
    expect(summary.startedAt).toBe(fixes[0].t);
    expect(summary.endedAt).toBe(fixes[fixes.length - 1].t);
    expect(summary.durationS).toBeCloseTo((summary.endedAt - summary.startedAt) / 1000, 6);
    expect(summary.avgSpeedMs).toBeCloseTo(summary.distanceM / summary.durationS, 6);
  });

  it('is a plausible drive: tens of minutes, double-digit kilometres', () => {
    expect(summary.durationS).toBeGreaterThan(10 * 60);
    expect(summary.durationS).toBeLessThan(40 * 60);
    expect(summary.distanceM).toBeGreaterThan(10_000);
    expect(summary.distanceM).toBeLessThan(30_000);
  });

  it('never records a fix faster than the top speed it claims', () => {
    for (const f of fixes) expect(f.speedMs ?? 0).toBeLessThanOrEqual(SAMPLE_TOP_SPEED_MS + 1e-9);
  });

  it('gives RoutePath speeds to colour by: what it derives tracks what was recorded', () => {
    const derived = deriveSpeeds(fixes);
    expect(derived).toHaveLength(fixes.length);
    // Rounded timestamps blur it a little; it must still never claim a speed
    // well past the card's.
    expect(Math.max(...derived)).toBeLessThan(SAMPLE_TOP_SPEED_MS * 1.1);
    expect(Math.max(...derived) - Math.min(...derived)).toBeGreaterThan(5);
  });

  it('is the same every time: built once from constants', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const again = require('../sampleDrive').SAMPLE_DRIVE;
      expect(again).toEqual(SAMPLE_DRIVE);
    });
  });
});
