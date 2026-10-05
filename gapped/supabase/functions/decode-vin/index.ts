/**
 * decode-vin — turn a VIN into trusted vehicle specs.
 *
 * Drivetrain, weight and power decide which bracket a run competes in, so they
 * cannot be self-declared: "90 hp, 1800 kg" would drop a fast car into the
 * slowest class. The client sends a VIN, NHTSA vPIC decodes it here, and the
 * server writes the result. The client has no privilege on those columns
 * (migration 0009).
 *
 * The VIN itself is never stored. It identifies one specific car, and all we
 * need is what it decodes to — keeping it would be collecting an identifier
 * for no purpose the product has.
 *
 * Deploy: supabase functions deploy decode-vin
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkVin, curbWeightKgFromLb, normaliseDriveType, powerHpFrom } from '../_shared/vin.ts';
import { bracketKey, type Drivetrain } from '../_shared/brackets.ts';
import { serviceClientKey } from '../_server/keys.ts';

const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles';

/** Decodes allowed per profile per window. */
const DECODE_RATE_LIMIT = 20;
const DECODE_RATE_WINDOW_S = 3600;

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });

type VpicRow = Record<string, string | null>;

Deno.serve(async (req) => {
  const { vehicle_id, vin } = await req.json().catch(() => ({}));
  if (!vehicle_id || !vin) return json({ error: 'vehicle_id and vin required' }, 400);

  const parsed = checkVin(String(vin));
  if (!parsed.validFormat || !parsed.vin) {
    return json({ error: parsed.reason ?? 'That does not look like a VIN.' }, 400);
  }

  const serviceKey = serviceClientKey(Deno.env);
  if (!serviceKey) return json({ error: 'server key not configured' }, 500);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = await supabase.auth.getUser(token);
  const uid = caller?.user?.id;
  if (!uid) return json({ error: 'unauthenticated' }, 401);

  /*
   * Rate limit. A decode makes a request to NHTSA's free public decoder on our
   * behalf and writes a vehicle row, and a loop over it could get our requests
   * throttled or blocked for every driver. A driver decodes a VIN once per
   * car, so DECODE_RATE_LIMIT an hour leaves room for typos and retries and
   * little else.
   *
   * Charged after authentication, against the caller's own profile — never a
   * vehicle owner named in the request — so nobody can spend someone else's
   * quota. It is charged before the ownership check, so probing other
   * people's vehicle ids spends the prober's own quota. A malformed VIN was
   * refused above without reaching here and costs nothing.
   */
  const { data: allowed, error: rlErr } = await supabase.rpc('consume_rate_limit', {
    p_profile_id: uid,
    p_bucket: 'decode_vin',
    p_limit: DECODE_RATE_LIMIT,
    p_window_s: DECODE_RATE_WINDOW_S,
  });
  // Fail CLOSED, as verify-drive does: a broken limiter must not become an
  // open door to the upstream API. But say what happened — the driver is shown
  // this message, and "too many lookups" would be untrue when the limiter
  // could not be asked at all.
  if (rlErr) {
    return json(
      { error: 'VIN lookup is not available right now. Try again in a few minutes.' },
      503,
      { 'Retry-After': '60' },
    );
  }
  if (allowed === false) {
    return json(
      {
        // Shown to the driver as-is by the app (src/vehicles/specs.ts).
        error: 'Too many VIN lookups in the last hour. Try again later.',
        retry_after_s: DECODE_RATE_WINDOW_S,
      },
      429,
      { 'Retry-After': String(DECODE_RATE_WINDOW_S) },
    );
  }

  // Decoding someone else's vehicle would let one account rewrite another's
  // bracket. This function bypasses RLS, so ownership is checked explicitly.
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, profile_id, is_modified')
    .eq('id', vehicle_id)
    .maybeSingle();
  if (!vehicle) return json({ error: 'vehicle not found' }, 404);
  if (vehicle.profile_id !== uid) return json({ error: 'forbidden' }, 403);

  let row: VpicRow;
  try {
    const res = await fetch(
      `${VPIC}/DecodeVinValues/${encodeURIComponent(parsed.vin)}?format=json`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return json({ error: `vPIC returned ${res.status}` }, 502);
    const body = (await res.json()) as { Results?: VpicRow[] };
    row = body.Results?.[0] ?? {};
  } catch (e) {
    return json({ error: `Could not reach the NHTSA decoder: ${(e as Error).message}` }, 502);
  }

  // vPIC answers for every VIN, including nonsense ones; ErrorCode '0' is a
  // clean decode, and anything else means it could not place the vehicle.
  const errorCode = String(row.ErrorCode ?? '');
  const decodedMake = row.Make ?? null;
  if (!decodedMake) {
    return json(
      {
        error: 'NHTSA could not decode that VIN.',
        detail: row.ErrorText ?? errorCode,
      },
      422,
    );
  }

  const drivetrain = normaliseDriveType(row.DriveType);
  const curbWeightKg = curbWeightKgFromLb(row.CurbWeightLB);
  const factoryPowerHp = powerHpFrom(row.EngineHP);

  // vPIC's coverage of weight and power is patchy — frequently only make,
  // model and drivetrain come back. Partial data is still worth storing: a
  // known drivetrain narrows the bracket even when power-to-weight cannot.
  const { error: updateErr } = await supabase
    .from('vehicles')
    .update({
      make: decodedMake,
      model: row.Model ?? undefined,
      year: row.ModelYear ? Number(row.ModelYear) || null : null,
      drivetrain,
      curb_weight_kg: curbWeightKg,
      factory_power_hp: factoryPowerHp,
      spec_source: 'vin',
      specs_updated_at: new Date().toISOString(),
    })
    .eq('id', vehicle_id);
  // 23514 is the vehicles table refusing what NHTSA sent (0019): a make the
  // denylist covers ('make_not_allowed'), or a make or model over 80
  // characters or holding invisible characters (vehicles_make_text /
  // vehicles_model_text). An answer about this VIN, not a fault to retry, and
  // the app shows `error` as it stands, so it is written for the driver; the
  // database's own words go in `detail`.
  if (updateErr?.code === '23514') {
    return json(
      {
        error: "NHTSA's details for this VIN can't be used, so your class is unchanged.",
        detail: updateErr.message,
      },
      422,
    );
  }
  if (updateErr) return json({ error: updateErr.message }, 500);

  const bracket = bracketKey({
    drivetrain: drivetrain as Drivetrain | null,
    curbWeightKg,
    factoryPowerHp,
    isModified: vehicle.is_modified ?? false,
  });

  return json({
    make: decodedMake,
    model: row.Model ?? null,
    year: row.ModelYear ?? null,
    drivetrain,
    curb_weight_kg: curbWeightKg,
    factory_power_hp: factoryPowerHp,
    bracket_key: bracket,
    // Say what came back empty, so the UI can explain an open-class result
    // instead of leaving the driver wondering why nothing changed.
    missing: [
      drivetrain ? null : 'drivetrain',
      curbWeightKg ? null : 'curb weight',
      factoryPowerHp ? null : 'power',
    ].filter(Boolean),
    check_digit_valid: parsed.checkDigitValid,
  });
});
