import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import countries from '@/data/countries.json';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { SettingsRow, SettingsSection } from '@/components/SettingsRow';
import { Text } from '@/components/Text';
import { clearAll } from '@/drive/wal';
import { haptic } from '@/lib/haptics';
import { EMPTY_PBS, useRecords } from '@/state/records';
import { useProfile } from '@/state/profile';
import { color, space } from '@/theme/tokens';

/** Glyph-tile tints: palette colours at low alpha, plus surface3 for neutral rows. */
const tint = {
  neutral: color.surface3,
  accent: 'rgba(204, 255, 0, 0.16)', // color.accent
  danger: 'rgba(255, 59, 48, 0.18)', // color.danger
} as const;

const VERSION = Constants.expoConfig?.version ?? '0.1.0';

const FLAGS = countries as { code: string; name: string; flag: string }[];

/** SettingsRow presses are silent, so each handler owns its haptic. */
function openURL(url: string): void {
  haptic.press();
  Linking.openURL(url).catch(() => undefined);
}

/**
 * Local-only account wipe: profile, records and every drive held on this
 * device. Server-side deletion is NOT performed here and the confirmation copy
 * must never claim it was.
 *
 * TODO: call the Supabase `delete_account` RPC (and await its success) before
 * clearing local state, once credentials exist.
 */
async function deleteAccount(): Promise<void> {
  clearAll();

  // Reset in memory first, then drop the persisted copy — a pending persist
  // write can only ever re-persist these defaults.
  useProfile.setState({
    onboarded: false,
    unitPref: 'metric',
    country: null,
    vehicleKind: null,
    vehicleMake: null,
    vehicleModel: null,
    username: null,
    safetyAccepted: false,
  });
  useProfile.persist.clearStorage();

  useRecords.setState({ pbs: EMPTY_PBS, driveDays: [] });
  useRecords.persist.clearStorage();
}

export default function SettingsScreen() {
  const router = useRouter();
  const { unitPref, country, setUnitPref } = useProfile();

  const unitLabel = unitPref === 'imperial' ? 'mph' : 'km/h';
  const countryEntry = country ? FLAGS.find((c) => c.code === country) : undefined;
  const countryValue = countryEntry
    ? `${countryEntry.flag} ${countryEntry.code}`
    : (country ?? '—');

  const toggleUnits = () => {
    haptic.selection();
    setUnitPref(unitPref === 'imperial' ? 'metric' : 'imperial');
  };

  const confirmDelete = () => {
    haptic.press();
    // Says exactly what the code does. Anything already uploaded is untouched
    // until the server delete_account RPC exists, so we do not claim it.
    Alert.alert(
      'Delete account?',
      'This erases your profile, records, streaks and every drive recorded on this device. It cannot be undone. Anything already synced to our servers is removed when account sync ships.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAccount()
              .then(() => router.replace('/onboarding'))
              .catch(() => haptic.error());
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </PressableScale>
        <Text variant="cardTitle" style={styles.title}>
          Settings
        </Text>
      </View>

      <SettingsSection title="Preferences">
        <SettingsRow
          glyph="📏"
          tint={tint.accent}
          label="Units"
          value={unitLabel}
          onPress={toggleUnits}
        />
        <SettingsRow glyph="🌍" tint={tint.neutral} label="Country" value={countryValue} />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <SettingsRow glyph="🛡️" tint={tint.accent} label="Private by default" />
        <SettingsRow
          glyph="📍"
          tint={tint.neutral}
          label="Location permission"
          onPress={() => {
            haptic.press();
            Linking.openSettings().catch(() => undefined);
          }}
        />
        <SettingsRow glyph="🚫" tint={tint.neutral} label="No ads, no data resale" />
      </SettingsSection>
      <Text variant="legal" style={styles.note}>
        Drives are recorded on your device. Routes are trimmed near your start and end points
        before a drive is shared or ranked.
      </Text>

      <SettingsSection title="About">
        <SettingsRow glyph="🏁" tint={tint.accent} label="Gapped" value={VERSION} />
        <SettingsRow
          glyph="🔒"
          tint={tint.neutral}
          label="Privacy Policy"
          onPress={() => openURL('https://gapped.app/privacy')}
        />
        <SettingsRow
          glyph="📄"
          tint={tint.neutral}
          label="Terms of Use"
          onPress={() => openURL('https://gapped.app/terms')}
        />
        <SettingsRow
          glyph="💬"
          tint={tint.neutral}
          label="Leave Feedback"
          onPress={() => openURL('mailto:hello@gapped.app?subject=Gapped%20feedback')}
        />
        <SettingsRow
          glyph="✉️"
          tint={tint.neutral}
          label="Contact Us"
          onPress={() => openURL('mailto:hello@gapped.app')}
        />
        <SettingsRow
          glyph="📦"
          tint={tint.neutral}
          label="Acknowledgements"
          onPress={() => openURL('https://gapped.app/acknowledgements')}
        />
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow
          glyph="🗑️"
          tint={tint.danger}
          label="Delete account"
          destructive
          onPress={confirmDelete}
        />
      </SettingsSection>
      <Text variant="legal" style={styles.note}>
        Deletion erases your profile, records, streaks and recorded drives on this device.
        Removing anything already synced to our servers ships with account sync — we won't claim
        it has happened before then.
      </Text>

      <Text variant="legal" style={styles.footer}>
        © 2026 Gapped · Every number in this app is measured, never estimated.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { height: 44, justifyContent: 'center' },
  back: {
    position: 'absolute',
    left: -space.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { fontSize: 30, lineHeight: 34, color: color.text1 },
  title: { textAlign: 'center' },
  note: { marginTop: space.sm },
  footer: { marginTop: space.xxl, textAlign: 'center' },
});
