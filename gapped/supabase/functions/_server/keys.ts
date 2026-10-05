/**
 * The project's own server keys, old and new.
 *
 * Supabase is replacing the JWT `service_role` key (SUPABASE_SERVICE_ROLE_KEY)
 * with named secret keys (`sb_secret_…`), which Edge Functions receive as
 * SUPABASE_SECRET_KEYS — a JSON object keyed by name, e.g.
 * `{"default":"sb_secret_…"}`. Internal callers (a re-verification run after a
 * maths fix) may present either kind during and after the migration, so both
 * are accepted, and the legacy key keeps working exactly as before.
 *
 * Fails closed: a malformed SUPABASE_SECRET_KEYS contributes no keys rather
 * than being guessed at, and an empty string is never a key.
 */

/** The slice of `Deno.env` this needs — injectable so tests need no env. */
export type Env = { get(name: string): string | undefined };

function secretKeys(env: Env): string[] {
  const raw = env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const values: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed != null && typeof parsed === 'object'
      ? Object.values(parsed as Record<string, unknown>)
      : [];
  return values
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Every key that identifies a call as our own server, legacy first. */
export function serverKeys(env: Env): string[] {
  const legacy = env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  return [...(legacy ? [legacy] : []), ...secretKeys(env)];
}

/**
 * The key to build the service-role client with: the legacy key while it is
 * set (unchanged behaviour), else the secret key named `default`, else any.
 */
export function serviceClientKey(env: Env): string | null {
  const legacy = env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (legacy) return legacy;
  const raw = env.get('SUPABASE_SECRET_KEYS');
  try {
    const named = raw ? (JSON.parse(raw) as Record<string, unknown>)?.default : undefined;
    if (typeof named === 'string' && named.trim()) return named.trim();
  } catch {
    /* fall through to any well-formed key */
  }
  return secretKeys(env)[0] ?? null;
}

/**
 * Constant-time string comparison. A bearer token compared with `===` leaks,
 * through timing, how long a prefix of a server key an attacker has guessed.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Whether a bearer token is one of this project's server keys. */
export function isServerKey(token: string, env: Env): boolean {
  if (!token) return false;
  // Every key is compared, not just until the first match, so the time taken
  // does not reveal which kind of key matched either.
  let match = false;
  for (const key of serverKeys(env)) {
    if (timingSafeEqual(token, key)) match = true;
  }
  return match;
}
