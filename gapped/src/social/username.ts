/**
 * Someone else's username, as typed into the friends screen.
 *
 * Stored usernames are lowercase with no '@', and the server matches them
 * exactly. But the app *shows* every username as '@name' — the share card,
 * the You tab, your own board row — so '@name' is exactly what people type
 * when they add a friend. This is the stored-form rule from src/lib/username.ts
 * plus the one step that only matters for a name copied off a screen: the
 * leading '@' comes off.
 */

import { isValidUsername, normaliseUsername } from '@/lib/username';

export { isValidUsername };

/** Shown when typed text cannot be a username, so no request is made for it. */
export const USERNAME_RULE = 'Usernames are 3–20 lowercase letters, numbers or underscores.';

/** Typed text → the stored form: trimmed, leading '@'s dropped, lowercased. */
export function friendUsernameFromInput(input: string): string {
  return normaliseUsername(input.trim().replace(/^@+/, ''));
}
