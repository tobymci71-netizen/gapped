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

const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type VpicRow = Record<string, string | null>;

Deno.serve(async (req) => {
  const { vehicle_id, vin } = await req.json().catch(() => ({}));
  if (!vehicle_id || !vin) return json({ error: 'vehicle_id and vin required' }, 400);

  const parsed = checkVin(String(vin));
  if (!parsed.validFormat || !parsed.vin) {
    return json({ error: parsed.reason ?? 'That does not look like a VIN.' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = await supabase.auth.getUser(token);
  const uid = caller?.user?.id;
  if (!uid) return json({ error: 'unauthenticated' }, 401);

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
