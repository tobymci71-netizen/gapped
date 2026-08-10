import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/state/profile';
import { bracketKey, bracketLabel } from '@/vehicles/brackets';
import { decodeVin, fetchPrimaryVehicle, setModified, VehicleSpecs } from '@/vehicles/specs';
import { checkVin } from '@/vehicles/vin';
import { color, radius, space } from '@/theme/tokens';

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Text variant="caption">{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

/**
 * The decoder reports US spelling ("curb weight"); the UI uses "kerb"
 * throughout. Normalised here at the display boundary rather than renaming the
 * database column or the vPIC field, both of which are correctly US-spelled.
 */
function formatMissing(missing: string[]): string {
  const spelled = missing.map((m) => (m === 'curb weight' ? 'kerb weight' : m));
  if (spelled.length <= 1) return spelled.join('');
  return `${spelled.slice(0, -1).join(', ')} or ${spelled[spelled.length - 1]}`;
}

const DRIVETRAIN_LABEL: Record<string, string> = {
  fwd: 'Front-wheel drive',
  rwd: 'Rear-wheel drive',
  awd: 'All-wheel drive',
  '4wd': 'Four-wheel drive',
};

export default function GarageScreen() {
  const { vehicleKind, vehicleMake, vehicleModel, vehicleId } = useProfile();
  const [specs, setSpecs] = useState<VehicleSpecs | null>(null);
  const [loading, setLoading] = useState(false);
  const [vin, setVin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vehicleId || !supabase) return;
    setLoading(true);
    setSpecs(await fetchPrimaryVehicle(vehicleId));
    setLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onDecode = async () => {
    if (!vehicleId) return;
    // Caught here so an obvious typo does not cost a round trip, using the same
    // rules the server applies.
    const parsed = checkVin(vin);
    if (!parsed.validFormat) {
      setError(parsed.reason);
      haptic.error();
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await decodeVin(vehicleId, vin);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      haptic.error();
      return;
    }
    haptic.rankUp();
    setVin('');
    setSpecs(result.specs);
    setNote(
      result.missing.length > 0
        ? `NHTSA had no ${formatMissing(result.missing)} for this VIN, so it stays in the open class until ${result.missing.length === 1 ? 'that is' : 'those are'} known.`
        : null,
    );
  };

  const onToggleModified = async (next: boolean) => {
    if (!vehicleId || !specs) return;
    haptic.selection();
    setSpecs({ ...specs, isModified: next });
    if (!(await setModified(vehicleId, next))) {
      // Reverting silently looked like the switch simply bounced back.
      haptic.error();
      setError('Could not save that change. Check your connection.');
      refresh();
    }
  };

  const name =
    specs?.make && specs.model
      ? `${specs.make} ${specs.model}${specs.year ? ` (${specs.year})` : ''}`
      : vehicleMake && vehicleModel
        ? `${vehicleMake} ${vehicleModel}`
        : null;

  // Shown from the same function the server ranks with, so the class on screen
  // is the class the drive competes in.
  const currentBracket =
    specs && specs.specSource === 'vin'
      ? bracketKey({
          drivetrain: specs.drivetrain,
          curbWeightKg: specs.curbWeightKg,
          factoryPowerHp: specs.factoryPowerHp,
          isModified: specs.isModified,
        })
      : null;

  return (
    <Screen>
      <Text variant="headline">Garage</Text>

      {!name ? (
        <Card style={styles.card}>
          <Text variant="cardTitle">No vehicles yet</Text>
          <Text variant="body">Add your ride during onboarding, or here once editing ships.</Text>
        </Card>
      ) : (
        <>
          <Card style={styles.card}>
            <Text variant="cardTitle" numberOfLines={2}>
              {name}
            </Text>
            <Text variant="caption">
              Primary vehicle{vehicleKind === 'motorbike' ? ' · Motorbike' : ''}
            </Text>

            {loading ? <ActivityIndicator color={color.accent} style={styles.loading} /> : null}

            {specs?.specSource === 'vin' ? (
              <View style={styles.specs}>
                <SpecRow
                  label="Drivetrain"
                  value={specs.drivetrain ? DRIVETRAIN_LABEL[specs.drivetrain] : 'Unknown'}
                />
                <SpecRow
                  label="Power"
                  value={specs.factoryPowerHp ? `${specs.factoryPowerHp} hp` : 'Unknown'}
                />
                <SpecRow
                  label="Kerb weight"
                  value={specs.curbWeightKg ? `${specs.curbWeightKg} kg` : 'Unknown'}
                />
              </View>
            ) : null}
          </Card>

          {currentBracket ? (
            <Card style={styles.card}>
              <Text variant="caption">COMPETING IN</Text>
              <Text variant="cardTitle" style={{ color: color.accent }}>
                {bracketLabel(currentBracket)}
              </Text>
              <View style={styles.modRow}>
                <View style={styles.modLabel}>
                  <Text variant="bodyMedium">Modified</Text>
                  <Text variant="legal">
                    Declaring a mod moves you out of the stock classes. It is taken at your word
                    because it can only ever move you to a harder board, never an easier one.
                  </Text>
                </View>
                <Switch
                  value={specs?.isModified ?? false}
                  onValueChange={onToggleModified}
                  trackColor={{ true: color.accent, false: color.surface3 }}
                  thumbColor={color.text1}
                />
              </View>
            </Card>
          ) : null}

          {!supabase ? (
            <Card style={styles.card}>
              <Text variant="body">
                Vehicle classes need an account — your drives are recording locally in the meantime.
              </Text>
            </Card>
          ) : (
            <Card style={styles.card}>
              <Text variant="cardTitle">
                {specs?.specSource === 'vin' ? 'Update from VIN' : 'Unlock your class'}
              </Text>
              <Text variant="body" style={styles.blurb}>
                Without a VIN every run competes in the open class, against everything. Your VIN is
                decoded by NHTSA on our servers to get drivetrain, power and weight — we never store
                the VIN itself, and we do not accept these figures typed in by hand, because that
                would let anyone pick an easier class.
              </Text>
              <TextInput
                value={vin}
                onChangeText={(t) => {
                  setVin(t.toUpperCase());
                  setError(null);
                }}
                placeholder="17-character VIN"
                placeholderTextColor={color.text3}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={17}
                editable={!busy}
                style={styles.input}
                accessibilityLabel="Vehicle identification number"
              />
              <Button
                label={busy ? 'Decoding…' : 'Decode VIN'}
                onPress={onDecode}
                disabled={busy || vin.trim().length === 0}
                style={styles.decodeBtn}
              />
              {error ? (
                <Text variant="caption" style={{ color: color.danger }}>
                  {error}
                </Text>
              ) : null}
              {note ? <Text variant="caption">{note}</Text> : null}
              <Text variant="legal">Usually on the windscreen base, door jamb, or your V5C.</Text>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.xl, gap: space.xs },
  loading: { marginTop: space.md },
  specs: { marginTop: space.md, gap: space.sm },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
  },
  modLabel: { flex: 1, gap: 2 },
  blurb: { marginTop: space.sm },
  input: {
    marginTop: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
    color: color.text1,
    fontSize: 16,
    letterSpacing: 1,
  },
  decodeBtn: { marginTop: space.md, marginBottom: space.sm },
});
