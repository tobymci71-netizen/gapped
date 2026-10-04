/**
 * The onboarding proof screens' data — the contract between those screens and
 * the backend.
 *
 * The screens call these and hand the result to `brandProof` / `countryProof`,
 * which decide between the ranked and the early-stage variant. Everything that
 * can go wrong — no backend, offline, a slow network, an error, an answer that
 * is not the documented shape — comes back as null, which the variant helpers
 * turn into the honest early variant. So a proof screen never shows a number
 * the server did not give it, and never waits long for one.
 *
 * Server side: `make_popularity`, `country_activity` and `onboarding_answers`
 * in supabase/migrations/0017_onboarding_social_proof.sql, which says exactly
 * who and what each count includes. Keep these signatures stable: the screens
 * are written against them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CountryCode } from '@/data/countries';
import { ensureUserId, supabase } from '@/lib/supabase';
import type { Attribution, Focus, VehicleKind } from '@/state/profile';
import type { CountryActivity, MakePopularityRow } from './proofVariants';

export * from './proofVariants';

export type OnboardingAnswers = {
  focus: Focus | null;
  attribution: Attribution | null;
};

/**
 * How long a proof screen waits for its numbers before settling for the early
 * variant. The screen is one step of a flow someone is tapping through; a
 * request stuck on a weak signal must not hold it for supabase-js's own
 * minute-long timeout. Four seconds covers a cold anonymous sign-in plus the
 * call on a poor connection, and it is the only wait: the session is made
 * inside it, not before it.
 */
export const PROOF_FETCH_TIMEOUT_MS = 4000;

/**
 * Runs `work` and gives up on it after PROOF_FETCH_TIMEOUT_MS, resolving
 * `fallback` instead. Never rejects. When `abort` is set the work is also told
 * to stop (a read nobody will look at); otherwise it is left to finish in the
 * background (a write that may still land).
 */
async function within<T>(
  work: (signal: AbortSignal) => Promise<T>,
  fallback: T,
  abort: boolean,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      if (abort) controller.abort();
      resolve(fallback);
    }, PROOF_FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work(controller.signal).catch(() => fallback), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The client to ask, once the session has been seen to; null only with no
 * backend at all.
 *
 * The app signs in before it asks for anything (as it does for the boards), so
 * a first launch, which needs a session for the rest of onboarding anyway,
 * gets it here and the call carries it. But the answer does not depend on it:
 * both functions are granted to anon (0017) for exactly this screen, so a
 * sign-in refused while the network works — anonymous sign-ins are
 * rate-limited per IP, and a car meet's Wi-Fi is one IP — still gets the real
 * numbers, not the early variant in their place. Offline, the call fails as
 * fast as the sign-in did.
 */
async function proofClient(): Promise<SupabaseClient | null> {
  const client = supabase;
  if (!client) return null;
  await ensureUserId();
  return client;
}

/**
 * A count as the server sent it. PostgREST writes bigint and numeric as JSON
 * numbers, which is what arrives today; a string is accepted too, so a proxy
 * or a future PostgREST that quotes big numbers does not blank every screen.
 * Anything else is not a count.
 */
function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * `make_popularity` rows, or null if any row is not the documented shape. All
 * or nothing: the server's ranks are only meaningful as a set, and a chart
 * with a row quietly missing would misstate the ones around it.
 */
function parseMakeRows(data: unknown): MakePopularityRow[] | null {
  if (!Array.isArray(data)) return null;
  const rows: MakePopularityRow[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    const make = typeof raw?.make === 'string' ? raw.make : null;
    const drivers = toNumber(raw?.drivers);
    const rank = toNumber(raw?.rank);
    const share = toNumber(raw?.share);
    if (!make || drivers == null || rank == null || share == null) return null;
    rows.push({ make, drivers, rank, share });
  }
  return rows;
}

/**
 * `country_activity`'s one row. The server withholds a count under ten as SQL
 * NULL (too few to publish, and too few for either line on the screen); it
 * arrives here as 0, which `countryProof` shows as the early variant exactly
 * as it would have shown the real number. Null when the row is missing or
 * malformed.
 */
function parseCountryActivity(data: unknown): CountryActivity | null {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== 'object') return null;
  const count = (value: unknown) => (value == null ? 0 : toNumber(value));
  const drivers = count(row.drivers);
  const droveYesterday = count(row.drove_yesterday);
  if (drivers == null || droveYesterday == null) return null;
  return { drivers, droveYesterday };
}

/**
 * `make_popularity(kind)`: one row per make that at least five drivers of
 * this kind have as their main vehicle — the server withholds smaller makes,
 * but still counts their drivers in every share. `share` is a PERCENTAGE,
 * 0–100. Null when it cannot be had — no backend, offline, slow, an error —
 * which is not the same as an empty list (reachable, too few drivers yet);
 * both mean the early variant. Never rejects.
 */
export async function fetchMakePopularity(
  kind: VehicleKind,
): Promise<MakePopularityRow[] | null> {
  return within(
    async (signal) => {
      const client = await proofClient();
      if (!client) return null;
      const { data, error } = await client
        .rpc('make_popularity', { p_kind: kind })
        .abortSignal(signal);
      return error ? null : parseMakeRows(data);
    },
    null,
    true,
  );
}

/**
 * `country_activity(country)`. Null when it cannot be had (no backend,
 * offline, slow, error), which `countryProof` shows as the early variant.
 * Never rejects.
 */
export async function fetchCountryActivity(
  country: CountryCode,
): Promise<CountryActivity | null> {
  return within(
    async (signal) => {
      const client = await proofClient();
      if (!client) return null;
      const { data, error } = await client
        .rpc('country_activity', { p_country: country })
        .abortSignal(signal);
      return error ? null : parseCountryActivity(data);
    },
    null,
    true,
  );
}

/**
 * Writes the answers given to the caller's own `onboarding_answers` row and
 * resolves whether the server took them. Never rejects.
 *
 * Only the answers that are set are sent. supabase-js's upsert updates exactly
 * the columns it is given, so saving the attribution later cannot blank a
 * focus saved earlier — the same rule pushIdentity follows for the country.
 * Nothing to send counts as saved.
 *
 * Shared with sync.ts, which retries the stored answers on every sync pass
 * until one of these succeeds.
 */
export async function upsertOnboardingAnswers(
  client: SupabaseClient,
  userId: string,
  answers: OnboardingAnswers,
): Promise<boolean> {
  const given = {
    ...(answers.focus ? { focus: answers.focus } : {}),
    ...(answers.attribution ? { attribution: answers.attribution } : {}),
  };
  if (Object.keys(given).length === 0) return true;
  try {
    const { error } = await client
      .from('onboarding_answers')
      .upsert({ profile_id: userId, ...given }, { onConflict: 'profile_id' });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Upserts the person's focus and attribution into `onboarding_answers` (own
 * row only; never `profiles`, which is world-readable). Best effort: resolves
 * whether or not the write reached the server, within PROOF_FETCH_TIMEOUT_MS,
 * and never rejects, because nothing in onboarding may wait on it or fail
 * because of it. A write still in flight at the deadline is left to finish.
 * The answers are also kept in the profile store, and sync.ts sends them again
 * on its next pass if this one missed.
 */
export async function saveOnboardingAnswers(answers: OnboardingAnswers): Promise<void> {
  await within(
    async () => {
      const client = supabase;
      if (!client) return;
      const userId = await ensureUserId();
      if (userId) await upsertOnboardingAnswers(client, userId, answers);
    },
    undefined,
    false,
  );
}
