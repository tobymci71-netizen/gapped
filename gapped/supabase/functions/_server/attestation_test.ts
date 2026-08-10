/**
 * Tests for the attestation verifier.
 *
 *   cd supabase/functions && deno test --allow-net --allow-read _server/
 *
 * Coverage boundary, stated plainly:
 *
 *  - The App Attest *assertion* path — the one that runs on every upload — is
 *    tested end-to-end against a real P-256 key generated here. Signature
 *    verification, the DER→raw conversion, nonce construction, app-id binding
 *    and counter replay are all genuinely exercised.
 *
 *  - The App Attest *attestation* path (one-off key registration) needs a
 *    certificate chain only Apple can issue, so only its failure modes are
 *    tested. Its happy path MUST be validated against a real device before
 *    ATTESTATION_REQUIRED is turned on. That is why enforcement is a separate
 *    flag rather than the default.
 *
 *  - Play Integrity's verdict logic is fully tested; the Google round trip
 *    around it is credential-gated and not exercised here.
 */

import { assert, assertEquals } from 'jsr:@std/assert@1';
import { encode as cborEncode } from 'npm:cbor-x@1.6.0';
import {
  derToRawEcdsa,
  judgePlayIntegrityPayload,
  verifyAppAttestAssertion,
  verifyAppAttestAttestation,
} from './attestation.ts';

const APP_ID = 'ABCDE12345.app.gapped.drive';
const enc = new TextEncoder();

const sha256 = async (b: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', b as unknown as BufferSource));

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** WebCrypto signs raw r‖s; Apple hands us DER. Re-encode to match reality. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const body = b.subarray(i);
    const needsPad = (body[0] & 0x80) !== 0;
    const content = needsPad ? concat(new Uint8Array([0]), body) : body;
    return concat(new Uint8Array([0x02, content.length]), content);
  };
  const r = int(raw.subarray(0, 32));
  const s = int(raw.subarray(32, 64));
  return concat(new Uint8Array([0x30, r.length + s.length]), r, s);
}

async function makeAuthData(appId: string, counter: number): Promise<Uint8Array> {
  const rpIdHash = await sha256(enc.encode(appId));
  const rest = new Uint8Array(5);
  rest[0] = 0x40; // flags
  new DataView(rest.buffer).setUint32(1, counter, false);
  return concat(rpIdHash, rest);
}

/** A device that signs exactly the way Apple specifies. */
async function makeDevice() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));

  const assertFor = async (challenge: string, counter: number, appId = APP_ID) => {
    const authData = await makeAuthData(appId, counter);
    const clientDataHash = await sha256(enc.encode(challenge));
    const raw = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        concat(authData, clientDataHash) as unknown as BufferSource,
      ),
    );
    const cbor = cborEncode({ signature: rawToDer(raw), authenticatorData: authData });
    return btoa(String.fromCharCode(...new Uint8Array(cbor)));
  };

  return { spki, assertFor };
}

// ── DER → raw ───────────────────────────────────────────────────────────────

Deno.test('derToRawEcdsa left-pads short integers to 32 bytes', () => {
  // r = 0x01, s = 0x02 — both far shorter than 32 bytes.
  const der = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
  const raw = derToRawEcdsa(der);
  assertEquals(raw.length, 64);
  assertEquals(raw[31], 1);
  assertEquals(raw[63], 2);
  assertEquals(raw.subarray(0, 31).every((b) => b === 0), true);
});

Deno.test('derToRawEcdsa strips the DER sign-padding zero', () => {
  const r = new Uint8Array(33);
  r[0] = 0x00;
  r[1] = 0xff; // high bit set, so DER prepended a zero
  r.fill(0x11, 2);
  const s = new Uint8Array(32).fill(0x22);
  const der = concat(
    new Uint8Array([0x30, 2 + r.length + 2 + s.length]),
    new Uint8Array([0x02, r.length]),
    r,
    new Uint8Array([0x02, s.length]),
    s,
  );
  const raw = derToRawEcdsa(der);
  assertEquals(raw.length, 64);
  assertEquals(raw[0], 0xff); // the padding zero is gone, not shifted in
  assertEquals(raw[32], 0x22);
});

Deno.test('derToRawEcdsa rejects a non-SEQUENCE', () => {
  let threw = false;
  try {
    derToRawEcdsa(new Uint8Array([0x02, 0x01, 0x01]));
  } catch {
    threw = true;
  }
  assert(threw);
});

// ── App Attest assertions (the per-upload path) ─────────────────────────────

Deno.test('a genuine assertion verifies and reports the new counter', async () => {
  const device = await makeDevice();
  const driveId = crypto.randomUUID();
  const result = await verifyAppAttestAssertion({
    assertionB64: await device.assertFor(driveId, 7),
    challenge: driveId,
    publicKeySpki: device.spki,
    storedSignCount: 6,
    appId: APP_ID,
  });
  assertEquals(result.verdict.status, 'passed');
  assertEquals(result.signCount, 7);
});

Deno.test('an assertion for a different drive is rejected', async () => {
  const device = await makeDevice();
  const result = await verifyAppAttestAssertion({
    assertionB64: await device.assertFor(crypto.randomUUID(), 2),
    challenge: crypto.randomUUID(), // a different drive
    publicKeySpki: device.spki,
    storedSignCount: 1,
    appId: APP_ID,
  });
  assertEquals(result.verdict.status, 'failed');
  assert(result.verdict.reason.includes('signature is invalid'));
});

Deno.test('a replayed assertion is rejected on the counter', async () => {
  const device = await makeDevice();
  const driveId = crypto.randomUUID();
  const assertion = await device.assertFor(driveId, 5);

  const first = await verifyAppAttestAssertion({
    assertionB64: assertion, challenge: driveId, publicKeySpki: device.spki,
    storedSignCount: 4, appId: APP_ID,
  });
  assertEquals(first.verdict.status, 'passed');

  // Same bytes again, now that the stored counter has advanced.
  const replay = await verifyAppAttestAssertion({
    assertionB64: assertion, challenge: driveId, publicKeySpki: device.spki,
    storedSignCount: 5, appId: APP_ID,
  });
  assertEquals(replay.verdict.status, 'failed');
  assert(replay.verdict.reason.includes('replayed'));
});

Deno.test('an assertion from another app is rejected', async () => {
  const device = await makeDevice();
  const driveId = crypto.randomUUID();
  const result = await verifyAppAttestAssertion({
    assertionB64: await device.assertFor(driveId, 3, 'ZZZZZ99999.com.someone.else'),
    challenge: driveId,
    publicKeySpki: device.spki,
    storedSignCount: 0,
    appId: APP_ID,
  });
  assertEquals(result.verdict.status, 'failed');
  assert(result.verdict.reason.includes('different app id'));
});

Deno.test("another device's key cannot verify this assertion", async () => {
  const device = await makeDevice();
  const impostor = await makeDevice();
  const driveId = crypto.randomUUID();
  const result = await verifyAppAttestAssertion({
    assertionB64: await device.assertFor(driveId, 9),
    challenge: driveId,
    publicKeySpki: impostor.spki,
    storedSignCount: 0,
    appId: APP_ID,
  });
  assertEquals(result.verdict.status, 'failed');
});

Deno.test('a malformed assertion fails without throwing', async () => {
  const device = await makeDevice();
  const result = await verifyAppAttestAssertion({
    assertionB64: btoa('not cbor at all'),
    challenge: 'x',
    publicKeySpki: device.spki,
    storedSignCount: 0,
    appId: APP_ID,
  });
  assertEquals(result.verdict.status, 'failed');
});

// ── App Attest registration: fail-closed behaviour ──────────────────────────

Deno.test('registration fails closed when no root CA is configured', async () => {
  const result = await verifyAppAttestAttestation({
    attestationB64: btoa('anything'),
    challenge: 'c', keyIdB64: btoa('k'), appId: APP_ID,
    rootCaPem: null,
  });
  assertEquals(result.verdict.status, 'failed');
  assert(result.verdict.reason.includes('ROOT_CA'));
  assertEquals(result.publicKeySpki, undefined);
});

Deno.test('registration rejects an undecodable attestation object', async () => {
  const result = await verifyAppAttestAttestation({
    attestationB64: btoa('still not cbor'),
    challenge: 'c', keyIdB64: btoa('k'), appId: APP_ID,
    rootCaPem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  });
  assertEquals(result.verdict.status, 'failed');
});

Deno.test('registration rejects a non-Apple attestation format', async () => {
  const obj = cborEncode({ fmt: 'packed', attStmt: {}, authData: new Uint8Array(37) });
  const result = await verifyAppAttestAttestation({
    attestationB64: btoa(String.fromCharCode(...new Uint8Array(obj))),
    challenge: 'c', keyIdB64: btoa('k'), appId: APP_ID,
    rootCaPem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  });
  assertEquals(result.verdict.status, 'failed');
  assert(result.verdict.reason.includes('packed'));
});

// ── Play Integrity verdicts ─────────────────────────────────────────────────

const PKG = 'app.gapped.drive';
const goodPayload = (challenge: string) => ({
  requestDetails: { requestPackageName: PKG, requestHash: challenge },
  appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
  deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
});

Deno.test('a clean Play Integrity payload passes', () => {
  const v = judgePlayIntegrityPayload(goodPayload('drive-1'), PKG, 'drive-1');
  assertEquals(v.status, 'passed');
});

Deno.test('a token for another package is rejected', () => {
  const p = goodPayload('drive-1');
  p.requestDetails.requestPackageName = 'com.someone.else';
  assertEquals(judgePlayIntegrityPayload(p, PKG, 'drive-1').status, 'failed');
});

Deno.test('a token bound to another drive is rejected', () => {
  const v = judgePlayIntegrityPayload(goodPayload('drive-1'), PKG, 'drive-2');
  assertEquals(v.status, 'failed');
  assert(v.reason.includes('not bound to this drive'));
});

Deno.test('an unrecognised (repackaged) app is rejected', () => {
  const p = goodPayload('d');
  p.appIntegrity.appRecognitionVerdict = 'UNRECOGNIZED_VERSION';
  assertEquals(judgePlayIntegrityPayload(p, PKG, 'd').status, 'failed');
});

Deno.test('a device failing basic integrity is rejected', () => {
  const p = goodPayload('d');
  p.deviceIntegrity.deviceRecognitionVerdict = [];
  assertEquals(judgePlayIntegrityPayload(p, PKG, 'd').status, 'failed');
});

Deno.test('strong integrity is accepted but not required', () => {
  const p = goodPayload('d');
  p.deviceIntegrity.deviceRecognitionVerdict = ['MEETS_DEVICE_INTEGRITY', 'MEETS_STRONG_INTEGRITY'];
  assertEquals(judgePlayIntegrityPayload(p, PKG, 'd').status, 'passed');

  const basicOnly = goodPayload('d');
  basicOnly.deviceIntegrity.deviceRecognitionVerdict = ['MEETS_DEVICE_INTEGRITY'];
  assertEquals(judgePlayIntegrityPayload(basicOnly, PKG, 'd').status, 'passed');
});

Deno.test('every failure carries a human-readable reason', () => {
  const p = goodPayload('d');
  p.appIntegrity.appRecognitionVerdict = 'UNEVALUATED';
  const v = judgePlayIntegrityPayload(p, PKG, 'd');
  assert(v.reason.length > 0);
  assertEquals(v.platform, 'android');
});
