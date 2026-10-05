/**
 * Supabase client. Anonymous-first: the app must work fully offline/signed-out
 * — the user records their first drive before being asked to create an
 * account. If env keys are absent (local dev without a backend), the client
 * is null and every sync call is a no-op.
 *
 * Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * How long one request to the backend may take before it is given up on.
 *
 * React Native's fetch has no timeout of its own. On a connection that
 * accepts a request and then never answers — a captive portal, a tunnel, one
 * bar in a car park — a request can simply never settle: Delete account would
 * sit on "Deleting…", and a sync pass would hold its single-flight slot so
 * nothing else uploaded until the app was killed. Every caller already treats
 * a failed request as "try again later", so failing is the safe outcome.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Edge functions get longer. verify-drive's work grows with the drive (it reads
 * every fix back), and a verify cut off at the client is not cancelled at the
 * server: the drive is offered again on the next pass and verified a second
 * time from the start. Fifteen seconds would turn a long drive on a slow
 * function cold start into the same work done on every launch.
 */
export const FUNCTION_TIMEOUT_MS = 60_000;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** The budget for one request: edge function calls get FUNCTION_TIMEOUT_MS. */
export function timeoutFor(input: RequestInfo | URL): number {
  return urlOf(input).includes('/functions/v1/') ? FUNCTION_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

/**
 * fetch with a deadline, for every request supabase-js makes (PostgREST, auth,
 * edge functions).
 *
 * A caller that passes its own signal keeps full control of it: the timeout is
 * added only when there is none, since combining two signals needs
 * AbortSignal.any, which React Native does not have.
 *
 * Neither has it AbortSignal.timeout: RN installs the abort-controller 3.0
 * polyfill, which predates it. That is used where it exists (Node, the jest
 * environment, a future RN); otherwise a controller and a timer do the same
 * job, cleared as soon as the request settles so a finished request leaves
 * nothing behind. Exported for the tests.
 */
export function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal) return fetch(input, init);
  const ms = timeoutFor(input);
  if (typeof AbortSignal.timeout === 'function') {
    return fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
        global: { fetch: fetchWithTimeout },
      })
    : null;

let inFlight: Promise<string | null> | null = null;

/**
 * The signed-in user's id, signing in anonymously first when there is no
 * session. Null when there is no backend, or no session could be had (offline).
 * Never throws.
 *
 * Safe to call as often as needed, and it has to be: this used to run once, at
 * cold start. An offline first launch, or the signOut at the end of account
 * deletion, then left the app sessionless — sync, friends and VIN decode all
 * failing — until the process was killed, which for an app that records in the
 * background can be days. It now runs before authenticated work, when the app
 * returns to the foreground, and when onboarding completes.
 *
 * Single-flight, so a burst of callers cannot mint two anonymous users and
 * strand drives on the first.
 *
 * Signs in only when getSession says cleanly that there is no session. An
 * error means a stored session exists but could not be refreshed — typically
 * offline with an expired access token — and signing in over it would replace
 * that user with a new one, orphaning everything they uploaded. Waiting for
 * the network costs nothing.
 *
 * A refresh the server refused for good is the exception, and it is told
 * apart by asking twice. When the refresh token belongs to an account that no
 * longer exists — deleted, or removed by the server's purge of anonymous
 * accounts left unused for 30 days (0021) — auth-js removes the stored session
 * itself, so a second getSession answers cleanly with none, and this signs in
 * at once rather than on some later pass. Offline, the session is still
 * stored, the second answer is the same error (auth-js caches a failed
 * refresh briefly, so it costs no second request), and nothing is replaced.
 */
export function ensureUserId(): Promise<string | null> {
  const client = supabase;
  if (!client) return Promise.resolve(null);
  inFlight ??= establish(client).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function establish(client: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await client.auth.getSession();
    if (data.session) return data.session.user.id;
    if (error) {
      const again = await client.auth.getSession();
      if (again.data.session) return again.data.session.user.id;
      if (again.error) return null;
    }
    const { data: signedIn, error: signInError } = await client.auth.signInAnonymously();
    return signInError ? null : (signedIn.session?.user.id ?? null);
  } catch {
    return null;
  }
}

/** Sign in anonymously so drives can sync before any explicit account exists. */
export async function ensureSession(): Promise<boolean> {
  return (await ensureUserId()) != null;
}
