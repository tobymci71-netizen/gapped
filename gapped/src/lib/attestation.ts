/**
 * Client half of device attestation.
 *
 * Producing an attestation needs platform APIs that only exist in native code
 * — DCAppAttestService on iOS, the Play Integrity API on Android. Neither is
 * in the Expo SDK, so this module talks to an optional native module and
 * returns null when it is absent.
 *
 * Absent is a first-class outcome, not an error. The app runs in Expo Go, on
 * simulators, and on devices too old to attest; in all of those the drive
 * still records, still uploads and still shows up as the user's own. The
 * server records `attestation: 'none'` and treats it as unattested rather than
 * fraudulent — see supabase/functions/_server/attestation.ts.
 *
 * ── To turn this on ────────────────────────────────────────────────────────
 * Attestation cannot work in Expo Go: it needs a dev build with a native
 * module (e.g. `expo-app-integrity`) and, on iOS, the App Attest capability
 * plus a real device. Install one, implement `NativeAttestation` against it
 * below, then set the server secrets (APPLE_APP_ID, APPLE_APP_ATTEST_ROOT_CA,
 * ANDROID_PACKAGE_NAME, PLAY_INTEGRITY_SERVICE_ACCOUNT). Only once real
 * hardware has been seen to pass should ATTESTATION_REQUIRED be set to 'true'.
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';

/** What a native attestation module has to provide. */
type NativeAttestation = {
  isSupported(): Promise<boolean>;
  /** iOS: generate a hardware key, returns its base64 keyId. */
  generateKey(): Promise<string>;
  /** iOS: Apple-signed attestation of that key over `challenge`. */
  attestKey(keyId: string, challenge: string): Promise<string>;
  /** iOS: CBOR assertion over `challenge`, signed by the key. */
  generateAssertion(keyId: string, challenge: string): Promise<string>;
  /** Android: a Play Integrity token whose requestHash is `challenge`. */
  requestIntegrityToken(challenge: string): Promise<string>;
};

/**
 * Resolved lazily and defensively: the module is optional, so a missing
 * package must degrade to "unsupported" rather than crash the recorder.
 */
let native: NativeAttestation | null | undefined;

function getNative(): NativeAttestation | null {
  if (native !== undefined) return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-app-integrity') as Partial<NativeAttestation> | undefined;
    native =
      mod &&
      typeof mod.generateAssertion === 'function' &&
      typeof mod.requestIntegrityToken === 'function'
        ? (mod as NativeAttestation)
        : null;
  } catch {
    native = null;
  }
  return native;
}

const KEY_ID_STORAGE = 'gapped-attest-key-id';

export type AttestationPayload =
  | { platform: 'ios'; key_id: string; assertion: string }
  | { platform: 'android'; token: string };

/**
 * Register this device's App Attest key, once. Safe to call repeatedly — the
 * server upserts, and the key id is cached locally after the first success.
 *
 * Returns the key id, or null if this device cannot attest.
 */
export async function ensureRegisteredKey(): Promise<string | null> {
  const mod = getNative();
  if (!mod || Platform.OS !== 'ios' || !supabase) return null;
  if (!(await mod.isSupported().catch(() => false))) return null;

  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const cached = await AsyncStorage.getItem(KEY_ID_STORAGE);
  if (cached) return cached;

  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return null;

  try {
    const keyId = await mod.generateKey();
    // The challenge is the account id — the same value the server recomputes,
    // so a key attested for one account cannot be presented as another's.
    const attestation = await mod.attestKey(keyId, uid);
    const { data: res, error } = await supabase.functions.invoke('attest-device', {
      body: { key_id: keyId, attestation },
    });
    if (error || res?.attestation?.status !== 'passed') return null;
    await AsyncStorage.setItem(KEY_ID_STORAGE, keyId);
    return keyId;
  } catch {
    return null;
  }
}

/**
 * Attestation for one drive upload. The drive id is the challenge, which binds
 * the result to this drive and stops it being replayed onto another.
 */
export async function attestationFor(driveId: string): Promise<AttestationPayload | null> {
  const mod = getNative();
  if (!mod) return null;

  try {
    if (Platform.OS === 'ios') {
      const keyId = await ensureRegisteredKey();
      if (!keyId) return null;
      return { platform: 'ios', key_id: keyId, assertion: await mod.generateAssertion(keyId, driveId) };
    }
    if (Platform.OS === 'android') {
      return { platform: 'android', token: await mod.requestIntegrityToken(driveId) };
    }
  } catch {
    // A device that cannot attest right now must not block its own upload.
    return null;
  }
  return null;
}
