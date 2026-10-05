/**
 * Achievements as the You tab shows them.
 *
 * Two launch changes. The 0–60 award is worded as a measurement, with a
 * stopwatch rather than a start light. And "Fastest in country" is retired:
 * verify-drive no longer grants it, but rows it granted before still come
 * back from the server, and they must neither show nor fall through to the
 * unknown-kind path, which would print the raw kind.
 */

import { toAchievements } from '../achievements';

jest.mock('@/lib/supabase', () => ({ supabase: null, ensureUserId: async () => null }));

const row = (kind: string, payload: Record<string, unknown> = {}, earned = '2026-10-01T10:00:00Z') => ({
  kind,
  payload,
  earned_at: earned,
});

describe('toAchievements', () => {
  test('the 0–60 award is a measurement, with a stopwatch', () => {
    const [a] = toAchievements([row('first_measured_launch', { zero_to_60_s: 5.024 })]);
    expect(a.title).toBe('First 0–60 measured');
    expect(a.icon).toBe('stopwatch');
    expect(a.detail).toBe('0–60 mph in 5.02 s from a standstill, measured from the raw trace.');
  });

  test('without a time in the payload it still reads as a measurement', () => {
    const [a] = toAchievements([row('first_measured_launch')]);
    expect(a.detail).toBe('A 0–60 from a standstill, measured rather than estimated.');
  });

  test('"Fastest in country" never renders, and takes nothing else with it', () => {
    const shown = toAchievements([
      row('country_number_one', { country: 'GB' }, '2026-10-03T10:00:00Z'),
      row('first_verified_run', {}, '2026-10-02T10:00:00Z'),
    ]);
    expect(shown.map((a) => a.kind)).toEqual(['first_verified_run']);
    expect(JSON.stringify(shown)).not.toMatch(/country number one|Fastest/i);
  });

  test('no award on show is about speed or launching', () => {
    const kinds = ['first_verified_run', 'ten_verified_runs', 'first_measured_launch', 'country_number_one'];
    for (const a of toAchievements(kinds.map((k) => row(k)))) {
      expect(`${a.title} ${a.detail}`).not.toMatch(/fastest|launch|\brac(e|es|ing)\b|🚦/i);
      // Drawn as a stroke icon from a closed set: no start light, no emoji.
      expect(['verified', 'stopwatch', 'check']).toContain(a.icon);
    }
  });

  test('an unknown kind from a newer server still shows, by its name', () => {
    const [a] = toAchievements([row('hundred_verified_runs')]);
    expect(a.title).toBe('hundred verified runs');
    expect(a.icon).toBe('check');
    expect(a.earnedAt).toBe(Date.parse('2026-10-01T10:00:00Z'));
  });

  test('a null payload is read as empty', () => {
    const [a] = toAchievements([{ kind: 'ten_verified_runs', payload: null, earned_at: '2026-10-01T10:00:00Z' }]);
    expect(a.detail).toBe('10 drives verified from the raw trace.');
  });
});
