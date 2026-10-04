/**
 * What the username step shows and allows, as a pure function of what was
 * typed and what the server said about it.
 *
 * The rules themselves are the server's (src/lib/username.ts); this decides
 * only the presentation: which caption sits under the field, whether the
 * border turns orange, and whether Continue is live. Kept out of the screen so
 * every state the design names — empty, typing, invalid, checking, taken,
 * available, offline — has a test rather than a tap-through.
 */

import { isValidUsername, normaliseUsername } from '@/lib/username';

/** Grey, under an untouched or still-typing field. */
export const USERNAME_HELPER = '3–20 lowercase letters, numbers or underscores.';
/** Orange: the name cannot be used as typed. */
export const USERNAME_INVALID = 'Use 3–20 lowercase letters, numbers or underscores.';
/** Orange: another driver holds it. */
export const USERNAME_TAKEN = 'That username is already taken.';

/**
 * How long typing has to pause before the name is checked with the server,
 * and before a too-short name is called out. Short enough that the verdict
 * lands while the person is still looking at the field; long enough that
 * "t", "to", "tob" are not each sent and each flagged on the way to "toby".
 */
export const USERNAME_SETTLE_MS = 400;

/**
 * The longest the availability check may hold Continue. isUsernameAvailable
 * has no timeout of its own, and on a weak signal a request can hang for far
 * longer than anyone will wait on one field. Past this the answer is
 * "unknown", which lets the person carry on exactly as offline does — the You
 * tab's "choose another" card still catches a late clash.
 */
export const USERNAME_CHECK_TIMEOUT_MS = 4000;

/** Only these characters can ever appear in a name (USERNAME_RE). */
const ALLOWED = /^[a-z0-9_]*$/;

/**
 * What the server has said about one name.
 *  - unchecked: nothing asked yet (typing has not settled)
 *  - checking: asked, no answer yet
 *  - available / taken: the answer
 *  - unknown: no backend, offline, an error, or the timeout — not a "no"
 */
export type Availability = 'unchecked' | 'checking' | 'available' | 'taken' | 'unknown';

export type UsernameFieldInput = {
  /** The field's text, as typed. */
  raw: string;
  /**
   * True once typing has paused for USERNAME_SETTLE_MS, or the field lost
   * focus. A too-short name is only an error once the person has stopped:
   * mid-word, "to" is not a mistake, it is the start of "toby".
   */
  settled: boolean;
  /** The server's answer for this exact normalised name. */
  availability: Availability;
};

export type UsernameFieldState = {
  /** The name as it would be stored (trimmed, lower-cased). */
  name: string;
  /** neutral: grey helper. error: orange border and caption. ok: lime check in the field. */
  tone: 'neutral' | 'error' | 'ok';
  /** The caption under the field. Always present, so nothing shifts when it changes. */
  caption: string;
  /** A spinner belongs in the field. */
  checking: boolean;
  canContinue: boolean;
};

/**
 * The step's whole presentation for one moment.
 *
 * Characters outside the rule are flagged at once, because no further typing
 * can fix them. Length waits for `settled`. A well-formed name then waits on
 * the server — except that "unknown" counts as free, so the step never traps
 * someone with no signal (docs/ONBOARDING.md: "valid and available (or
 * unknown offline)").
 */
export function usernameFieldState({
  raw,
  settled,
  availability,
}: UsernameFieldInput): UsernameFieldState {
  const name = normaliseUsername(raw);
  const neutral = (checking = false): UsernameFieldState => ({
    name,
    tone: 'neutral',
    caption: USERNAME_HELPER,
    checking,
    canContinue: false,
  });
  const invalid: UsernameFieldState = {
    name,
    tone: 'error',
    caption: USERNAME_INVALID,
    checking: false,
    canContinue: false,
  };

  if (name.length === 0) return neutral();
  if (!ALLOWED.test(name)) return invalid;
  if (!isValidUsername(name)) return settled ? invalid : neutral();

  switch (availability) {
    case 'taken':
      return { name, tone: 'error', caption: USERNAME_TAKEN, checking: false, canContinue: false };
    case 'available':
      return { ...neutral(), tone: 'ok', canContinue: true };
    case 'unknown':
      return { ...neutral(), canContinue: true };
    case 'checking':
      return neutral(true);
    case 'unchecked':
      return neutral();
  }
}

/** Server verdict → the field's vocabulary. Null is "could not ask", never "taken". */
export function availabilityFrom(free: boolean | null): Availability {
  if (free === true) return 'available';
  if (free === false) return 'taken';
  return 'unknown';
}

/**
 * Resolves with `promise`'s value, or with `fallback` once `ms` have passed,
 * whichever comes first. A rejection also resolves to `fallback`: callers here
 * treat every failure as "could not find out".
 */
export function withTimeout<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise<T | F>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
