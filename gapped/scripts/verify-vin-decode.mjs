/**
 * Exercises decode-vin against the real NHTSA vPIC service.
 *
 * Kept out of verify-roundtrip on purpose: it depends on a third-party API
 * being up, and a network wobble should not make the main check go red.
 *
 *   node scripts/verify-vin-decode.mjs
 *
 * Local only: it signs up throwaway accounts, so it refuses any SUPABASE_URL
 * that is not 127.0.0.1 or localhost unless ALLOW_REMOTE=1, and deletes the
 * accounts it created when it finishes, pass or fail.
 */
import { createClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let apiHost = null;
try {
  apiHost = new URL(API).hostname;
} catch {
  /* unparseable — refused below */
}
if (!['127.0.0.1', 'localhost'].includes(apiHost) && process.env.ALLOW_REMOTE !== '1') {
  console.error(
    `Refusing to run against ${API}: this script creates accounts and writes vehicles. ` +
      'It runs against 127.0.0.1 or localhost only; set ALLOW_REMOTE=1 to override.',
  );
  process.exit(1);
}

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? '  \x1b[32mPASS\x1b[0m' : '  \x1b[31mFAIL\x1b[0m'}  ${name}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
};

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Every client this run signed in, so each account can be deleted at the end. */
const signedIn = [];
async function signUp() {
  const client = createClient(API, ANON_KEY, opts);
  const { data, error } = await client.auth.signInAnonymously();
  if (data?.user) signedIn.push(client);
  return { client, data, error };
}

async function main() {
  const { client: app, data: auth, error: authErr } = await signUp();
  if (!auth?.user) throw new Error(`anonymous sign-in failed: ${authErr?.message}`);
  const uid = auth.user.id;
  await app.from('profiles').update({ username: `vin_${Date.now().toString(36)}`, country: 'GB' }).eq('id', uid);

  const vehicleId = crypto.randomUUID();
  await app.from('vehicles').insert({
    id: vehicleId, profile_id: uid, kind: 'car', make: 'Unknown', model: 'Unknown', is_primary: true,
  });

  console.log('\n\x1b[1mdecode-vin against live NHTSA vPIC\x1b[0m');

  // A real, well-known VIN: 2003 Honda Accord.
  const { data, error } = await app.functions.invoke('decode-vin', {
    body: { vehicle_id: vehicleId, vin: '1HGCM82633A004352' },
  });
  check('decode succeeds', !error, error?.message);
  check('make decoded', data?.make === 'HONDA', data?.make);
  check('model decoded', typeof data?.model === 'string' && data.model.length > 0, data?.model);
  check('year decoded', String(data?.year) === '2003', data?.year);
  check('a bracket key is returned', typeof data?.bracket_key === 'string', data?.bracket_key);
  console.log(`        decoded → ${data?.make} ${data?.model} ${data?.year}`);
  console.log(`        drivetrain=${data?.drivetrain} hp=${data?.factory_power_hp} kg=${data?.curb_weight_kg}`);
  console.log(`        bracket=${data?.bracket_key} missing=[${(data?.missing ?? []).join(', ')}]`);

  // Specs landed on the row, written by the server.
  const { data: row } = await app
    .from('vehicles')
    .select('make, year, spec_source, drivetrain, curb_weight_kg, factory_power_hp')
    .eq('id', vehicleId)
    .single();
  check('specs were written server-side', row?.spec_source === 'vin', row);
  check('the vehicle row now carries the decoded make', row?.make === 'HONDA', row?.make);

  // Garbage must be refused before it reaches vPIC.
  const bad = await app.functions.invoke('decode-vin', { body: { vehicle_id: vehicleId, vin: 'NOTAVIN' } });
  check('a malformed VIN is rejected', !!bad.error, bad.data);

  // Someone else's vehicle is not ours to rewrite.
  const { client: other } = await signUp();
  const stolen = await other.functions.invoke('decode-vin', {
    body: { vehicle_id: vehicleId, vin: '1HGCM82633A004352' },
  });
  check("another user cannot decode someone else's vehicle", stolen.error?.context?.status === 403, {
    status: stolen.error?.context?.status,
  });

  // The limiter: 20 decodes an hour per caller, charged before the ownership
  // check. That call was the first of `other`'s 20; another 19 are refused as
  // forbidden without reaching vPIC, and the 21st is refused as rate limited.
  const statuses = [];
  for (let i = 0; i < 19; i++) {
    const r = await other.functions.invoke('decode-vin', {
      body: { vehicle_id: vehicleId, vin: '1HGCM82633A004352' },
    });
    statuses.push(r.error?.context?.status);
  }
  check('the first 20 calls in an hour are not rate limited', statuses.every((s) => s === 403), statuses);
  const limited = await other.functions.invoke('decode-vin', {
    body: { vehicle_id: vehicleId, vin: '1HGCM82633A004352' },
  });
  check('the 21st is refused with 429', limited.error?.context?.status === 429, {
    status: limited.error?.context?.status,
  });
  check(
    'and says when to retry',
    limited.error?.context?.headers?.get('Retry-After') === '3600',
    limited.error?.context?.headers?.get('Retry-After'),
  );
}

try {
  await main();
} catch (e) {
  failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m  run aborted: ${e?.message ?? e}`);
} finally {
  for (const client of signedIn) {
    const { error } = await client.rpc('delete_account');
    if (error) {
      failures++;
      console.log(`  \x1b[31mFAIL\x1b[0m  could not delete a test account: ${error.message}`);
    }
  }
}

console.log(
  failures === 0
    ? '\n\x1b[32mVIN decode verified against live NHTSA.\x1b[0m'
    : `\n\x1b[31m${failures} check(s) failed.\x1b[0m`,
);
process.exit(failures === 0 ? 0 : 1);
