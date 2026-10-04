/**
 * The Friends screen's add field against the Free friend limit: open until
 * the limit, a reason and a way to Pro at it, and nothing locked at all
 * without enforcement or with Pro.
 */

import { FREE_LIMITS } from '@/config/plans';
import type { Access } from '@/lib/entitlements';
import { friendAdd } from '../friendLimit';

const FREE: Access = { isPro: false, enforced: true };
const PRO: Access = { isPro: true, enforced: true };
const NOT_ENFORCED: Access = { isPro: false, enforced: false };
const LIMIT = FREE_LIMITS.friends;

describe('friendAdd', () => {
  test('nothing is locked while enforcement is off, at any count', () => {
    for (const n of [0, LIMIT - 1, LIMIT, LIMIT + 3, 1000]) {
      expect(friendAdd(n, NOT_ENFORCED)).toEqual({ kind: 'open' });
    }
  });

  test('Pro is never locked', () => {
    for (const n of [0, LIMIT, LIMIT + 3, 1000]) expect(friendAdd(n, PRO)).toEqual({ kind: 'open' });
  });

  test('Free can add until the limit', () => {
    expect(friendAdd(0, FREE)).toEqual({ kind: 'open' });
    expect(friendAdd(LIMIT - 1, FREE)).toEqual({ kind: 'open' });
  });

  test('at the limit, Free gets the reason and the way to Pro', () => {
    const add = friendAdd(LIMIT, FREE);
    expect(add).toEqual({
      kind: 'locked',
      line: `Following ${LIMIT} of ${LIMIT} on Free. Unlimited friends come with Gapped Pro.`,
      accessibilityLabel: `Add a friend, Gapped Pro. Following ${LIMIT} of ${LIMIT} on Free. Unlimited friends come with Gapped Pro.`,
    });
  });

  test('past the limit (follows from before enforcement), it says everyone stays', () => {
    const add = friendAdd(LIMIT + 2, FREE);
    expect(add.kind).toBe('locked');
    if (add.kind !== 'locked') return;
    expect(add.line).toBe(
      `Following ${LIMIT + 2}, past Free's ${LIMIT}. Everyone you follow stays on your board. Unlimited friends come with Gapped Pro.`,
    );
    // Never "7 of 5": a count over the limit is not an error the user made.
    expect(add.line).not.toMatch(/of \d+ on Free/);
  });

  test('the locked control says Gapped Pro to VoiceOver', () => {
    const add = friendAdd(LIMIT, FREE);
    if (add.kind !== 'locked') throw new Error('expected locked');
    expect(add.accessibilityLabel).toMatch(/Gapped Pro/);
    expect(add.accessibilityLabel).toContain(add.line);
  });

  test('an unknown count (loading, or the list failed) locks nothing', () => {
    expect(friendAdd(null, FREE)).toEqual({ kind: 'open' });
    expect(friendAdd(null, NOT_ENFORCED)).toEqual({ kind: 'open' });
    expect(friendAdd(null, PRO)).toEqual({ kind: 'open' });
  });

  test('the numbers come from the plan, not the copy', () => {
    const add = friendAdd(LIMIT, FREE);
    if (add.kind !== 'locked') throw new Error('expected locked');
    expect(add.line).toContain(String(FREE_LIMITS.friends));
  });
});
