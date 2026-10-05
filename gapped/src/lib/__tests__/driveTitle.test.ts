/**
 * Drive titles come from the real date and time, never a hard-coded weekday
 * (the mockups' own weekday labels were wrong: 4 Oct 2026 is a Sunday). Every
 * case pins the zone, so the suite means the same on any machine.
 */

import { driveTitle, formatDriveDuration, partOfDay } from '@/lib/driveTitle';

const UTC = { locale: 'en-GB', timeZone: 'UTC' } as const;
const at = (iso: string) => Date.parse(iso);

describe('driveTitle', () => {
  it('titles a Monday afternoon drive and writes its mono line', () => {
    // 5 Oct 2026 is a Monday.
    const t = driveTitle({ startedAt: at('2026-10-05T13:00:00Z'), durationS: 25 * 60 }, UTC);
    expect(t.title).toBe('Monday afternoon');
    expect(t.meta).toBe('Mon 5 Oct · 13:00 · 25 min');
    expect(t.range).toBe('Mon 5 Oct · 13:00–13:25');
    expect(t.spoken).toBe('Monday afternoon, 5 October, 13:00, 25 minutes');
  });

  it('works the weekday out from the date rather than trusting a label', () => {
    const t = driveTitle({ startedAt: at('2026-10-04T10:00:00Z'), durationS: 15 * 60 }, UTC);
    expect(t.title).toBe('Sunday morning');
    expect(t.meta).toBe('Sun 4 Oct · 10:00 · 15 min');
  });

  it('uses the drive’s own time zone for the weekday and the hour', () => {
    // 23:30 on Monday in UTC is 08:30 on Tuesday in Tokyo.
    const startedAt = at('2026-10-05T23:30:00Z');
    expect(driveTitle({ startedAt, durationS: 600 }, UTC).title).toBe('Monday night');
    const tokyo = driveTitle({ startedAt, durationS: 600 }, { locale: 'en-GB', timeZone: 'Asia/Tokyo' });
    expect(tokyo.title).toBe('Tuesday morning');
    expect(tokyo.meta).toBe('Tue 6 Oct · 08:30 · 10 min');
  });

  it('calls the small hours early morning of the day they fall on', () => {
    const t = driveTitle({ startedAt: at('2026-10-04T01:15:00Z'), durationS: 1800 }, UTC);
    expect(t.title).toBe('Early Sunday morning');
  });

  it('follows the locale for date order and clock, in English', () => {
    const t = driveTitle(
      { startedAt: at('2026-10-05T13:00:00Z'), durationS: 25 * 60 },
      { locale: 'en-US', timeZone: 'UTC' },
    );
    expect(t.title).toBe('Monday afternoon');
    expect(t.meta).toBe('Mon Oct 5 · 1:00 PM · 25 min');
  });

  it('falls back to English for a non-English locale rather than mixing languages', () => {
    const t = driveTitle(
      { startedAt: at('2026-10-05T13:00:00Z'), durationS: 25 * 60 },
      { locale: 'de-DE', timeZone: 'UTC' },
    );
    expect(t.meta).toBe('Mon 5 Oct · 13:00 · 25 min');
  });

  it('prefers the recorded end time for the range when there is one', () => {
    const t = driveTitle(
      { startedAt: at('2026-10-05T13:00:00Z'), durationS: 25 * 60, endedAt: at('2026-10-05T13:31:00Z') },
      UTC,
    );
    expect(t.range).toBe('Mon 5 Oct · 13:00–13:31');
    // The duration line is the moving time it was given, not the wall clock.
    expect(t.meta).toBe('Mon 5 Oct · 13:00 · 25 min');
  });

  it('says nothing invented for a drive with no valid start', () => {
    expect(driveTitle({ startedAt: Number.NaN, durationS: 60 }, UTC)).toEqual({
      title: 'Drive',
      meta: '',
      range: '',
      spoken: 'Drive',
    });
  });
});

describe('partOfDay', () => {
  it.each([
    [0, 'early'],
    [4, 'early'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [20, 'evening'],
    [21, 'night'],
    [23, 'night'],
    [24, 'early'], // an engine that writes midnight as 24
  ] as const)('%i:00 is %s', (hour, part) => {
    expect(partOfDay(hour)).toBe(part);
  });
});

describe('formatDriveDuration', () => {
  it.each([
    [0, '<1 min'],
    [29, '<1 min'],
    [30, '1 min'],
    [25 * 60, '25 min'],
    [60 * 60, '1 h'],
    [65 * 60, '1 h 5 min'],
    [2 * 3600 + 59 * 60 + 40, '3 h'],
    [Number.NaN, '<1 min'],
    [-40, '<1 min'],
  ])('%p s reads %s', (s, text) => {
    expect(formatDriveDuration(s)).toBe(text);
  });
});
