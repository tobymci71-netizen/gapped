/**
 * Exercises decode-vin against the real NHTSA vPIC service.
 *
 * Kept out of verify-roundtrip on purpose: it depends on a third-party API
 * being up, and a network wobble should not make the main check go red.
 *
 *   node scripts/verify-vin-decode.mjs
 */
import { createClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? '  [32mPASS[0m' : '  [31mFAIL[0m'}  ${name}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
};

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const app = createClient(API, ANON_KEY, opts);
const { data: auth } = await app.auth.signInAnonymously();
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
const other = createClient(API, ANON_KEY, opts);
await other.auth.signInAnonymously();
const stolen = await other.functions.invoke('decode-vin', {
  body: { vehicle_id: vehicleId, vin: '1HGCM82633A004352' },
});
check("another user cannot decode someone else's vehicle", stolen.error?.context?.status === 403, {
  status: stolen.error?.context?.status,
});

console.log(
  failures === 0
    ? '\n[32mVIN decode verified against live NHTSA.[0m'
    : `\n[31m${failures} check(s) failed.[0m`,
);
process.exit(failures === 0 ? 0 : 1);
