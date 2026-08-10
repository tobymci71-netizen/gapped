/**
 * attest-device — one-time registration of an iOS App Attest key.
 *
 * The device generates a hardware key, Apple attests it, and this endpoint
 * decides whether to trust it. Once stored, every drive upload from that
 * device carries an assertion signed by the key (see verify-drive).
 *
 * Android needs nothing here: Play Integrity mints a fresh token per request
 * and is verified statelessly.
 *
 * Deploy:  supabase functions deploy attest-device
 * Secrets: APPLE_APP_ATTEST_ROOT_CA, APPLE_APP_ID
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyAppAttestAttestation } from '../_server/attestation.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  const { key_id, attestation } = await req.json().catch(() => ({}));
  if (!key_id || !attestation) return json({ error: 'key_id and attestation required' }, 400);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

  // Registration is always on behalf of the caller — never a caller-supplied id.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = await supabase.auth.getUser(token);
  const uid = caller?.user?.id;
  if (!uid) return json({ error: 'unauthenticated' }, 401);

  const appId = Deno.env.get('APPLE_APP_ID');
  if (!appId) return json({ error: 'APPLE_APP_ID is not configured' }, 503);

  // The challenge binds the attestation to this account, so a key attested for
  // one user cannot be presented as another's. Registration is idempotent, so
  // a replay buys an attacker nothing beyond re-registering their own key.
  const result = await verifyAppAttestAttestation({
    attestationB64: attestation,
    challenge: uid,
    keyIdB64: key_id,
    appId,
    rootCaPem: Deno.env.get('APPLE_APP_ATTEST_ROOT_CA') ?? null,
  });

  if (result.verdict.status !== 'passed' || !result.publicKeySpki) {
    return json({ attestation: result.verdict }, 400);
  }

  // A key already registered to somebody else is not ours to re-point.
  const { data: existing } = await supabase
    .from('device_attestations')
    .select('profile_id')
    .eq('key_id', key_id)
    .maybeSingle();
  if (existing && existing.profile_id !== uid) {
    return json({ error: 'key is registered to another account' }, 409);
  }

  const { error } = await supabase.from('device_attestations').upsert(
    {
      key_id,
      profile_id: uid,
      platform: 'ios',
      public_key: `\\x${[...result.publicKeySpki].map((b) => b.toString(16).padStart(2, '0')).join('')}`,
      sign_count: result.signCount ?? 0,
      environment: result.environment ?? 'production',
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'key_id' },
  );
  if (error) return json({ error: error.message }, 500);

  return json({ attestation: result.verdict });
});
