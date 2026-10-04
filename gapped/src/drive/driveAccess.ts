/**
 * The Free plan's limits as they apply to drives: which history opens, what
 * the drive screen shows, and whether a share card may leave its badge off.
 *
 * Pure, over an explicit Access (src/lib/entitlements.ts), so every lock is
 * tested in the three states that matter: enforced Free, not enforced (every
 * TestFlight build, where nothing may change) and Pro. The screens
 * (app/(tabs)/you.tsx, app/(tabs)/drive.tsx, app/drive/[id].tsx) only draw
 * what these return.
 *
 * A lock never removes anything. Old drives are kept, counted and shown as
 * locked; a figure that is Pro shows the PRO chip where it would be.
 */

import { FREE_LIMITS, type PlanFeatureKey } from '@/config/plans';
import { type Access, canOpenDrive, canUse, unrestricted } from '@/lib/entitlements';

/** What VoiceOver hears on a locked control: its own name, then the plan. */
export function proLabel(label: string): string {
  return `${label}, Gapped Pro`;
}

// ---------------------------------------------------------------------------
// History (the You and Drive tabs' lists)

export type HistorySplit<T> = {
  /** Drives that open, in the order given (newest first from listDrives). */
  open: T[];
  /** Drives older than Free's window. Kept, and drawn as one Pro row. */
  locked: number;
};

/**
 * Which drives open and how many are past Free's window. Totals are not
 * this function's business: distance, time and top speed are the person's
 * own numbers and are summed over every drive, locked or not.
 */
export function splitHistory<T extends { startedAt: number }>(
  drives: readonly T[],
  nowMs: number,
  access: Access,
): HistorySplit<T> {
  const open = drives.filter((d) => canOpenDrive(d.startedAt, nowMs, access));
  return { open, locked: drives.length - open.length };
}

export type LockedHistoryRow = { title: string; detail: string; accessibilityLabel: string };

/**
 * The single row that stands for every locked drive, or null when there are
 * none. One row rather than one locked row per drive: a year of Free history
 * would otherwise be a wall of identical dead ends, and the count says
 * plainly that nothing was deleted.
 */
export function lockedHistoryRow(count: number): LockedHistoryRow | null {
  if (count <= 0) return null;
  const title = `${count} older ${count === 1 ? 'drive' : 'drives'}`;
  const detail = `Kept, not deleted. Free opens the last ${FREE_LIMITS.historyDays} days; Gapped Pro opens your whole history.`;
  return { title, detail, accessibilityLabel: `${proLabel(title)}. ${detail}` };
}

/** The empty history card. It used to promise full history free, always. */
export function historyEmptyText(access: Access): string {
  return unrestricted(access)
    ? 'No drives yet. Your recorded drives appear here.'
    : `No drives yet. Your recorded drives appear here, and Free opens the last ${FREE_LIMITS.historyDays} days of them.`;
}

/**
 * The caption under the You tab's link to the plans. It used to say viewing
 * your drives is free forever, which the matrix no longer backs past
 * FREE_LIMITS.historyDays. `claims` is held to PLAN_MATRIX by the tests.
 */
export const PLANS_LINK_NOTE = {
  text: 'Recording your drives and placing on the boards is free forever.',
  claims: { free: ['recordDrives', 'boardPlacement'] },
} as const satisfies { text: string; claims: { free: readonly PlanFeatureKey[] } };

// ---------------------------------------------------------------------------
// Telemetry (the You tab)

export type TelemetryView =
  | { locked: false }
  | { locked: true; title: string; detail: string; accessibilityLabel: string };

/**
 * The You tab's Manoeuvres tiles, Turn preference and Speed distribution.
 * They are read out of every drive's heading, accelerometer and speed
 * samples, which is "Cornering G & full telemetry", a Pro row; what Free
 * keeps is top speed and 0–60 (coreStats) and the plain totals. Locked, the
 * three cards give way to one Pro card that names what they hold, and the
 * screen does not read the fixes behind them at all.
 */
export function telemetryView(access: Access): TelemetryView {
  if (canUse('advancedTelemetry', access)) return { locked: false };
  const title = 'Full telemetry';
  const detail =
    'Turns, hard braking, lane changes, turn preference and speed distribution come with Gapped Pro.';
  return { locked: true, title, detail, accessibilityLabel: `${proLabel(title)}. ${detail}` };
}

// ---------------------------------------------------------------------------
// One drive (app/drive/[id].tsx)

/**
 * Whether a drive is past Free's window, for a deep link straight to it.
 * The screen shows a locked state with a way to Pro and Back, not the data.
 */
export function driveLocked(startedAtMs: number, nowMs: number, access: Access): boolean {
  return !canOpenDrive(startedAtMs, nowMs, access);
}

export function lockedDriveCopy(): { title: string; body: string } {
  return {
    title: `Older than ${FREE_LIMITS.historyDays} days`,
    body: `This drive is kept, not deleted. Free opens the last ${FREE_LIMITS.historyDays} days of your history; Gapped Pro opens all of it.`,
  };
}

export type PeakGView =
  | { kind: 'value'; value: string; unit: 'g' }
  /** No IMU data on this drive: a dash for everyone, since Pro has nothing more to show. */
  | { kind: 'none' }
  | { kind: 'locked' };

/**
 * Peak G is "Cornering G & full telemetry", a Pro row. A drive with no
 * reading shows the dash it always has rather than a lock: a lock is a
 * promise that paying shows a number, and here there is none.
 */
export function peakGView(maxG: number | null, access: Access): PeakGView {
  if (maxG == null) return { kind: 'none' };
  if (!canUse('advancedTelemetry', access)) return { kind: 'locked' };
  return { kind: 'value', value: maxG.toFixed(2), unit: 'g' };
}

export type ExportView = { locked: boolean; note: string };

/**
 * GPX and CSV export is Pro. The note under the buttons used to say export
 * was free, always; it now says only what is true for this account.
 */
export function exportView(access: Access): ExportView {
  return canUse('export', access)
    ? { locked: false, note: 'Your data is yours — full-resolution GPX and CSV export.' }
    : { locked: true, note: 'Full-resolution GPX and CSV export comes with Gapped Pro.' };
}

/** Whether the "Hide Gapped badge" switch is shown locked. */
export function cleanShareLocked(access: Access): boolean {
  return !canUse('cleanShareCards', access);
}

/**
 * Whether the share card draws its GAPPED wordmark. Branded is the default
 * for everyone; it comes off only when asked for and allowed, so whatever
 * state the switch is in, a Free account never shares a clean card.
 */
export function shareCardBranded(hideRequested: boolean, access: Access): boolean {
  return !(hideRequested && canUse('cleanShareCards', access));
}
