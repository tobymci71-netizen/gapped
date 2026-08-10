/**
 * Device attestation — "did this come from a real, unmodified app on a real
 * device?".
 *
 * This is the check plausibility.ts rests on. Every envelope test in that file
 * is applied to numbers the client sent; if the client is a rebuilt binary or
 * a script with a stolen anon key, those numbers are whatever the attacker
 * chose and the envelope is theatre. Attestation is what makes the rest mean
 * something.
 *
 * Server-only: this directory is NOT the auto-generated `_shared/`, and
 * nothing here is shipped to the client.
 *
 * iOS      App Attest     — a hardware-backed key, attested once by Apple,
 *                           then asserted per upload with a counter.
 * Android  Play Integrity — a token minted per upload, decoded by Google.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRUST ANCHOR: the Apple App Attest root CA is NOT embedded in this file.
 * A root certificate typed from memory is a trust anchor nobody verified, and
 * a single wrong byte either rejects every real device or, worse, is a chain
 * to nowhere. Install it as a secret from Apple directly:
 *
 *   curl -o root.pem https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
 *   supabase secrets set APPLE_APP_ATTEST_ROOT_CA="$(cat root.pem)"
 *
 * Without it, iOS attestation fails closed with a configuration reason — it
 * never silently degrades to "passed".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { decode as cborDecode } from 'npm:cbor-x@1.6.0';
import * as x509 from 'npm:@peculiar/x509@1.12.3';

export type AttestationStatus = 'passed' | 'failed' | 'unsupported' | 'none';

export type AttestationVerdict = {
  status: AttestationStatus;
  platform: 'ios' | 'android' | null;
  /** Always populated. Never reject a drive without a reason a human can read. */
  reason: string;
  details?: Record<string, unknown>;
};

/** Apple's OID for the App Attest nonce extension on the credential cert. */
const APPLE_NONCE_OID = '1.2.840.113635.100.8.2';

// ── small helpers ───────────────────────────────────────────────────────────

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as unknown as BufferSource));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * ECDSA signatures arrive DER-encoded; WebCrypto wants the raw r‖s pair.
 * Both integers are left-padded to 32 bytes, and DER's leading zero (added
 * when the high bit would make the integer look negative) is dropped.
 */
export function derToRawEcdsa(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error('signature is not a DER SEQUENCE');
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f); // long-form length
  const readInt = (): Uint8Array => {
    if (der[i] !== 0x02) throw new Error('expected DER INTEGER in signature');
    const len = der[i + 1];
    let start = i + 2;
    let n = len;
    while (n > 32 && der[start] === 0x00) {
      start++;
      n--;
    }
    if (n > 32) throw new Error('signature integer too long for P-256');
    const out = new Uint8Array(32);
    out.set(der.subarray(start, start + n), 32 - n);
    i = i + 2 + len;
    return out;
  };
  return concat(readInt(), readInt());
}

/**
 * authenticatorData layout (WebAuthn, which App Attest reuses):
 *   [0..32)  rpIdHash
 *   [32]     flags
 *   [33..37) signCount, big-endian
 *   [37..53) aaguid            (attestation only)
 *   [53..55) credentialId length (attestation only)
 */
function parseAuthData(authData: Uint8Array) {
  if (authData.length < 37) throw new Error('authenticatorData too short');
  const view = new DataView(authData.buffer, authData.byteOffset, authData.byteLength);
  return {
    rpIdHash: authData.subarray(0, 32),
    flags: authData[32],
    signCount: view.getUint32(33, false),
    aaguid: authData.length >= 53 ? authData.subarray(37, 53) : new Uint8Array(0),
    credentialId:
      authData.length >= 55
        ? authData.subarray(55, 55 + view.getUint16(53, false))
        : new Uint8Array(0),
  };
}

function importP256(spki: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    spki as unknown as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
}

// ── App Attest: registration (one per key, ever) ────────────────────────────

export type AppAttestRegistration = {
  verdict: AttestationVerdict;
  /** SPKI DER of the attested key — store it; assertions verify against it. */
  publicKeySpki?: Uint8Array;
  signCount?: number;
  environment?: 'production' | 'development';
};

/**
 * Verify an App Attest attestation object and extract the key to trust.
 *
 * Follows Apple's published validation steps in order. Every failure returns a
 * verdict rather than throwing, so the caller records *why* a device was
 * refused instead of a bare 500.
 */
export async function verifyAppAttestAttestation(opts: {
  attestationB64: string;
  challenge: string;
  keyIdB64: string;
  /** "<TEAMID>.<bundle id>" */
  appId: string;
  rootCaPem: string | null;
}): Promise<AppAttestRegistration> {
  const fail = (reason: string, details?: Record<string, unknown>): AppAttestRegistration => ({
    verdict: { status: 'failed', platform: 'ios', reason, details },
  });

  if (!opts.rootCaPem) {
    return fail(
      'APPLE_APP_ATTEST_ROOT_CA is not configured — refusing to trust an unverified chain',
    );
  }

  let attStmt: { x5c?: Uint8Array[]; receipt?: Uint8Array };
  let authData: Uint8Array;
  try {
    const obj = cborDecode(b64ToBytes(opts.attestationB64)) as {
      fmt: string;
      attStmt: { x5c?: Uint8Array[]; receipt?: Uint8Array };
      authData: Uint8Array;
    };
    if (obj.fmt !== 'apple-appattest') return fail(`unexpected attestation format "${obj.fmt}"`);
    attStmt = obj.attStmt;
    authData = new Uint8Array(obj.authData);
  } catch (e) {
    return fail(`attestation object is not decodable CBOR: ${(e as Error).message}`);
  }

  const x5c = attStmt.x5c ?? [];
  if (x5c.length < 2) return fail('attestation certificate chain is too short');

  // 1. Chain: credCert → intermediate → Apple root.
  let credCert: x509.X509Certificate;
  try {
    const chain = x5c.map((der) => new x509.X509Certificate(new Uint8Array(der)));
    credCert = chain[0];
    const root = new x509.X509Certificate(opts.rootCaPem);
    const builder = new x509.X509ChainBuilder({ certificates: [...chain.slice(1), root] });
    const built = await builder.build(credCert);
    const anchor = built[built.length - 1];
    if (!anchor) return fail('could not build certificate chain');
    const anchorFp = bytesToHex(new Uint8Array(await anchor.getThumbprint('SHA-256')));
    const rootFp = bytesToHex(new Uint8Array(await root.getThumbprint('SHA-256')));
    if (anchorFp !== rootFp) return fail('certificate chain does not terminate at the Apple root');
    for (const cert of built) {
      const now = new Date();
      if (cert.notBefore > now || cert.notAfter < now) {
        return fail(`certificate out of validity window: ${cert.subject}`);
      }
    }
  } catch (e) {
    return fail(`certificate chain validation failed: ${(e as Error).message}`);
  }

  // 2. nonce = SHA256(authData ‖ SHA256(challenge)), and it must appear in the
  //    credential cert's Apple extension. This is what binds the attestation
  //    to *this* challenge rather than a replayed one.
  const clientDataHash = await sha256(new TextEncoder().encode(opts.challenge));
  const expectedNonce = await sha256(concat(authData, clientDataHash));

  const ext = credCert.getExtension(APPLE_NONCE_OID);
  if (!ext) return fail('credential certificate is missing the Apple nonce extension');
  const extBytes = new Uint8Array(ext.value);
  // DER: SEQUENCE { [1] { OCTET STRING nonce } } — locate the 32-byte string.
  const idx = extBytes.findIndex(
    (b, i) => b === 0x04 && extBytes[i + 1] === 0x20 && i + 2 + 32 <= extBytes.length,
  );
  if (idx < 0) return fail('nonce extension is malformed');
  const presentedNonce = extBytes.subarray(idx + 2, idx + 34);
  if (!timingSafeEqual(presentedNonce, expectedNonce)) {
    return fail('attestation nonce does not match the challenge', {
      expected: bytesToHex(expectedNonce),
      presented: bytesToHex(presentedNonce),
    });
  }

  // 3. keyId must be SHA256 of the attested public key.
  const spki = new Uint8Array(credCert.publicKey.rawData);
  const rawPoint = spki.subarray(spki.length - 65); // uncompressed P-256 point
  const keyIdExpected = await sha256(rawPoint);
  const keyIdGiven = b64ToBytes(opts.keyIdB64);
  if (!timingSafeEqual(keyIdExpected, keyIdGiven)) {
    return fail('keyId is not the hash of the attested public key');
  }

  // 4. rpIdHash must be SHA256 of the app id — an attestation for a different
  //    app is not an attestation for this one.
  let parsed: ReturnType<typeof parseAuthData>;
  try {
    parsed = parseAuthData(authData);
  } catch (e) {
    return fail(`authenticatorData is malformed: ${(e as Error).message}`);
  }
  const appIdHash = await sha256(new TextEncoder().encode(opts.appId));
  if (!timingSafeEqual(parsed.rpIdHash, appIdHash)) {
    return fail('attestation is bound to a different app id');
  }

  // 5. A freshly attested key has never signed anything.
  if (parsed.signCount !== 0) return fail(`fresh attestation has signCount ${parsed.signCount}`);

  // 6. aaguid tells us production vs development. A development attestation on
  //    a production backend is a debug build talking to real leaderboards.
  const aaguidText = new TextDecoder().decode(parsed.aaguid).replace(/\0+$/, '');
  const environment =
    aaguidText === 'appattestdevelop'
      ? 'development'
      : aaguidText === 'appattest'
        ? 'production'
        : null;
  if (!environment) return fail(`unrecognised aaguid "${aaguidText}"`);

  if (!timingSafeEqual(parsed.credentialId, keyIdGiven)) {
    return fail('credentialId does not match keyId');
  }

  return {
    verdict: {
      status: 'passed',
      platform: 'ios',
      reason: `App Attest key registered (${environment})`,
      details: { environment },
    },
    publicKeySpki: spki,
    signCount: parsed.signCount,
    environment,
  };
}

// ── App Attest: per-upload assertion ────────────────────────────────────────

export type AppAttestAssertionResult = {
  verdict: AttestationVerdict;
  /** New counter to persist. Must strictly increase or the assertion is a replay. */
  signCount?: number;
};

export async function verifyAppAttestAssertion(opts: {
  assertionB64: string;
  challenge: string;
  publicKeySpki: Uint8Array;
  storedSignCount: number;
  appId: string;
}): Promise<AppAttestAssertionResult> {
  const fail = (reason: string, details?: Record<string, unknown>): AppAttestAssertionResult => ({
    verdict: { status: 'failed', platform: 'ios', reason, details },
  });

  let signature: Uint8Array;
  let authData: Uint8Array;
  try {
    const obj = cborDecode(b64ToBytes(opts.assertionB64)) as {
      signature: Uint8Array;
      authenticatorData: Uint8Array;
    };
    signature = new Uint8Array(obj.signature);
    authData = new Uint8Array(obj.authenticatorData);
  } catch (e) {
    return fail(`assertion is not decodable CBOR: ${(e as Error).message}`);
  }

  let parsed: ReturnType<typeof parseAuthData>;
  try {
    parsed = parseAuthData(authData);
  } catch (e) {
    return fail(`authenticatorData is malformed: ${(e as Error).message}`);
  }

  const appIdHash = await sha256(new TextEncoder().encode(opts.appId));
  if (!timingSafeEqual(parsed.rpIdHash, appIdHash)) {
    return fail('assertion is bound to a different app id');
  }

  // The counter is the replay defence: hardware only ever increments it, so an
  // assertion captured off the wire and resent carries a stale value.
  if (parsed.signCount <= opts.storedSignCount) {
    return fail('assertion counter did not advance — replayed assertion', {
      stored: opts.storedSignCount,
      presented: parsed.signCount,
    });
  }

  // ECDSA-SHA256 over (authenticatorData ‖ clientDataHash): WebCrypto hashes
  // that concatenation internally, which yields exactly Apple's nonce.
  const clientDataHash = await sha256(new TextEncoder().encode(opts.challenge));
  const signed = concat(authData, clientDataHash);

  let ok = false;
  try {
    const key = await importP256(opts.publicKeySpki);
    ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      derToRawEcdsa(signature) as unknown as BufferSource,
      signed as unknown as BufferSource,
    );
  } catch (e) {
    return fail(`assertion signature could not be checked: ${(e as Error).message}`);
  }
  if (!ok) return fail('assertion signature is invalid');

  return {
    verdict: { status: 'passed', platform: 'ios', reason: 'App Attest assertion valid' },
    signCount: parsed.signCount,
  };
}

// ── Play Integrity ──────────────────────────────────────────────────────────

type ServiceAccount = { client_email: string; private_key: string };

function pemToPkcs8(pem: string): Uint8Array {
  return b64ToBytes(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, ''));
}

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Exchange a service-account JWT for an access token. Google requires OAuth2
 * for decodeIntegrityToken; there is no API-key path.
 */
async function googleAccessToken(sa: ServiceAccount, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/playintegrity',
        aud: 'https://oauth2.googleapis.com/token',
        iat,
        exp: iat + 3600,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key) as unknown as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claims}`)),
  );
  const jwt = `${header}.${claims}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token as string;
}

/**
 * Decode and judge a Play Integrity token.
 *
 * The verdicts that matter: the request must be for our package, the app must
 * be Play-recognised and unmodified, and the device must pass basic integrity.
 * MEETS_STRONG_INTEGRITY is not required — it excludes plenty of legitimate
 * phones, and refusing real drivers is its own kind of wrong.
 */
export async function verifyPlayIntegrity(opts: {
  token: string;
  packageName: string;
  serviceAccountJson: string | null;
  challenge: string;
  now?: number;
}): Promise<AttestationVerdict> {
  const fail = (reason: string, details?: Record<string, unknown>): AttestationVerdict => ({
    status: 'failed',
    platform: 'android',
    reason,
    details,
  });

  if (!opts.serviceAccountJson) {
    return fail('PLAY_INTEGRITY_SERVICE_ACCOUNT is not configured');
  }

  let payload: Record<string, Record<string, unknown>>;
  try {
    const sa = JSON.parse(opts.serviceAccountJson) as ServiceAccount;
    const accessToken = await googleAccessToken(sa, opts.now ?? Date.now());
    const res = await fetch(
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(opts.packageName)}:decodeIntegrityToken`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ integrity_token: opts.token }),
      },
    );
    if (!res.ok) return fail(`Play Integrity decode failed: ${res.status} ${await res.text()}`);
    payload = (await res.json()).tokenPayloadExternal ?? {};
  } catch (e) {
    return fail(`Play Integrity decode error: ${(e as Error).message}`);
  }

  return judgePlayIntegrityPayload(payload, opts.packageName, opts.challenge);
}

/**
 * Pure verdict logic, split out so it is unit-testable without a Google round
 * trip — the network call above is the only part that needs credentials.
 */
export function judgePlayIntegrityPayload(
  payload: Record<string, Record<string, unknown>>,
  packageName: string,
  challenge: string,
): AttestationVerdict {
  const fail = (reason: string, details?: Record<string, unknown>): AttestationVerdict => ({
    status: 'failed',
    platform: 'android',
    reason,
    details,
  });

  const req = payload.requestDetails ?? {};
  const app = payload.appIntegrity ?? {};
  const device = payload.deviceIntegrity ?? {};

  if (req.requestPackageName !== packageName) {
    return fail('integrity token was minted for a different package', {
      got: req.requestPackageName,
    });
  }
  // requestHash binds the token to this drive; without it a token from any
  // other request of ours would be accepted here.
  if (req.requestHash !== challenge) {
    return fail('integrity token is not bound to this drive', { got: req.requestHash });
  }
  if (app.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
    return fail('app is not the build we published', { got: app.appRecognitionVerdict });
  }

  const verdicts = (device.deviceRecognitionVerdict ?? []) as string[];
  if (!verdicts.includes('MEETS_DEVICE_INTEGRITY')) {
    return fail('device does not meet basic integrity', { got: verdicts });
  }

  return {
    status: 'passed',
    platform: 'android',
    reason: 'Play Integrity verdict accepted',
    details: { deviceRecognitionVerdict: verdicts },
  };
}
