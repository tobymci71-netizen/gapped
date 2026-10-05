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

import { ensureUserId, supabase } from '@/lib/supabase';
import { readMpsOrNull } from '@/types/boundary';
import { MetresPerSecond } from '@/types/units';
import { friendUsernameFromInput, isValidUsername, USERNAME_RULE } from './username';

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
/**
 * The friend RPCs are granted to `authenticated` only. Called before the
 * anonymous session exists (an offline first launch, or straight after
 * Delete account) they failed with a permission error, so every call makes
 * sure there is a session first, and a refusal reads as what it is.
 */
const NOT_CONNECTED = 'Still connecting your account. Try again in a moment.';
const isPermissionDenied = (e: { code?: string } | null) => e?.code === '42501';

export async function listFriends(): Promise<FriendsResult> {
  if (!supabase) return { ok: true, friends: [] };
  await ensureUserId();
  const { data, error } = await supabase.rpc('list_friends');
  if (error) {
    return {
      ok: false,
      reason: isPermissionDenied(error)
        ? NOT_CONNECTED
        : 'Could not load your friends. Check your connection.',
    };
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
 * An add_friend failure as one plain sentence, for the driver `name`. Pure,
 * so every branch is tested without a backend.
 *
 * Never the server's own message. That used to be shown with its prefix
 * stripped, which put "you are already on your own board", a rate limiter's
 * log line or a fetch error's "TypeError: Network request failed" on screen.
 */
export function addFriendErrorMessage(
  error: { code?: string | null; message?: string | null },
  name: string,
): string {
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();
  if (code === '42501' || code === '28000' || /not authenticated/.test(message)) {
    return NOT_CONNECTED;
  }
  if (code === 'P0002' || /no driver called/.test(message)) return `No driver called @${name}.`;
  if (/own board|yourself/.test(message)) return "That's you. Your own runs are already on your board.";
  if (code === '54000' || /rate.?limit|too many/.test(message)) {
    return "You've added a lot of drivers in a short time. Try again later.";
  }
  if (/not.?allowed|blocked|hidden/.test(message)) return "You can't add this driver.";
  if (code === '' && (message === '' || /network|fetch|timed? ?out|offline|abort/.test(message))) {
    return "You're offline. Try again when you have signal.";
  }
  return "Couldn't add them. Try again later.";
}

/**
 * Add by username. Failures come back as sentences fit for the screen
 * (addFriendErrorMessage), never as the server's own words.
 *
 * The input is normalised first. The server matches usernames exactly, and
 * only trimming here meant '@toby_m' — copied off a share card — or 'Toby_M'
 * came back "No driver called @toby_m" for a driver who exists.
 */
export async function addFriend(username: string): Promise<AddFriendResult> {
  const name = friendUsernameFromInput(username);
  if (!name) return { ok: false, reason: 'Enter a username.' };
  // Nothing outside this pattern can exist, so say why rather than asking the
  // server and reporting that nobody has that name.
  if (!isValidUsername(name)) return { ok: false, reason: USERNAME_RULE };
  if (!supabase) return { ok: false, reason: 'Friends need an account. Connect one first.' };

  try {
    await ensureUserId();
    const { data, error } = await supabase.rpc('add_friend', { p_username: name });
    if (error) return { ok: false, reason: addFriendErrorMessage(error, name) };
    return { ok: true, friendId: data as string };
  } catch (e) {
    return { ok: false, reason: addFriendErrorMessage(e as { message?: string }, name) };
  }
}

export async function removeFriend(friendId: string): Promise<boolean> {
  if (!supabase) return false;
  await ensureUserId();
  const { error } = await supabase.rpc('remove_friend', { p_friend_id: friendId });
  return !error;
}
