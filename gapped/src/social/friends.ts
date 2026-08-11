/**
 * Friends — the people whose drives appear on your friends board.
 *
 * Directional by design: adding someone changes your board, never theirs, so
 * there is nothing to accept and no way to appear on a stranger's screen. See
 * migration 0006.
 *
 * Every call is a no-op returning empty when there is no backend configured,
 * matching the rest of the app's offline-first posture.
 */

import { supabase } from '@/lib/supabase';
import { readMpsOrNull } from '@/types/boundary';
import { MetresPerSecond } from '@/types/units';

export type Friend = {
  friendId: string;
  username: string;
  country: string | null;
  /** Best verified top speed, m/s (SI — convert at render). Null if none yet. */
  bestSpeedMs: MetresPerSecond | null;
  addedAt: number;
};

export type AddFriendResult =
  | { ok: true; friendId: string }
  | { ok: false; reason: string };

export type FriendsResult =
  | { ok: true; friends: Friend[] }
  | { ok: false; reason: string };

/**
 * Never collapses a failure into an empty list.
 *
 * Returning [] on error made the screen state "you have no friends" — a
 * factual claim about the user's account produced by a network problem. This
 * is the same honesty the board already applies when it disables its scope
 * pills rather than pretending a local board is a global one.
 */
export async function listFriends(): Promise<FriendsResult> {
  if (!supabase) return { ok: true, friends: [] };
  const { data, error } = await supabase.rpc('list_friends');
  if (error) {
    return { ok: false, reason: 'Could not load your friends. Check your connection.' };
  }
  if (!data) return { ok: true, friends: [] };
  const friends = (
    data as {
      friend_id: string;
      username: string | null;
      country: string | null;
      best_speed: number | null;
      added_at: string;
    }[]
  ).map((r) => ({
    friendId: r.friend_id,
    username: r.username ?? 'driver',
    country: r.country,
    bestSpeedMs: readMpsOrNull(r.best_speed),
    addedAt: Date.parse(r.added_at),
  }));
  return { ok: true, friends };
}

/**
 * Add by username. Failure reasons are surfaced verbatim to the user, so they
 * are phrased as sentences in the migration rather than as error codes.
 */
export async function addFriend(username: string): Promise<AddFriendResult> {
  const name = username.trim();
  if (!name) return { ok: false, reason: 'Enter a username.' };
  if (!supabase) return { ok: false, reason: 'Friends need an account. Connect one first.' };

  const { data, error } = await supabase.rpc('add_friend', { p_username: name });
  if (error) {
    return {
      ok: false,
      reason: /no driver called/i.test(error.message)
        ? `No driver called ${name}.`
        : error.message.replace(/^.*?:\s*/, ''),
    };
  }
  return { ok: true, friendId: data as string };
}

export async function removeFriend(friendId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('remove_friend', { p_friend_id: friendId });
  return !error;
}
