import { DriveSummary } from '@/drive/types';
import {
  applyImprovements,
  contributionGrid,
  currentStreak,
  dayKey,
  EMPTY_PBS,
  findImprovements,
} from '../records';

function summary(partial: Partial<DriveSummary>): DriveSummary {
  return {
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_600_000,
    distanceM: 10_000,
    durationS: 600,
    maxSpeedMs: 30,
    avgSpeedMs: 16,
    maxG: 0.4,
    avgG: 0.2,
    zeroTo60S: null,
    fixCount: 600,
    ...partial,
  };
}

describe('personal bests', () => {
  test('first drive sets every applicable PB', () => {
    const imps = findImprovements(EMPTY_PBS, summary({}));
    expect(imps.map((i) => i.metric).sort()).toEqual([
      'longestDriveM',
      'topSpeedMs',
    ]);
  });

  test('0-60 counts only when detected, and lower is better', () => {
    const withPb = applyImprovements(EMPTY_PBS, [
      { metric: 'zeroTo60S', prev: null, next: 6.0 },
    ]);
    expect(findImprovements(withPb, summary({ zeroTo60S: null }))).not.toContainEqual(
      expect.objectContaining({ metric: 'zeroTo60S' }),
    );
    const better = findImprovements(withPb, summary({ zeroTo60S: 5.2 }));
    expect(better).toContainEqual(expect.objectContaining({ metric: 'zeroTo60S', next: 5.2 }));
    const worse = findImprovements(withPb, summary({ zeroTo60S: 7.9 }));
    expect(worse.map((i) => i.metric)).not.toContain('zeroTo60S');
  });

  test('slower drive does not beat a speed PB', () => {
    const pbs = applyImprovements(EMPTY_PBS, [{ metric: 'topSpeedMs', prev: null, next: 40 }]);
    const imps = findImprovements(pbs, summary({ maxSpeedMs: 35 }));
    expect(imps.map((i) => i.metric)).not.toContain('topSpeedMs');
  });
});

describe('streaks', () => {
  const DAY = 86_400_000;
  const now = new Date('2026-07-22T12:00:00').getTime();

  test('consecutive days count, ending today', () => {
    const days = new Set([dayKey(now), dayKey(now - DAY), dayKey(now - 2 * DAY)]);
    expect(currentStreak(days, now)).toBe(3);
  });

  test('a streak survives if the last drive was yesterday', () => {
    const days = new Set([dayKey(now - DAY), dayKey(now - 2 * DAY)]);
    expect(currentStreak(days, now)).toBe(2);
  });

  test('a two-day gap kills the streak', () => {
    const days = new Set([dayKey(now - 2 * DAY), dayKey(now - 3 * DAY)]);
    expect(currentStreak(days, now)).toBe(0);
  });

  test('contribution grid is oldest-first with correct hits', () => {
    const days = new Set([dayKey(now), dayKey(now - 2 * DAY)]);
    const grid = contributionGrid(days, now, 7);
    expect(grid.length).toBe(7);
    expect(grid[6].drove).toBe(true); // today, last cell
    expect(grid[4].drove).toBe(true); // two days ago
    expect(grid[5].drove).toBe(false); // yesterday
  });
});
