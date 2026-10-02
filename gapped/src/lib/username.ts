/**
 * Username rules, in one place.
 *
 * Pure — no Supabase, no stores — so the onboarding step, the You tab's
 * "choose another" card and the tests all apply exactly the same rule. The
 * availability check, which needs the network, lives in sync.ts next to the
 * code that writes the name.
 */

/** 3–20 characters: lowercase letters, numbers, underscores. */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** What the user typed, as it would be stored: trimmed and lower-cased. */
export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** True when an already-normalised name satisfies USERNAME_RE. */
export function isValidUsername(name: string): boolean {
  return USERNAME_RE.test(name);
}
