/**
 * Vehicle specs and the bracket they imply.
 *
 * Specs are never sent by the client — drivetrain, weight and power decide
 * which leaderboard bracket a run competes in, so they come back from
 * `decode-vin`, which asks NHTSA and writes them server-side. The client's job
 * is to pass a VIN and render the result.
 */

import { supabase } from '@/lib/supabase';

export type VehicleSpecs = {
  make: string | null;
  model: string | null;
  year: number | null;
  drivetrain: 'fwd' | 'rwd' | 'awd' | '4wd' | null;
  curbWeightKg: number | null;
  factoryPowerHp: number | null;
  specSource: 'vin' | 'declared' | null;
  isModified: boolean;
};

export type DecodeResult =
  | { ok: true; specs: VehicleSpecs; bracketKey: string; missing: string[] }
  | { ok: false; reason: string };

export async function decodeVin(vehicleId: string, vin: string): Promise<DecodeResult> {
  if (!supabase) return { ok: false, reason: 'Decoding a VIN needs an account.' };

  const { data, error } = await supabase.functions.invoke('decode-vin', {
    body: { vehicle_id: vehicleId, vin },
  });

  if (error) {
    // The function returns a human-readable `error` for the cases a driver can
    // act on (bad format, VIN not recognised); surface that rather than a code.
    let message = 'Could not decode that VIN.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = String(body.error);
    } catch {
      /* fall through to the generic message */
    }
    return { ok: false, reason: message };
  }

  return {
    ok: true,
    bracketKey: data.bracket_key,
    missing: data.missing ?? [],
    specs: {
      make: data.make ?? null,
      model: data.model ?? null,
      year: data.year ? Number(data.year) : null,
      drivetrain: data.drivetrain ?? null,
      curbWeightKg: data.curb_weight_kg ?? null,
      factoryPowerHp: data.factory_power_hp ?? null,
      specSource: 'vin',
      isModified: false,
    },
  };
}

export async function fetchPrimaryVehicle(vehicleId: string | null): Promise<VehicleSpecs | null> {
  if (!supabase || !vehicleId) return null;
  const { data, error } = await supabase
    .from('vehicles')
    .select('make, model, year, drivetrain, curb_weight_kg, factory_power_hp, spec_source, is_modified')
    .eq('id', vehicleId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    make: data.make,
    model: data.model,
    year: data.year,
    drivetrain: data.drivetrain,
    curbWeightKg: data.curb_weight_kg,
    factoryPowerHp: data.factory_power_hp,
    specSource: data.spec_source,
    isModified: data.is_modified,
  };
}

/** Self-declared modification. Allowed to be set by the client — unlike specs,
 *  declaring a mod only ever moves you *out* of the stock brackets. */
export async function setModified(vehicleId: string, isModified: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('vehicles')
    .update({ is_modified: isModified })
    .eq('id', vehicleId);
  return !error;
}
