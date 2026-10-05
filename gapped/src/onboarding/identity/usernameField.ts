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

import {
  isValidUsername,
  normaliseUsername,
  USERNAME_NOT_ALLOWED,
  USERNAME_TAKEN,
  usernameRefusal,
} from '@/lib/username';

// Defined beside the rules, because a server refusal is read there too
// (usernameErrorMessage); re-exported so the step's copy stays in one import.
export { USERNAME_NOT_ALLOWED, USERNAME_TAKEN };

/** Grey, under an untouched or still-typing field. */
export const USERNAME_HELPER = '3–20 lowercase letters, numbers or underscores.';
/** Orange: the name cannot be used as typed. */
export const USERNAME_INVALID = 'Use 3–20 lowercase letters, numbers or underscores.';

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
 *  - not_allowed: a write of this name was refused by the server's filter
 *    (the availability check only asks who holds a name, so this comes from
 *    a save, never from the check)
 *  - unknown: no backend, offline, an error, or the timeout — not a "no"
 */
export type Availability =
  | 'unchecked'
  | 'checking'
  | 'available'
  | 'taken'
  | 'not_allowed'
  | 'unknown';

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
 * can fix them, and so is a term the denylist refuses anywhere in a name.
 * Length waits for `settled`, and so does any refusal more typing may still
 * undo (usernameRefusal's 'word'): a term refused only as a whole word
 * ("admin", which may be the start of "admiral"), or one at the start of an
 * innocent host ("scunt", on the way to "scunthorpe"). A
 * well-formed name then waits on the server — except that "unknown" counts as
 * free, so the step never traps someone with no signal (docs/ONBOARDING.md:
 * "valid and available (or unknown offline)"). The server still judges the
 * name when it is saved; a refusal then comes back as 'taken' or
 * 'not_allowed'.
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
  const refused = (caption: string): UsernameFieldState => ({
    name,
    tone: 'error',
    caption,
    checking: false,
    canContinue: false,
  });

  if (name.length === 0) return neutral();
  if (!ALLOWED.test(name)) return refused(USERNAME_INVALID);
  const refusal = usernameRefusal(name);
  if (refusal === 'contains') return refused(USERNAME_NOT_ALLOWED);
  if (!isValidUsername(name)) return settled ? refused(USERNAME_INVALID) : neutral();
  if (refusal === 'word') return settled ? refused(USERNAME_NOT_ALLOWED) : neutral();

  switch (availability) {
    case 'taken':
      return refused(USERNAME_TAKEN);
    case 'not_allowed':
      return refused(USERNAME_NOT_ALLOWED);
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
