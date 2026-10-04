/**
 * The Free plan's limits as rules: what is locked, from when, and that
 * nothing at all is locked until enforcement is switched on.
 */

import { ONBOARDING_PAYWALL, PRO_LIMITS_ENFORCED } from '@/config/flags';
import { FREE_LIMITS, PLAN_MATRIX } from '@/config/plans';
import {
  type Access,
  canAddFriend,
  canAddVehicle,
  canOpenDrive,
  canUse,
  historyCutoffMs,
  PRO_FEATURES,
} from '../entitlements';

const FREE: Access = { isPro: false, enforced: true };
const PRO: Access = { isPro: true, enforced: true };
const NOT_ENFORCED: Access = { isPro: false, enforced: false };
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4, 12);

test('the Pro-only features are exactly the rows Free does not get', () => {
  expect([...PRO_FEATURES].sort()).toEqual(
    PLAN_MATRIX.filter((r) => !r.free && r.pro)
      .map((r) => r.key)
      .sort(),
  );
});

test('Free is locked out of every Pro-only feature, Pro is not', () => {
  for (const f of PRO_FEATURES) {
    expect(canUse(f, FREE)).toBe(false);
    expect(canUse(f, PRO)).toBe(true);
  }
});

test('nothing is locked while enforcement is off', () => {
  for (const f of PRO_FEATURES) expect(canUse(f, NOT_ENFORCED)).toBe(true);
  expect(historyCutoffMs(NOW, NOT_ENFORCED)).toBeNull();
  expect(canAddFriend(1000, NOT_ENFORCED)).toBe(true);
  expect(canAddVehicle(1000, NOT_ENFORCED)).toBe(true);
});

test('Free history opens the last 30 days, boundary included', () => {
  const cutoff = NOW - FREE_LIMITS.historyDays * DAY;
  expect(historyCutoffMs(NOW, FREE)).toBe(cutoff);
  expect(canOpenDrive(cutoff, NOW, FREE)).toBe(true);
  expect(canOpenDrive(cutoff - 1, NOW, FREE)).toBe(false);
  expect(canOpenDrive(cutoff - 365 * DAY, NOW, PRO)).toBe(true);
});

test('Free friends stop at the limit', () => {
  expect(canAddFriend(FREE_LIMITS.friends - 1, FREE)).toBe(true);
  expect(canAddFriend(FREE_LIMITS.friends, FREE)).toBe(false);
  expect(canAddFriend(FREE_LIMITS.friends, PRO)).toBe(true);
});

test('a Free garage holds one vehicle, the main one', () => {
  expect(FREE_LIMITS.garageVehicles).toBe(1);
  expect(canAddVehicle(1, FREE)).toBe(false);
  expect(canAddVehicle(0, FREE)).toBe(true);
  expect(canAddVehicle(1, PRO)).toBe(true);
});

test('limits are never enforced without a way to buy', () => {
  // A Pro lock promises that paying opens it.
  if (PRO_LIMITS_ENFORCED) expect(ONBOARDING_PAYWALL).toBe(true);
});
