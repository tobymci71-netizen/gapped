/**
 * Every Pro lock in the app, in one place, as an enforced Free account meets
 * it: the state PRO_LIMITS_ENFORCED switches on. Each area's own tests hold
 * its three states (enforced Free, enforcement off, Pro); this file is the
 * one to read and run when the flag flips. One test per lock, named for the
 * screen that draws it, and a check that every Pro-only row of PLAN_MATRIX
 * is locked somewhere below or is marked as not built yet.
 *
 * It renders nothing and never touches the flag: the Access is explicit. The
 * last block runs the same helpers as the committed build, where with the
 * flag off not one of them may lock.
 */

import { PRO_LIMITS_ENFORCED } from '@/config/flags';
import { FREE_LIMITS, PLAN_MATRIX, type PlanFeatureKey } from '@/config/plans';
import {
  ALL_CLASSES,
  appliedBracket,
  bracketOptions,
  bracketPillAccessibilityLabel,
  bracketsLocked,
  pickBracket,
} from '@/board/bracketAccess';
import type { Bracket } from '@/board/boards';
import {
  cleanShareLocked,
  driveLocked,
  exportView,
  historyEmptyText,
  lockedHistoryRow,
  peakGView,
  shareCardBranded,
  splitHistory,
  telemetryView,
} from '@/drive/driveAccess';
import { garageStepSubtitle, vehicleAdd } from '@/onboarding/vehicle/garageAccess';
import { friendAdd } from '@/social/friendLimit';
import { type Access, canUse, PRO_FEATURES, type ProFeature } from '../entitlements';

const FREE: Access = { isPro: false, enforced: true };

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4, 12);
/** Newest first, as listDrives returns them: two inside Free's window, two past it. */
const DRIVES = [
  { id: 'today', startedAt: NOW - DAY },
  { id: 'last-week', startedAt: NOW - 7 * DAY },
  { id: 'two-months', startedAt: NOW - 60 * DAY },
  { id: 'last-year', startedAt: NOW - 365 * DAY },
];
const OLD_DRIVE = DRIVES[3];
const BRACKETS: Bracket[] = [
  { key: 'rwd|stock|pw2', drivers: 3 },
  { key: 'awd|modified|pw4', drivers: 12 },
];

const NOT_BUILT = 'not built yet: nothing to lock';

/**
 * Where each Pro-only row of the matrix is locked. A new Pro row fails the
 * first test until it is given a lock here (and a test below), or is marked
 * not built, so the matrix cannot promise a Pro feature Free still gets.
 */
const LOCKED_AT: Record<ProFeature, string> = {
  fullHistory: "the Drive and You tabs' history, and a deep link to an old drive",
  advancedTelemetry:
    "Peak G on a drive, and the You tab's manoeuvres, turn preference and speed distribution",
  classBrackets: "the board's vehicle class picker",
  unlimitedFriends: 'adding a friend at the limit',
  cleanShareCards: '"Hide Gapped badge" on a drive',
  export: 'GPX and CSV export on a drive',
  unlimitedGarage: 'adding a car in onboarding once the main car fills the garage',
  videoOverlay: NOT_BUILT,
  cloudSync: NOT_BUILT,
};

const row = (key: PlanFeatureKey) => PLAN_MATRIX.find((r) => r.key === key);

describe('the map of locks', () => {
  test('every Pro-only row of the matrix is locked somewhere, or marked not built', () => {
    expect(Object.keys(LOCKED_AT).sort()).toEqual([...PRO_FEATURES].sort());
    for (const f of PRO_FEATURES) expect(canUse(f, FREE)).toBe(false);
  });

  test('the rows marked not built are the two the plans call unbuilt', () => {
    const unbuilt = PRO_FEATURES.filter((f) => LOCKED_AT[f] === NOT_BUILT);
    expect(unbuilt.sort()).toEqual(['cloudSync', 'videoOverlay']);
  });
});

describe('every lock, as an enforced Free account', () => {
  test(`Drive and You tabs: drives older than ${FREE_LIMITS.historyDays} days collapse into one Pro row`, () => {
    const history = splitHistory(DRIVES, NOW, FREE);
    expect(history.open.map((d) => d.id)).toEqual(['today', 'last-week']);
    expect(history.locked).toBe(2);
    const locked = lockedHistoryRow(history.locked);
    expect(locked?.title).toBe('2 older drives');
    expect(locked?.detail).toMatch(/kept, not deleted/i);
    expect(locked?.accessibilityLabel).toMatch(/^2 older drives, Gapped Pro\./);
  });

  test('You tab: the empty history card names the window', () => {
    expect(historyEmptyText(FREE)).toContain(`last ${FREE_LIMITS.historyDays} days`);
  });

  test('drive screen: a deep link to an old drive opens the locked screen', () => {
    expect(driveLocked(OLD_DRIVE.startedAt, NOW, FREE)).toBe(true);
    expect(driveLocked(DRIVES[0].startedAt, NOW, FREE)).toBe(false);
  });

  test('drive screen: Peak G shows the PRO chip in place of the figure', () => {
    expect(peakGView(0.94, FREE)).toEqual({ kind: 'locked' });
  });

  test('drive screen: GPX and CSV export lead to Pro', () => {
    expect(exportView(FREE)).toEqual({
      locked: true,
      note: 'Full-resolution GPX and CSV export comes with Gapped Pro.',
    });
  });

  test('drive screen: "Hide Gapped badge" is locked, and the card stays branded', () => {
    expect(cleanShareLocked(FREE)).toBe(true);
    expect(shareCardBranded(true, FREE)).toBe(true);
  });

  test('You tab: manoeuvres, turn preference and speed distribution give way to one Pro card', () => {
    const view = telemetryView(FREE);
    expect(view.locked).toBe(true);
    if (!view.locked) return;
    expect(view.accessibilityLabel).toMatch(/^Full telemetry, Gapped Pro\./);
  });

  test(`Friends: the add field gives way to the limit at ${FREE_LIMITS.friends}`, () => {
    expect(friendAdd(FREE_LIMITS.friends - 1, FREE)).toEqual({ kind: 'open' });
    const add = friendAdd(FREE_LIMITS.friends, FREE);
    expect(add.kind).toBe('locked');
    if (add.kind !== 'locked') return;
    expect(add.accessibilityLabel).toMatch(/^Add a friend, Gapped Pro\./);
  });

  test('Board: every class is marked PRO, and choosing one leads to Pro instead of filtering', () => {
    expect(bracketsLocked(FREE)).toBe(true);
    const options = bracketOptions(BRACKETS, FREE);
    expect(options.filter((o) => o.key !== ALL_CLASSES).every((o) => o.pro === true)).toBe(true);
    expect(pickBracket(BRACKETS[0].key, FREE)).toEqual({ kind: 'goPro' });
    // A class chosen on Pro is not applied once the account is Free.
    expect(appliedBracket(BRACKETS[1].key, FREE)).toBeNull();
    expect(bracketPillAccessibilityLabel('All classes', FREE)).toBe(
      'Vehicle classes, Gapped Pro. Showing All classes.',
    );
  });

  test('Onboarding garage: the add row gives way to the PRO row once the main car fills it', () => {
    expect(FREE_LIMITS.garageVehicles).toBe(1);
    const add = vehicleAdd(0, 'car', FREE);
    expect(add).toEqual({ kind: 'locked', line: 'More cars come with Gapped Pro.' });
    expect(garageStepSubtitle('car', add)).not.toMatch(/later/);
  });
});

describe('what a lock never takes', () => {
  test('the Free rows stay free', () => {
    const free: PlanFeatureKey[] = [
      'recordDrives',
      'coreStats',
      'boardPlacement',
      'recentHistory',
      'friends',
      'shareCards',
      'privacy',
      'garage',
    ];
    for (const key of free) expect(row(key)).toMatchObject({ free: true, pro: true });
  });

  test('recent drives open, the open board applies and a branded card shares, on Free', () => {
    expect(splitHistory(DRIVES, NOW, FREE).open).toHaveLength(2);
    expect(pickBracket(ALL_CLASSES, FREE)).toEqual({ kind: 'filter', bracket: null });
    expect(shareCardBranded(false, FREE)).toBe(true);
    // No G reading is a dash for everyone, not a lock over nothing.
    expect(peakGView(null, FREE)).toEqual({ kind: 'none' });
  });

  test('nothing is dropped: locked drives are counted and friends past the limit stay', () => {
    const history = splitHistory(DRIVES, NOW, FREE);
    expect(history.open.length + history.locked).toBe(DRIVES.length);
    const add = friendAdd(FREE_LIMITS.friends + 2, FREE);
    if (add.kind !== 'locked') throw new Error('expected locked');
    expect(add.line).toMatch(/Everyone you follow stays on your board/);
    // A garage already past the limit is still a garage: only adding stops.
    expect(vehicleAdd(3, 'car', FREE).kind).toBe('locked');
  });
});

describe('this build, as committed', () => {
  // How useAccess() builds the account's access until RevenueCat is wired. It
  // is not called here: it is a hook, and becomes a real one with purchases.
  const BUILD: Access = { isPro: false, enforced: PRO_LIMITS_ENFORCED };

  test('every lock above applies exactly when PRO_LIMITS_ENFORCED is on', () => {
    // Off, which every TestFlight build is, not one of them may lock.
    const on = PRO_LIMITS_ENFORCED;
    expect(splitHistory(DRIVES, NOW, BUILD).locked > 0).toBe(on);
    expect(driveLocked(OLD_DRIVE.startedAt, NOW, BUILD)).toBe(on);
    expect(peakGView(0.94, BUILD).kind === 'locked').toBe(on);
    expect(exportView(BUILD).locked).toBe(on);
    expect(cleanShareLocked(BUILD)).toBe(on);
    expect(shareCardBranded(true, BUILD)).toBe(on);
    expect(telemetryView(BUILD).locked).toBe(on);
    expect(friendAdd(FREE_LIMITS.friends, BUILD).kind === 'locked').toBe(on);
    expect(bracketsLocked(BUILD)).toBe(on);
    expect(vehicleAdd(0, 'car', BUILD).kind === 'locked').toBe(on);
  });
});
