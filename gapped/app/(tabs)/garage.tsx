import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge, useGoPro } from '@/components/ProBadge';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { bracketsLocked } from '@/board/bracketAccess';
import { SHOW_PRO } from '@/config/flags';
import { SUPPORT_URL } from '@/config/links';
import { modifiedFromBracketKey } from '@/lib/bracket-flag';
import { useAccess } from '@/lib/entitlements';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { syncIdentity } from '@/lib/sync';
import { useProfile } from '@/state/profile';
import { bracketKey, bracketLabel } from '@/vehicles/brackets';
import { decodeVin, fetchPrimaryVehicle, setModified, VehicleSpecs } from '@/vehicles/specs';
import { checkVin } from '@/vehicles/vin';
import { color, radius, space, textStyle, type } from '@/theme/tokens';

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

const OFFLINE = 'Could not reach our servers. Check your connection and try again.';

/**
 * The main vehicle, its class, and the VIN that sets it. Nothing here adds a
 * vehicle yet, so the Free garage limit has nothing to lock on this tab. When
 * garage editing ships here, its add control goes through vehicleAdd()
 * (src/onboarding/vehicle/garageAccess.ts) as onboarding's garage step does:
 * a full Free garage gets the PRO row and keeps every vehicle already in it.
 */
export default function GarageScreen() {
  const { vehicleKind, vehicleMake, vehicleModel, vehicleId, vehicleRefused } = useProfile();
  // The class itself is Free (runs are recorded in it either way); the board
  // that ranks them by class is Pro, so a locked account is told where it is.
  // Never while Pro is hidden (SHOW_PRO): a line that leads to a plan nobody
  // can buy. The two flags are one today, so this only says so out loud.
  const access = useAccess();
  const classBoardLocked = SHOW_PRO && bracketsLocked(access);
  const goPro = useGoPro();
  // Specs are held with the vehicle they describe, so a vehicle change — or
  // the profile reset of an account deletion — cannot leave the previous
  // car's class on screen.
  const [loaded, setLoaded] = useState<{ vehicleId: string; specs: VehicleSpecs } | null>(null);
  const specs = loaded != null && loaded.vehicleId === vehicleId ? loaded.specs : null;
  const [loading, setLoading] = useState(false);
  const [vin, setVin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Bumped by every load and every decode, so a slow load that lands after a
  // decode, or after the vehicle changed, cannot overwrite fresher specs.
  const loadSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (!vehicleId || !supabase) {
      // This call has just superseded any load in flight, which will now never
      // clear the spinner itself.
      setLoading(false);
      return;
    }
    setLoading(true);
    const next = await fetchPrimaryVehicle(vehicleId);
    if (seq !== loadSeq.current) return;
    setLoading(false);
    // fetchPrimaryVehicle answers null for a failed request as well as for a
    // missing row. Decoded specs never un-decode, so null after a good load of
    // the same vehicle is a failed request: keep what is on screen.
    if (next) setLoaded({ vehicleId, specs: next });
  }, [vehicleId]);

  // On every focus, not once per mount: tab screens stay mounted for the life
  // of the process, so a load that failed offline used to leave "Set your
  // class" up until the app was killed.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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
    // decode-vin finds the vehicle by id, so its row has to be on the server
    // first. It used to get there only alongside a drive upload, and a new
    // driver's first decode failed with a bare "vehicle not found".
    const identityOk = await syncIdentity();
    const result = await decodeVin(vehicleId, vin);
    setBusy(false);
    if (!result.ok) {
      // Without the profile on the server, the function's answer can only be
      // "vehicle not found" or "unauthenticated" — true, and no help.
      setError(identityOk ? result.reason : OFFLINE);
      haptic.error();
      return;
    }
    haptic.rankUp();
    setVin('');
    loadSeq.current++;
    setLoading(false);
    // The decode's own specs say isModified: false whatever the server holds;
    // the flag is taken from its bracket key (see bracket-flag.ts), falling
    // back to what is on screen.
    setLoaded((prev) => ({
      vehicleId,
      specs: {
        ...result.specs,
        isModified:
          modifiedFromBracketKey(result.bracketKey) ??
          (prev?.vehicleId === vehicleId ? prev.specs.isModified : false),
      },
    }));
    setNote(
      result.missing.length > 0
        ? `NHTSA had no ${formatMissing(result.missing)} for this VIN, so it stays in the open class until ${result.missing.length === 1 ? 'that is' : 'those are'} known.`
        : null,
    );
  };

  const onToggleModified = async (next: boolean) => {
    if (!vehicleId || !specs) return;
    haptic.selection();
    // A load already in flight may have read the row before this write; it
    // must not land afterwards and flip the switch back.
    loadSeq.current++;
    setLoading(false);
    setLoaded({ vehicleId, specs: { ...specs, isModified: next } });
    if (!(await setModified(vehicleId, next))) {
      // Reverting silently looked like the switch simply bounced back.
      haptic.error();
      setError('Could not save that change. Check your connection.');
      // Put the switch back explicitly: a reload that fails too keeps what
      // is on screen, which would otherwise be the change that did not save.
      setLoaded({ vehicleId, specs });
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

      {/*
        The server refused this car's row (sync.ts, vehicleRefused), so its
        drives cannot upload. Nothing here can rename the main car, so the
        card says what happened, that nothing is lost, and where to ask.
      */}
      {vehicleRefused && name ? (
        <Card style={styles.card}>
          <Text variant="cardTitle">Drives in this car aren&apos;t uploading</Text>
          <Text variant="body">
            Our server didn&apos;t accept this car&apos;s name, &ldquo;{name}&rdquo;, so drives in it
            can&apos;t be uploaded or ranked yet. They are kept on this phone and upload once
            it&apos;s sorted. Contact us and we&apos;ll look at it.
          </Text>
          <Button
            label="Contact us"
            variant="secondary"
            onPress={() => {
              Linking.openURL(SUPPORT_URL).catch(() => undefined);
            }}
            style={styles.decodeBtn}
          />
        </Card>
      ) : null}

      {!name ? (
        // Only for a profile with no make and model, which the ride step does
        // not allow. Nothing here edits a vehicle, so it promises nothing: it
        // used to say "or here once editing ships".
        <Card style={styles.card}>
          <Text variant="cardTitle">No vehicle yet</Text>
          <Text variant="body">
            Your main vehicle is the one chosen during onboarding, and it shows here with its
            class.
          </Text>
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

            {/* Only when there is nothing to show yet: focus reloads are silent. */}
            {loading && !specs ? (
              <ActivityIndicator color={color.accent} style={styles.loading} />
            ) : null}

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
              <Text variant="caption">YOUR CLASS</Text>
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
                {/*
                  Labelled on the switch itself: the "Modified" text beside it
                  is a separate element, so VoiceOver otherwise announced only
                  "switch, off" on the control that moves runs between classes.
                  Held while a decode is in flight, since the decode answers
                  with the server's flag.
                */}
                <Switch
                  value={specs?.isModified ?? false}
                  onValueChange={onToggleModified}
                  disabled={busy}
                  accessibilityLabel="Modified"
                  accessibilityHint="Moves your runs out of the stock classes"
                  trackColor={{ true: color.accent, false: color.surface3 }}
                  thumbColor={color.text1}
                />
              </View>
              {classBoardLocked ? (
                <PressableScale
                  onPress={goPro}
                  accessibilityRole="button"
                  accessibilityLabel="See your class board, Gapped Pro"
                  style={styles.classLock}
                >
                  <Text variant="bodyMedium" style={styles.classLockText}>
                    See your class board
                  </Text>
                  <ProBadge style={styles.classLockBadge} />
                </PressableScale>
              ) : null}
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
                {specs?.specSource === 'vin' ? 'Update from VIN' : 'Set your class'}
              </Text>
              <Text variant="body" style={styles.blurb}>
                Without a VIN, every drive goes in the open class, alongside every other vehicle.
                Your VIN is decoded by NHTSA on our servers to get drivetrain, power and weight — we
                never store the VIN itself, and we do not accept these figures typed in by hand,
                because that would let anyone pick a class that is not theirs.
              </Text>
              <TextInput
                value={vin}
                onChangeText={(t) => {
                  setVin(t.toUpperCase());
                  setError(null);
                }}
                placeholder="17-character VIN"
                placeholderTextColor={color.text2}
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
  classLock: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  classLockText: { flexShrink: 1 },
  classLockBadge: { alignSelf: 'center' },
  input: {
    marginTop: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
    color: color.text1,
    ...textStyle(type.body),
    letterSpacing: 1,
  },
  decodeBtn: { marginTop: space.md, marginBottom: space.sm },
});
