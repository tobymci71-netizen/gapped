/**
 * Tests for the server-key check (_server/keys.ts): the legacy service-role
 * key keeps working, the new secret keys are accepted alongside it, and
 * nothing malformed or empty ever counts as a key.
 *
 *   npm run test:edge
 */

import { assert, assertEquals } from 'jsr:@std/assert@1';
import { type Env, isServerKey, serverKeys, serviceClientKey } from './keys.ts';

const env = (vars: Record<string, string>): Env => ({ get: (name) => vars[name] });

const LEGACY = 'eyJhbGciOiJIUzI1NiJ9.service-role.sig';
const SECRETS = JSON.stringify({ default: 'sb_secret_default', billing: 'sb_secret_billing' });

Deno.test('the legacy service-role key is still accepted on its own', () => {
  const e = env({ SUPABASE_SERVICE_ROLE_KEY: LEGACY });
  assert(isServerKey(LEGACY, e));
  assert(!isServerKey('sb_secret_default', e));
  assert(!isServerKey(`${LEGACY}x`, e));
  assert(!isServerKey(LEGACY.slice(0, -1), e));
});

Deno.test('every named secret key is accepted, alongside the legacy key', () => {
  const e = env({ SUPABASE_SERVICE_ROLE_KEY: LEGACY, SUPABASE_SECRET_KEYS: SECRETS });
  assert(isServerKey(LEGACY, e));
  assert(isServerKey('sb_secret_default', e));
  assert(isServerKey('sb_secret_billing', e));
  assert(!isServerKey('sb_publishable_default', e));
  assertEquals(serverKeys(e), [LEGACY, 'sb_secret_default', 'sb_secret_billing']);
});

Deno.test('secret keys work with the legacy key gone', () => {
  const e = env({ SUPABASE_SECRET_KEYS: SECRETS });
  assert(isServerKey('sb_secret_billing', e));
});

Deno.test('a malformed SUPABASE_SECRET_KEYS contributes no keys and breaks nothing', () => {
  const e = env({ SUPABASE_SERVICE_ROLE_KEY: LEGACY, SUPABASE_SECRET_KEYS: 'sb_secret_raw' });
  assertEquals(serverKeys(e), [LEGACY]);
  assert(!isServerKey('sb_secret_raw', e));
  assert(isServerKey(LEGACY, e));
});

Deno.test('an empty token or an empty key never matches', () => {
  const e = env({
    SUPABASE_SERVICE_ROLE_KEY: '',
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: '', other: 7 }),
  });
  assertEquals(serverKeys(e), []);
  assert(!isServerKey('', e));
  assert(!isServerKey('', env({})));
});

Deno.test('the client key prefers legacy, then the secret named default, then any', () => {
  assertEquals(
    serviceClientKey(env({ SUPABASE_SERVICE_ROLE_KEY: LEGACY, SUPABASE_SECRET_KEYS: SECRETS })),
    LEGACY,
  );
  assertEquals(serviceClientKey(env({ SUPABASE_SECRET_KEYS: SECRETS })), 'sb_secret_default');
  assertEquals(
    serviceClientKey(env({ SUPABASE_SECRET_KEYS: JSON.stringify({ ops: 'sb_secret_ops' }) })),
    'sb_secret_ops',
  );
  assertEquals(serviceClientKey(env({})), null);
});
