/**
 * Whether the Friends screen offers the add-by-username field, or the Free
 * plan's friend limit in its place (PLAN_MATRIX 'friends' and
 * 'unlimitedFriends'). Pure, so the screen's one decision is tested against
 * an explicit Access rather than a store.
 *
 * Only adding is limited. Nobody already followed is removed, hidden or
 * marked when the limit turns on: a Free account that followed seven people
 * before enforcement keeps all seven on its friends board, and the line below
 * says so rather than leaving them to wonder which five survived.
 */

import { FREE_LIMITS } from '@/config/plans';
import { type Access, canAddFriend } from '@/lib/entitlements';

export type FriendAdd =
  | { kind: 'open' }
  | {
      kind: 'locked';
      /** The sentence shown in place of the field. */
      line: string;
      /** The whole locked control, as VoiceOver reads it. */
      accessibilityLabel: string;
    };

/**
 * `following` is null while the list is loading or could not be loaded. That
 * is not a count, so nothing is held against the limit: the field stays as it
 * is today. Gating here is a client courtesy (src/lib/entitlements.ts); the
 * server holds the limit once purchases ship.
 */
export function friendAdd(following: number | null, access: Access): FriendAdd {
  if (following === null || canAddFriend(following, access)) return { kind: 'open' };
  const limit = FREE_LIMITS.friends;
  // "Following 7 of 5" reads as an error, so a count already past the limit
  // (follows made before it was enforced) gets its own sentence.
  const where =
    following <= limit
      ? `Following ${following} of ${limit} on Free.`
      : `Following ${following}, past Free's ${limit}. Everyone you follow stays on your board.`;
  const line = `${where} Unlimited friends come with Gapped Pro.`;
  return { kind: 'locked', line, accessibilityLabel: `Add a friend, Gapped Pro. ${line}` };
}
