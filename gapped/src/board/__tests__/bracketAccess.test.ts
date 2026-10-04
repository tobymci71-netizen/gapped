/**
 * Vehicle-class brackets on the board: Pro, with the open board free on
 * every plan, and nothing about the picker changed without enforcement.
 */

import type { Access } from '@/lib/entitlements';
import { bracketLabel } from '@/vehicles/brackets';
import {
  ALL_CLASSES,
  ALL_CLASSES_LABEL,
  appliedBracket,
  bracketOptions,
  bracketPillAccessibilityLabel,
  bracketsLocked,
  pickBracket,
} from '../bracketAccess';
import type { Bracket } from '../boards';

const FREE: Access = { isPro: false, enforced: true };
const PRO: Access = { isPro: true, enforced: true };
const NOT_ENFORCED: Access = { isPro: false, enforced: false };
const OPEN = [NOT_ENFORCED, PRO];

const RWD = 'rwd|stock|pw2';
const AWD = 'awd|modified|pw4';
const BRACKETS: Bracket[] = [
  { key: RWD, drivers: 1 },
  { key: AWD, drivers: 12 },
];

describe('bracketsLocked', () => {
  test('only on Free with enforcement on', () => {
    expect(bracketsLocked(FREE)).toBe(true);
    expect(bracketsLocked(PRO)).toBe(false);
    expect(bracketsLocked(NOT_ENFORCED)).toBe(false);
  });
});

describe('pickBracket', () => {
  test('"All classes" always applies, on every plan', () => {
    for (const a of [FREE, ...OPEN]) {
      expect(pickBracket(ALL_CLASSES, a)).toEqual({ kind: 'filter', bracket: null });
    }
  });

  test('a class filters when open — as it always has', () => {
    for (const a of OPEN) expect(pickBracket(RWD, a)).toEqual({ kind: 'filter', bracket: RWD });
  });

  test('a class leads to Pro on Free instead of filtering', () => {
    expect(pickBracket(RWD, FREE)).toEqual({ kind: 'goPro' });
  });
});

describe('appliedBracket', () => {
  test('is the chosen class when open', () => {
    for (const a of OPEN) {
      expect(appliedBracket(RWD, a)).toBe(RWD);
      expect(appliedBracket(null, a)).toBeNull();
    }
  });

  test('is the open board on Free, whatever was chosen while Pro', () => {
    expect(appliedBracket(RWD, FREE)).toBeNull();
    expect(appliedBracket(null, FREE)).toBeNull();
  });
});

describe('bracketOptions', () => {
  test('open: exactly the rows the picker has always shown, no PRO marks', () => {
    for (const a of OPEN) {
      expect(bracketOptions(BRACKETS, a)).toEqual([
        { key: ALL_CLASSES, label: ALL_CLASSES_LABEL, glyph: '🌐' },
        { key: RWD, label: bracketLabel(RWD), detail: '1 driver', glyph: '🏁' },
        { key: AWD, label: bracketLabel(AWD), detail: '12 drivers', glyph: '🏁' },
      ]);
    }
  });

  test('Free: every class is listed with its real count and marked PRO; All classes is not', () => {
    const rows = bracketOptions(BRACKETS, FREE);
    expect(rows.map((r) => r.key)).toEqual([ALL_CLASSES, RWD, AWD]);
    expect(rows[0]).toEqual({ key: ALL_CLASSES, label: ALL_CLASSES_LABEL, glyph: '🌐' });
    expect(rows[1]).toEqual({
      key: RWD,
      label: bracketLabel(RWD),
      detail: '1 driver',
      glyph: '🏁',
      pro: true,
      accessibilityLabel: `${bracketLabel(RWD)}, 1 driver, Gapped Pro`,
    });
    expect(rows[2].pro).toBe(true);
    expect(rows[2].accessibilityLabel).toMatch(/, Gapped Pro$/);
  });

  test('no classes: just the open board', () => {
    expect(bracketOptions([], FREE)).toEqual([
      { key: ALL_CLASSES, label: ALL_CLASSES_LABEL, glyph: '🌐' },
    ]);
  });
});

describe('bracketPillAccessibilityLabel', () => {
  test('open: the current value, as the other pills read', () => {
    for (const a of OPEN) {
      expect(bracketPillAccessibilityLabel(ALL_CLASSES_LABEL, a)).toBe(ALL_CLASSES_LABEL);
      expect(bracketPillAccessibilityLabel(bracketLabel(RWD), a)).toBe(bracketLabel(RWD));
    }
  });

  test('Free: says the classes are Pro without putting the open board behind it', () => {
    expect(bracketPillAccessibilityLabel(ALL_CLASSES_LABEL, FREE)).toBe(
      'Vehicle classes, Gapped Pro. Showing All classes.',
    );
  });
});

test('the open board key can never collide with a real class', () => {
  // Real keys are '{drivetrain}|{mod}|{tier}'.
  expect(ALL_CLASSES).not.toContain('|');
});
