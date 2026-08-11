/**
 * Redaction for anything leaving the device as diagnostics.
 *
 * Split out from observability.ts so it can be unit-tested without loading the
 * Sentry SDK, which ships ESM that this Jest transform does not handle. That is
 * the practical reason; the better one is that this is pure logic with no
 * business importing a reporting SDK.
 *
 * This app records precise background location. Sentry attaches breadcrumbs
 * automatically: every network request URL, every console line, every
 * navigation. A single unscrubbed breadcrumb — a PostgREST URL with
 * `lat=eq.49.4657`, a console.log of a Fix, a Supabase URL carrying an access
 * token — ships a user's home address, or their session, to a third party.
 *
 * Nobody decides to do that. It happens because the default is to send
 * everything, so the default is changed here rather than relied upon.
 */

/**
 * Keys whose values are removed wholesale, matched case-insensitively as a
 * substring so `coords.latitude`, `start_lat` and `LATITUDE` all match.
 *
 * Coordinates are the point of the app and the thing that must never leave it
 * for a third party. Tokens and identifiers are here because a crash report
 * carrying a session is a credential leak wearing a diagnostic hat.
 */
const REDACT_KEYS = [
  'lat',
  'lon',
  'lng',
  'longitude',
  'latitude',
  'coord',
  'geometry',
  'route',
  'polyline',
  'wkt',
  'address',
  'token',
  'authorization',
  'apikey',
  'api_key',
  'password',
  'secret',
  'email',
  'profile_id',
  'user_id',
  'device_id',
];

const REDACTED = '[redacted]';

/**
 * Decimal degree pairs anywhere in free text — the case key-matching cannot
 * catch, such as an error message that interpolated a position, or a URL query
 * PostgREST built. Deliberately broad: a false positive costs a mangled log
 * line, a false negative costs someone's home address.
 */
const COORD_IN_TEXT = new RegExp(
  [
    // A bare decimal pair: "49.46570, -2.58530".
    String.raw`-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}`,
    // A named coordinate, optionally behind a PostgREST operator. The
    // `(?:[a-z]{2,5}\.)?` is not decoration: PostgREST writes filters as
    // `?lat=eq.49.4657`, so a pattern expecting a digit straight after the `=`
    // matches nothing and the URL sails through into a breadcrumb.
    String.raw`\b(?:lat|lon|lng|latitude|longitude)\b\s*[=:]\s*(?:[a-z]{2,5}\.)?-?\d+\.?\d*`,
  ].join('|'),
  'gi',
);

function scrubString(s: string): string {
  return s.replace(COORD_IN_TEXT, REDACTED);
}

/**
 * Recursively redacts a payload in place of sending it.
 *
 * Depth-limited because Sentry events can contain cyclic-ish nested contexts
 * and this runs on the crash path, where an infinite walk turns one bug into
 * two.
 */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return scrubString(value);
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.toLowerCase();
    out[k] = REDACT_KEYS.some((r) => key.includes(r)) ? REDACTED : scrub(v, depth + 1);
  }
  return out;
}

