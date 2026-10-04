/**
 * Vehicle-class brackets on the board are Pro (PLAN_MATRIX 'classBrackets');
 * placement is not. Every metric's global, country and friends board stays
 * open on Free, and so does the open board across every class — "All
 * classes" is no bracket at all, not a cheaper one.
 *
 * Locked, the class picker still opens and still lists the real classes and
 * their driver counts, each marked PRO; choosing one leads to Gapped Pro
 * instead of filtering. Pure, so the screen's decisions are tested against an
 * explicit Access.
 */

import { type Access, canUse } from '@/lib/entitlements';
import { bracketLabel } from '@/vehicles/brackets';
import type { Bracket } from './boards';

/** The class sheet's key for the open board. Never a real bracket key ('{drivetrain}|{mod}|{tier}'). */
export const ALL_CLASSES = 'all';
/** How the open board is named on the pill and in the sheet. */
export const ALL_CLASSES_LABEL = 'All classes';

/** True when choosing a class leads to Gapped Pro rather than filtering. */
export function bracketsLocked(access: Access): boolean {
  return !canUse('classBrackets', access);
}

/**
 * The class the board is actually filtered to. A class chosen while Pro stays
 * chosen, but is not applied once the account is Free (a lapsed
 * subscription): the board then shows every class, as the picker says.
 */
export function appliedBracket(chosen: string | null, access: Access): string | null {
  return bracketsLocked(access) ? null : chosen;
}

export type BracketPick = { kind: 'filter'; bracket: string | null } | { kind: 'goPro' };

/** What choosing `key` in the class sheet does. */
export function pickBracket(key: string, access: Access): BracketPick {
  if (key === ALL_CLASSES) return { kind: 'filter', bracket: null };
  return bracketsLocked(access) ? { kind: 'goPro' } : { kind: 'filter', bracket: key };
}

export type BracketOption = {
  key: string;
  label: string;
  glyph: string;
  /** The driver count, kept apart from the label so the ellipsis never takes it. */
  detail?: string;
  /** Marked PRO in the sheet; set only when the class is locked. */
  pro?: true;
  /** Set only when locked, so an open row reads exactly as it always has. */
  accessibilityLabel?: string;
};

/**
 * The class sheet's rows: the open board first, then every class with drivers
 * in it. Driver counts are shown because a class of two is a different claim
 * than a class of two hundred, and the label alone hides that.
 */
export function bracketOptions(brackets: Bracket[], access: Access): BracketOption[] {
  const locked = bracketsLocked(access);
  return [
    { key: ALL_CLASSES, label: ALL_CLASSES_LABEL, glyph: '🌐' },
    ...brackets.map((b): BracketOption => {
      const label = bracketLabel(b.key);
      const detail = `${b.drivers} driver${b.drivers === 1 ? '' : 's'}`;
      const row: BracketOption = { key: b.key, label, detail, glyph: '🏁' };
      return locked
        ? { ...row, pro: true, accessibilityLabel: `${label}, ${detail}, Gapped Pro` }
        : row;
    }),
  ];
}

/**
 * The class pill as VoiceOver reads it. Open, it is the current class, as
 * the other pills read their value. Locked, it is always the open board, and
 * the label says which part is Pro: "All classes, Gapped Pro" would put the
 * free option behind the lock.
 */
export function bracketPillAccessibilityLabel(label: string, access: Access): string {
  return bracketsLocked(access) ? `Vehicle classes, Gapped Pro. Showing ${label}.` : label;
}
