/**
 * The drive screens' Pro locks, in the three states that matter: enforced
 * Free, enforcement off (every TestFlight build: nothing may change) and Pro.
 * And the sentences they show, held to the published matrix.
 */

import { FREE_LIMITS, PLAN_MATRIX } from '@/config/plans';
import type { Access } from '@/lib/entitlements';
import {
  cleanShareLocked,
  driveLocked,
  exportView,
  historyEmptyText,
  lockedDriveCopy,
  lockedHistoryRow,
  peakGView,
  PLANS_LINK_NOTE,
  proLabel,
  shareCardBranded,
  splitHistory,
  telemetryView,
} from '../driveAccess';

const FREE: Access = { isPro: false, enforced: true };
const NOT_ENFORCED: Access = { isPro: false, enforced: false };
const PRO: Access = { isPro: true, enforced: true };
const UNLOCKED = [NOT_ENFORCED, PRO];

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4, 12);
const CUTOFF = NOW - FREE_LIMITS.historyDays * DAY;
const row = (key: string) => PLAN_MATRIX.find((r) => r.key === key);

/** Newest first, as listDrives returns them. */
const drives = [
  { id: 'today', startedAt: NOW - 1000 },
  { id: 'edge', startedAt: CUTOFF },
  { id: 'just-out', startedAt: CUTOFF - 1 },
  { id: 'last-year', startedAt: NOW - 365 * DAY },
];

describe('history', () => {
  test('Free opens the window, boundary included, and counts the rest', () => {
    const { open, locked } = splitHistory(drives, NOW, FREE);
    expect(open.map((d) => d.id)).toEqual(['today', 'edge']);
    expect(locked).toBe(2);
  });

  test('nothing is locked when not enforced, or on Pro', () => {
    for (const access of UNLOCKED) {
      const { open, locked } = splitHistory(drives, NOW, access);
      expect(open).toEqual(drives);
      expect(locked).toBe(0);
    }
  });

  test('a history that is all old keeps every drive, counted', () => {
    const old = drives.slice(2);
    expect(splitHistory(old, NOW, FREE)).toEqual({ open: [], locked: 2 });
  });

  test('the locked row exists only when something is locked', () => {
    expect(lockedHistoryRow(0)).toBeNull();
    expect(lockedHistoryRow(splitHistory(drives, NOW, NOT_ENFORCED).locked)).toBeNull();
    expect(lockedHistoryRow(splitHistory(drives, NOW, PRO).locked)).toBeNull();
  });

  test('the locked row says how many, that they are kept, and that it is Pro', () => {
    const one = lockedHistoryRow(1)!;
    expect(one.title).toBe('1 older drive');
    const many = lockedHistoryRow(12)!;
    expect(many.title).toBe('12 older drives');
    expect(many.detail).toMatch(/kept, not deleted/i);
    expect(many.detail).toContain(`last ${FREE_LIMITS.historyDays} days`);
    expect(many.accessibilityLabel).toMatch(/^12 older drives, Gapped Pro\./);
    // What the row asserts, held to the matrix.
    expect(row('recentHistory')?.free).toBe(true);
    expect(row('fullHistory')?.free).toBe(false);
    expect(row('fullHistory')?.pro).toBe(true);
  });

  test('the empty card no longer promises full history free, and names the limit only when it applies', () => {
    for (const access of [FREE, ...UNLOCKED]) {
      expect(historyEmptyText(access)).not.toMatch(/full history|always|never paywalled/i);
    }
    expect(historyEmptyText(FREE)).toContain(`last ${FREE_LIMITS.historyDays} days`);
    for (const access of UNLOCKED) expect(historyEmptyText(access)).not.toMatch(/Free|Pro/);
  });

  test('the plans link only calls free what the matrix gives Free', () => {
    for (const key of PLANS_LINK_NOTE.claims.free) expect(row(key)?.free).toBe(true);
    expect(PLANS_LINK_NOTE.text).toMatch(/recording your drives/i);
    expect(PLANS_LINK_NOTE.text).toMatch(/the boards/i);
    expect(PLANS_LINK_NOTE.text).not.toMatch(/viewing/i);
  });
});

describe('telemetry on the You tab', () => {
  test('manoeuvres, turn preference and speed distribution are locked on Free only', () => {
    const free = telemetryView(FREE);
    expect(free.locked).toBe(true);
    for (const access of UNLOCKED) expect(telemetryView(access)).toEqual({ locked: false });
    // The Pro row it stands on, and the Free one it must not reach into.
    expect(row('advancedTelemetry')).toMatchObject({ free: false, pro: true });
    expect(row('coreStats')?.free).toBe(true);
  });

  test('the locked card names what it holds, and says it is Pro to VoiceOver', () => {
    const free = telemetryView(FREE);
    if (!free.locked) throw new Error('expected a lock');
    const named = [/turns/i, /hard braking/i, /lane changes/i, /turn preference/i, /speed distribution/i];
    for (const words of named) expect(free.detail).toMatch(words);
    expect(free.detail).toMatch(/Gapped Pro/);
    expect(free.accessibilityLabel).toBe(`${proLabel(free.title)}. ${free.detail}`);
    // Never a Free figure: top speed and 0–60 stay out of the lock.
    expect(`${free.title} ${free.detail}`).not.toMatch(/top speed|0–60|zero to sixty/i);
  });
});

describe('one drive', () => {
  test('a deep link to an old drive is locked on Free only', () => {
    expect(driveLocked(CUTOFF, NOW, FREE)).toBe(false);
    expect(driveLocked(CUTOFF - 1, NOW, FREE)).toBe(true);
    for (const access of UNLOCKED) expect(driveLocked(NOW - 365 * DAY, NOW, access)).toBe(false);
  });

  test('the locked drive says it is kept and what opens it', () => {
    const copy = lockedDriveCopy();
    expect(copy.title).toContain(String(FREE_LIMITS.historyDays));
    expect(copy.body).toMatch(/kept, not deleted/i);
    expect(copy.body).toMatch(/Gapped Pro/);
  });

  test('Peak G is Pro on Free, its value otherwise', () => {
    expect(peakGView(0.5812, FREE)).toEqual({ kind: 'locked' });
    for (const access of UNLOCKED) {
      expect(peakGView(0.5812, access)).toEqual({ kind: 'value', value: '0.58', unit: 'g' });
    }
    expect(row('advancedTelemetry')?.free).toBe(false);
  });

  test('a drive with no G reading shows a dash for everyone, never a lock over nothing', () => {
    for (const access of [FREE, ...UNLOCKED]) expect(peakGView(null, access)).toEqual({ kind: 'none' });
  });

  test('export is locked on Free, and the note stops promising it free', () => {
    const free = exportView(FREE);
    expect(free.locked).toBe(true);
    expect(free.note).toMatch(/Gapped Pro/);
    for (const access of UNLOCKED) {
      const v = exportView(access);
      expect(v.locked).toBe(false);
      expect(v.note).not.toMatch(/free|always/i);
    }
    expect(row('export')?.free).toBe(false);
  });

  test('locked controls say so to VoiceOver', () => {
    expect(proLabel('Peak G')).toBe('Peak G, Gapped Pro');
    expect(proLabel('Export GPX')).toBe('Export GPX, Gapped Pro');
  });
});

describe('share card badge', () => {
  test('hiding the badge is locked on Free only', () => {
    expect(cleanShareLocked(FREE)).toBe(true);
    for (const access of UNLOCKED) expect(cleanShareLocked(access)).toBe(false);
    expect(row('cleanShareCards')?.free).toBe(false);
    expect(row('shareCards')?.free).toBe(true);
  });

  test('branded is the default for everyone', () => {
    for (const access of [FREE, ...UNLOCKED]) expect(shareCardBranded(false, access)).toBe(true);
  });

  test('the badge comes off only when asked and allowed', () => {
    expect(shareCardBranded(true, FREE)).toBe(true);
    for (const access of UNLOCKED) expect(shareCardBranded(true, access)).toBe(false);
  });
});
