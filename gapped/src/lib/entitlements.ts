/**
 * Who may use what: the Free plan's limits (src/config/plans.ts) applied to
 * an account.
 *
 * Pure functions over an `Access`, so every rule is unit-tested without a
 * store or a native module, plus `useAccess()` for screens. Nothing is locked
 * while PRO_LIMITS_ENFORCED is false (src/config/flags.ts): every account is
 * then treated as Pro, because a lock with nothing to buy behind it only takes
 * a feature away.
 *
 * Gating here is a client courtesy, not a security boundary. When purchases
 * ship, the server must hold the entitlement too (a RevenueCat webhook into
 * the database) before any limit is enforced on data it serves.
 */

import { PRO_LIMITS_ENFORCED } from '@/config/flags';
import { FREE_LIMITS, PLAN_MATRIX, type PlanFeatureKey } from '@/config/plans';

/** The Pro-only rows of PLAN_MATRIX: features Free does not get at all. */
export type ProFeature = Extract<
  PlanFeatureKey,
  | 'fullHistory'
  | 'advancedTelemetry'
  | 'classBrackets'
  | 'unlimitedFriends'
  | 'cleanShareCards'
  | 'videoOverlay'
  | 'export'
  | 'unlimitedGarage'
  | 'cloudSync'
>;

export const PRO_FEATURES: readonly ProFeature[] = PLAN_MATRIX.filter((r) => !r.free).map(
  (r) => r.key as ProFeature,
);

export type Access = {
  /** Has an active Pro entitlement. */
  isPro: boolean;
  /** Free limits are switched on (PRO_LIMITS_ENFORCED). */
  enforced: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when this account gets the full Pro version of everything. */
export function unrestricted(access: Access): boolean {
  return access.isPro || !access.enforced;
}

/** Whether a Pro-only feature is open to this account. */
export function canUse(_feature: ProFeature, access: Access): boolean {
  return unrestricted(access);
}

/**
 * The oldest drive start (epoch ms) Free can open, or null when there is no
 * cutoff. Older drives are kept, counted and shown as locked — never deleted —
 * so buying Pro brings them straight back.
 */
export function historyCutoffMs(nowMs: number, access: Access): number | null {
  return unrestricted(access) ? null : nowMs - FREE_LIMITS.historyDays * DAY_MS;
}

/** Whether a drive that started at `startedAtMs` can be opened. */
export function canOpenDrive(startedAtMs: number, nowMs: number, access: Access): boolean {
  const cutoff = historyCutoffMs(nowMs, access);
  return cutoff === null || startedAtMs >= cutoff;
}

/** Whether one more friend can be added to `currentFriends`. */
export function canAddFriend(currentFriends: number, access: Access): boolean {
  return unrestricted(access) || currentFriends < FREE_LIMITS.friends;
}

/**
 * Whether one more vehicle can join a garage of `currentVehicles` (the main
 * one included). Vehicles already there are kept when the limit turns on.
 */
export function canAddVehicle(currentVehicles: number, access: Access): boolean {
  return unrestricted(access) || currentVehicles < FREE_LIMITS.garageVehicles;
}

/**
 * The account's access. `isPro` is false until RevenueCat is wired; with
 * PRO_LIMITS_ENFORCED off that changes nothing, since `unrestricted` is true.
 * Replace the constant with the RevenueCat entitlement when purchases ship.
 */
export function useAccess(): Access {
  return { isPro: false, enforced: PRO_LIMITS_ENFORCED };
}
