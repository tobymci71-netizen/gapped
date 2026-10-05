/**
 * Reporting and hiding other drivers (App Review guideline 1.2).
 *
 * A board of usernames is user-generated content, so anyone on it can be
 * reported to the owner, who reviews reports within 24 hours, and hidden from
 * your own boards at once. Server side (migrations 0019 and 0020): the
 * `report_driver` RPC, rate limited and refusing a report of yourself; the
 * `blocks` table, own rows only, which board_top, board_brackets and
 * list_friends read to leave out anyone you hid; and `list_blocked`, the
 * hidden drivers with their names, newest first.
 *
 * Every call resolves, never throws, and says what happened in words that can
 * go straight on screen. A failure is never folded into success: a report
 * that did not send must not be thanked for. Like friends.ts, each makes sure
 * there is a session first — the RPCs and table are granted to
 * `authenticated` only.
 */

import { ensureUserId, supabase } from '@/lib/supabase';

/** The `report_driver` reasons, in the server's vocabulary. */
export type ReportReason = 'offensive_username' | 'cheating' | 'impersonation' | 'other';

/** The reasons as the report sheet lists them, in that order. */
export const REPORT_REASONS: readonly { key: ReportReason; label: string }[] = [
  { key: 'offensive_username', label: 'Offensive username' },
  { key: 'cheating', label: 'Cheating or spoofed run' },
  { key: 'impersonation', label: 'Impersonation' },
  { key: 'other', label: 'Other' },
];

/** The server's ceiling on a report's free text. */
export const REPORT_DETAILS_MAX = 500;

/** Shown once a report has been accepted. */
export const REPORTED_CONFIRMATION = 'Thanks. We review reports within 24 hours.';
/** Shown once a driver has been hidden. */
export const HIDDEN_CONFIRMATION = "Hidden. You won't see them on your boards.";

/**
 * Why a call did not go through.
 *  - unavailable: this backend has no such RPC or table yet (an older
 *    server), or it refused for a reason that is no fault of the person's
 *  - offline: no answer at all
 *  - not_connected: no session yet, or the session was refused
 *  - rate_limited: too many reports in the server's window
 *  - self: the driver is you
 */
export type ModerationFailure = 'unavailable' | 'offline' | 'not_connected' | 'rate_limited' | 'self';

export type ModerationResult = { ok: true } | { ok: false; reason: ModerationFailure; message: string };

export type HiddenDriver = {
  profileId: string;
  username: string;
  /** Epoch ms. */
  hiddenAt: number;
};

export type HiddenResult =
  | { ok: true; drivers: HiddenDriver[] }
  | { ok: false; reason: ModerationFailure; message: string };

/** The PostgREST error fields read here. */
type DbError = { code?: unknown; message?: unknown };

/**
 * PGRST202: no such function in the schema cache. PGRST205: no such table.
 * 42883 and 42P01 are Postgres saying the same, when the call gets that far.
 */
const MISSING = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);
/** No privilege (no session yet), or no authenticated user. */
const NOT_CONNECTED = new Set(['42501', '28000', 'PGRST301']);

/**
 * A server error, sorted into what the person can do about it. Pure, so every
 * branch is tested without a backend.
 *
 * report_driver says why it refused in its message (0019): not_authenticated
 * (28000), cannot_report_self, rate_limited (PT429, ten a day), and
 * invalid_reason, details_too_long and no_such_driver, none of which the
 * person can act on, so they read as "Couldn't send". supabase-js reports a
 * request that never got an answer as an error with an empty code and the
 * fetch failure's message.
 */
export function moderationFailure(error: unknown): ModerationFailure {
  const { code, message } = (error ?? {}) as DbError;
  const c = typeof code === 'string' ? code : '';
  const m = typeof message === 'string' ? message.toLowerCase() : '';
  if (MISSING.has(c)) return 'unavailable';
  if (NOT_CONNECTED.has(c)) return 'not_connected';
  if (c === 'PT429' || c === '54000' || /rate.?limit|too many/.test(m)) return 'rate_limited';
  // blocks_not_self is the blocks table's CHECK (0019), named in the message
  // of the 23514 a self-block gets; '\bself\b' misses it behind the '_'.
  if (/yourself|\bself\b|cannot_report_self|cannot_block_self|blocks_not_self/.test(m)) {
    return 'self';
  }
  if (c === '' && /network|fetch|timed? ?out|offline|abort/.test(m)) return 'offline';
  if (c === '' && m === '') return 'offline';
  return 'unavailable';
}

type Action = 'report' | 'hide' | 'unhide' | 'list';

/**
 * The sentence for a failure. "Couldn't send" is the catch-all for the two
 * actions that send something; it is also what an older backend without
 * these RPCs gets, because there is nothing else the person could do.
 */
export function moderationMessage(action: Action, reason: ModerationFailure): string {
  switch (reason) {
    case 'offline':
      return "You're offline. Try again when you have signal.";
    case 'not_connected':
      return 'Still connecting your account. Try again in a moment.';
    case 'rate_limited':
      return action === 'report'
        ? "You've sent a lot of reports recently. Try again later."
        : 'Too many changes in a short time. Try again later.';
    case 'self':
      return action === 'report' ? "You can't report yourself." : "You can't hide yourself.";
    case 'unavailable':
      switch (action) {
        case 'report':
        case 'hide':
          return "Couldn't send. Try again later.";
        case 'unhide':
          return "Couldn't unhide them. Try again later.";
        case 'list':
          return "Couldn't load hidden drivers. Try again later.";
      }
  }
}

const fail = (action: Action, reason: ModerationFailure) =>
  ({ ok: false, reason, message: moderationMessage(action, reason) }) as const;

/**
 * The details as the server takes them: trimmed, at most REPORT_DETAILS_MAX
 * characters, and null when nothing was written.
 */
export function reportDetails(details: string | null | undefined): string | null {
  const text = (details ?? '').trim().slice(0, REPORT_DETAILS_MAX);
  return text.length > 0 ? text : null;
}

/**
 * The session, or the failure to report in its place. Null from ensureUserId
 * is "no session could be had": offline on a first launch, or a sign-in the
 * server refused. Either way nothing is asked of a server that would refuse.
 */
async function signedIn(action: Action): Promise<{ me: string } | ReturnType<typeof fail>> {
  const me = await ensureUserId();
  return me ? { me } : fail(action, 'not_connected');
}

/** Report another driver to the owner. */
export async function reportDriver(
  profileId: string,
  reason: ReportReason,
  details?: string | null,
): Promise<ModerationResult> {
  const client = supabase;
  if (!client) return fail('report', 'unavailable');
  try {
    const session = await signedIn('report');
    if (!('me' in session)) return session;
    if (session.me === profileId) return fail('report', 'self');
    const { error } = await client.rpc('report_driver', {
      p_reported: profileId,
      p_reason: reason,
      p_details: reportDetails(details),
    });
    return error ? fail('report', moderationFailure(error)) : { ok: true };
  } catch (e) {
    return fail('report', moderationFailure(e));
  }
}

/**
 * Hide a driver from every board you see. Idempotent: hiding someone already
 * hidden is a success, not a duplicate-key error for the screen to explain.
 */
export async function hideDriver(profileId: string): Promise<ModerationResult> {
  const client = supabase;
  if (!client) return fail('hide', 'unavailable');
  try {
    const session = await signedIn('hide');
    if (!('me' in session)) return session;
    if (session.me === profileId) return fail('hide', 'self');
    // blocker_id defaults to auth.uid() on the server, and RLS holds it there.
    const { error } = await client.from('blocks').insert({ blocked_id: profileId });
    if (error && (error as DbError).code !== '23505') {
      return fail('hide', moderationFailure(error));
    }
    return { ok: true };
  } catch (e) {
    return fail('hide', moderationFailure(e));
  }
}

/** Let a hidden driver back onto your boards. */
export async function unhideDriver(profileId: string): Promise<ModerationResult> {
  const client = supabase;
  if (!client) return fail('unhide', 'unavailable');
  try {
    const session = await signedIn('unhide');
    if (!('me' in session)) return session;
    const { error } = await client
      .from('blocks')
      .delete()
      .eq('blocker_id', session.me)
      .eq('blocked_id', profileId);
    return error ? fail('unhide', moderationFailure(error)) : { ok: true };
  } catch (e) {
    return fail('unhide', moderationFailure(e));
  }
}

/**
 * The drivers you have hidden, newest first. Like listFriends, a failure is
 * never an empty list: "we could not ask" is not "you have hidden nobody".
 * With no backend there is nobody to have hidden.
 */
export async function listHidden(): Promise<HiddenResult> {
  const client = supabase;
  if (!client) return { ok: true, drivers: [] };
  try {
    const session = await signedIn('list');
    if (!('me' in session)) return session;
    const { data, error } = await client.rpc('list_blocked');
    if (error) return fail('list', moderationFailure(error));
    const rows = Array.isArray(data)
      ? (data as { blocked_id: string; username: string | null; created_at: string }[])
      : [];
    const drivers = rows
      .map((r) => ({
        profileId: r.blocked_id,
        username: r.username ?? 'driver',
        hiddenAt: Date.parse(r.created_at),
      }))
      .sort((a, b) => (b.hiddenAt || 0) - (a.hiddenAt || 0));
    return { ok: true, drivers };
  } catch (e) {
    return fail('list', moderationFailure(e));
  }
}
