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

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
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
 * the network costs nothing. (A revoked refresh token is the exception that
 * proves it: auth-js removes that session itself, so the next call here sees
 * no session and no error, and signs in.)
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
    if (error) return null;
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
