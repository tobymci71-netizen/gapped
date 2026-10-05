/**
 * Username rules, in one place.
 *
 * Pure — no Supabase, no stores — so the onboarding step, the You tab's
 * "choose another" card, the edit-username screen and the tests all apply
 * exactly the same rule. The availability check, which needs the network,
 * lives in sync.ts next to the code that writes the name.
 *
 * The server is the authority on what may be held. Every name it refuses
 * comes back as SQLSTATE 23514 'username_not_allowed' (the format below, plus
 * a denylist of profanity, slurs and reserved names). The terms here are a
 * short mirror of that denylist, so the commonest refusals show while the
 * person is still typing instead of after a round trip. Anything they miss,
 * the server still catches; usernameErrorMessage says so in plain words.
 */

/** 3–20 characters: lowercase letters, numbers, underscores. */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Orange: another driver holds it. */
export const USERNAME_TAKEN = 'That username is already taken.';
/** Orange: the name is on the server's denylist, or this mirror of it. */
export const USERNAME_NOT_ALLOWED = "That username isn't allowed. Pick another.";
/** The write never got an answer, so nothing about the name is known. */
export const USERNAME_SAVE_FAILED =
  "Couldn't save your username. Check your connection and try again.";

/** What the user typed, as it would be stored: trimmed and lower-cased. */
export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** True when an already-normalised name satisfies USERNAME_RE. */
export function isValidUsername(name: string): boolean {
  return USERNAME_RE.test(name);
}

/*
 * The mirror of the server's denylist (supabase/migrations/0019_moderation.sql,
 * blocked_terms), using its matching rules so the two cannot disagree about a
 * name both of them hold a term for:
 *
 *   - text is compared lower-cased, with leetspeak mapped (0→o 1→i 3→e 4→a
 *     5→s 7→t) and every '_' removed, so "f_u_c_k" and "sh1t" are caught;
 *   - the innocent words that happen to hold a term (Scunthorpe, snigger) are
 *     cut out of that first;
 *   - a CONTAINS term matches anywhere in what is left;
 *   - a WORD term matches only a whole '_'-separated word (digits at its
 *     start, its end or both ignored, so "admin123", "4dm1n" and "4dmin1"
 *     are all "admin") or the whole name run together, and only if it
 *     survived the cut — so "admin" refuses "admin_bob" but not "badminton".
 *
 * Every term here is also on the server's list, and every innocent word the
 * server cuts from a username is here, so a name this refuses the server
 * refuses too, never the other way round. The server's list is longer — and can grow without an
 * app release — so a refusal can still come back from a save, as 23514
 * 'username_not_allowed'.
 */

/**
 * Profanity and slurs refused anywhere in a name, a short list of the
 * commonest: words with no innocent host. Also the terms a vehicle make is
 * held to (isMakeAllowed), as the server holds makes to its profanity and
 * slurs only.
 */
const PROFANITY_TERMS: readonly string[] = [
  'bitch',
  'cunt',
  'faggot',
  'fuck',
  'hitler',
  'nigga',
  'nigger',
  'porn',
  'retard',
  'shit',
  'slut',
  'twat',
  'wanker',
  'whore',
];

/** Terms refused anywhere in a username: profanity, slurs, and names that would pass as the app, the store or its staff. */
const CONTAINS_TERMS: readonly string[] = [
  ...PROFANITY_TERMS,
  'administrator',
  'appstore',
  'gapped',
  'moderator',
  'official',
];

/** Terms refused only as a whole word, because each sits inside ordinary ones. */
const WORD_TERMS: ReadonlySet<string> = new Set([
  'admin',
  'apple',
  'null',
  'root',
  'staff',
  'support',
  'system',
  'undefined',
]);

/**
 * Innocent hosts, cut out before any term is sought: all of the server's
 * (kind 'allow'), longest first as there.
 */
const ALLOW_WORDS: readonly string[] = [
  'scunthorpe',
  'penistone',
  'pussycat',
  'milford',
  'snigger',
];

/**
 * Hosts cut out of a make only (the server's kind 'allow_make'): real makes in
 * the app's catalogue that hold a term. As usernames they are refused.
 */
const MAKE_HOSTS: readonly string[] = ['crazydagocustoms', 'badasschoppers'];

const LOOKALIKE: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
};

const unLeet = (text: string): string => text.replace(/[013457]/g, (d) => LOOKALIKE[d] ?? d);

/** `flat` with every innocent host cut out, as the server cuts them. */
const withoutHosts = (flat: string, hosts: readonly string[] = ALLOW_WORDS): string => {
  let cleaned = flat;
  for (const host of hosts) cleaned = cleaned.split(host).join('');
  return cleaned;
};

const holdsContainsTerm = (cleaned: string): boolean =>
  CONTAINS_TERMS.some((term) => cleaned.includes(term));

/**
 * True when `flat` stops partway into an innocent host, and finishing that
 * host would cut every blocked term back out: "scunt" on the way to
 * "scunthorpe". Such a name is refused as it stands, but more typing can still
 * make it allowed.
 */
const hostUnderway = (flat: string): boolean =>
  ALLOW_WORDS.some((host) => {
    for (let k = 1; k < host.length; k++) {
      if (flat.endsWith(host.slice(0, k)) && !holdsContainsTerm(withoutHosts(flat + host.slice(k)))) {
        return true;
      }
    }
    return false;
  });

/**
 * Why the denylist mirror refuses an already-normalised name, or null when it
 * does not. The answer is also when the field may say so:
 *
 *  - 'contains': a blocked term is inside the name, and no further typing can
 *    take it out, so the field says so at once.
 *  - 'word': further typing may still make the name allowed, so the field
 *    waits for typing to pause, as it does for length. Either a whole word is
 *    blocked ("admin" on the way to "admiral"), or a blocked term sits at the
 *    start of an innocent host the name is partway through ("scunt" on the
 *    way to "scunthorpe").
 *
 * Both are refusals, and the same ones: only when to say so differs.
 */
export function usernameRefusal(name: string): 'contains' | 'word' | null {
  const lower = name.toLowerCase();
  const flat = unLeet(lower).replace(/[^a-z0-9]/g, '');
  const cleaned = withoutHosts(flat);
  if (holdsContainsTerm(cleaned)) return hostUnderway(flat) ? 'word' : 'contains';

  // Each word as it stands, and with the digits at its start, its end or
  // both cut off: "admin123", "4dm1n" and "4dmin1" are all "admin". Mapped
  // after the cut, so a lookalike digit inside the word still counts.
  const parts = lower.split(/[^a-z0-9]+/).filter((part) => part.length > 0);
  const words = new Set([
    flat,
    ...parts.flatMap((part) =>
      [
        part,
        part.replace(/^[0-9]+/, ''),
        part.replace(/[0-9]+$/, ''),
        part.replace(/^[0-9]+|[0-9]+$/g, ''),
      ].map(unLeet),
    ),
  ]);
  for (const word of words) {
    if (WORD_TERMS.has(word) && cleaned.includes(word)) return 'word';
  }
  return null;
}

/** True when the denylist mirror lets `name` through. */
export function isUsernameAllowed(name: string): boolean {
  return usernameRefusal(name) == null;
}

/** The lookalikes a make can also hold, mapped as the server maps them. */
const MAKE_LOOKALIKE: Readonly<Record<string, string>> = { ...LOOKALIKE, '@': 'a', $: 's', '!': 'i' };

/** A letter in any script (it has a case), or a digit. */
const isLetterOrDigit = (c: string): boolean => /[0-9]/.test(c) || c.toLowerCase() !== c.toUpperCase();

/**
 * True when the denylist mirror lets a vehicle make through.
 *
 * The server refuses a NEW vehicle row whose make holds profanity or a slur
 * (0019, 23514 'make_not_allowed'); reserved names do not apply, since a make
 * called "Apple" impersonates nobody. Its key for a make: lower-cased,
 * lookalikes mapped (as for usernames, plus @→a $→s !→i), and every
 * character that is not a letter or digit dropped, so "F.U.C.K Motors" is
 * caught. The catalogue's own makes that hold a term ("BAD ASS Choppers")
 * are cut out first, as the server cuts them. Like the username mirror this
 * list is shorter than the server's, so a refusal can still come back from a
 * sync (src/lib/sync.ts, vehicleRefused).
 */
export function isMakeAllowed(make: string): boolean {
  const mapped = make.toLowerCase().replace(/[013457@$!]/g, (c) => MAKE_LOOKALIKE[c] ?? c);
  const flat = [...mapped].filter(isLetterOrDigit).join('');
  const cleaned = withoutHosts(flat, [...MAKE_HOSTS, ...ALLOW_WORDS]);
  return !PROFANITY_TERMS.some((term) => cleaned.includes(term));
}

/** Shown when a make is refused, by the mirror while typing or by the server. */
export const MAKE_NOT_ALLOWED = "That make isn't allowed. Enter another.";

/** What the server said about a username write, when it said no. */
export type UsernameRejection = 'taken' | 'not_allowed';

/**
 * Reads a username write's error. 23505 is the unique index: another driver
 * holds the name. 23514 is the server's filter refusing it; matched on the
 * code or on the message, so a check raised without the code still counts.
 * Anything else — offline, a permission error — is not a verdict on the name,
 * and is null.
 */
export function usernameRejection(err: unknown): UsernameRejection | null {
  if (err == null || typeof err !== 'object') return null;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code === '23505') return 'taken';
  if (code === '23514') return 'not_allowed';
  if (typeof message === 'string' && message.includes('username_not_allowed')) {
    return 'not_allowed';
  }
  return null;
}

/**
 * Reads a vehicles write's error: true when the server refused the row
 * itself, which no retry changes until the make does. 23514 is both of
 * 0019's refusals — 'make_not_allowed' from the make filter, and the
 * vehicles_make_text / vehicles_model_text CHECKs (1–80 characters, nothing
 * invisible). Anything else (offline, a permission error) is not a verdict.
 */
export function vehicleRejected(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code === '23514') return true;
  return (
    typeof message === 'string' &&
    /make_not_allowed|vehicles_make_text|vehicles_model_text/.test(message)
  );
}

/**
 * A failed username write, as the person reads it. Never the server's own
 * message: those are written for the database log, not for the screen.
 */
export function usernameErrorMessage(err: unknown): string {
  switch (usernameRejection(err)) {
    case 'taken':
      return USERNAME_TAKEN;
    case 'not_allowed':
      return USERNAME_NOT_ALLOWED;
    default:
      return USERNAME_SAVE_FAILED;
  }
}
