import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { countryByCode } from '@/data/countries';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { SettingsRow, SettingsSection } from '@/components/SettingsRow';
import { Text } from '@/components/Text';
import { speedForDisplay } from '@/drive/units';
import { mps } from '@/types/units';
import { clearAll } from '@/drive/wal';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useRecords } from '@/state/records';
import { triggerTestCrash } from '@/lib/observability';
import { useProfile } from '@/state/profile';
import { color, space } from '@/theme/tokens';

/** Glyph-tile tints: palette colours at low alpha, plus surface3 for neutral rows. */
const tint = {
  neutral: color.surface3,
  accent: 'rgba(204, 255, 0, 0.16)', // color.accent
  danger: 'rgba(255, 59, 48, 0.18)', // color.danger
} as const;

const VERSION = Constants.expoConfig?.version ?? '0.1.0';


/** SettingsRow presses are silent, so each handler owns its haptic. */
function openURL(url: string): void {
  haptic.press();
  Linking.openURL(url).catch(() => undefined);
}

/**
 * Full account wipe: the server row first, then everything on this device.
 *
 * Order matters and is not an implementation detail. If the server call fails
 * this throws before touching local state, so the user keeps a working account
 * they can delete again later. Wiping locally first would leave their drives
 * on our servers while the app told them the account was gone — the one
 * outcome this flow must never produce.
 *
 * With no backend configured (anonymous, offline-only), there is nothing on a
 * server to remove and the local wipe is the whole operation.
 */
async function deleteAccount(): Promise<void> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { error } = await supabase.rpc('delete_account');
      if (error) throw error;
      await supabase.auth.signOut().catch(() => undefined);
    }
  }

  // Past the server call, the account is already gone. Everything below is
  // local cleanup, and each step is independent — one throwing must not stop
  // the others, or the app is left showing a deleted user's drives.
  const localFailures: string[] = [];
  const step = (name: string, fn: () => void) => {
    try {
      fn();
    } catch {
      localFailures.push(name);
    }
  };

  step('sqlite', clearAll);

  // Reset in memory first, then drop the persisted copy — a pending persist
  // write can only ever re-persist first-run defaults. The field list lives on
  // the store (INITIAL) rather than here, so adding a field to the profile
  // cannot leave it surviving a "full" wipe.
  step('profile', () => {
    useProfile.getState().reset();
    useProfile.persist.clearStorage();
  });
  step('records', () => {
    useRecords.getState().reset();
    useRecords.persist.clearStorage();
  });

  if (localFailures.length > 0) {
    // The account IS deleted; only this device's leftovers remain, and a
    // reinstall clears them. Reported rather than swallowed so the crash
    // reporter sees it.
    throw new LocalWipeError(localFailures);
  }
}

/**
 * Thrown when the server deletion succeeded but local cleanup did not. Distinct
 * from a server failure because the user-facing consequence is the opposite:
 * their account is gone and this device is merely stale.
 */
export class LocalWipeError extends Error {
  constructor(readonly steps: string[]) {
    super(`account deleted, but local cleanup failed: ${steps.join(', ')}`);
    this.name = 'LocalWipeError';
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const { unitPref, country, setUnitPref, debugHud, toggleDebugHud } = useProfile();

  // From units.ts so a unit rename cannot leave this label behind.
  const unitLabel = speedForDisplay(mps(0), unitPref).unit;
  const countryEntry = countryByCode(country);
  const countryValue = countryEntry
    ? `${countryEntry.flag} ${countryEntry.code}`
    : (country ?? '—');

  const toggleUnits = () => {
    haptic.selection();
    setUnitPref(unitPref === 'imperial' ? 'metric' : 'imperial');
  };

  const confirmDelete = () => {
    haptic.press();
    // Says exactly what the code does. delete_account() removes the auth user
    // and every row that cascades from it, verified by pgTAP against an orphan
    // search rather than a row count — so claiming the server half is honest.
    Alert.alert(
      'Delete account?',
      'This erases your profile, records, streaks and every drive — on this device and on our servers, including any leaderboard entries. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAccount()
              .then(() => router.replace('/onboarding'))
              .catch(() => {
                haptic.error();
                // Say plainly that nothing was deleted. A silent failure here
                // reads as success and is exactly how someone ends up
                // believing their data is gone when it is not.
                Alert.alert(
                  'Account not deleted',
                  'We could not reach the server, so nothing was deleted. Check your connection and try again.',
                );
              });
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
        {/*
          Shows IMU rate and gravity-removed G on the drive HUD. Kept in the
          shipping build rather than behind __DEV__ because the thing it
          verifies — adaptive sampling and the gravity fix — only happens in a
          moving vehicle, which is not where a debug build usually is.
        */}
        {/*
          Confirms in one tap that a build reports crashes and that the Hermes
          stack symbolicated. Ships in TestFlight builds deliberately: the thing
          being verified is the release pipeline (source-map upload, dSYMs), and
          a dev build cannot verify it. Hidden behind Debug HUD so an ordinary
          user never meets it.
        */}
        {debugHud ? (
          <SettingsRow
            glyph="💥"
            tint={tint.danger}
            label="Send test crash"
            value="Sentry"
            onPress={() => {
              haptic.press();
              Alert.alert(
                'Send a test crash?',
                'The app will crash on purpose so the report can be checked in Sentry. Nothing is lost — drives are written to disk as they are recorded.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Crash', style: 'destructive', onPress: triggerTestCrash },
                ],
              );
            }}
          />
        ) : null}
        <SettingsRow
          glyph="📈"
          tint={tint.neutral}
          label="Debug HUD"
          value={debugHud ? 'On' : 'Off'}
          onPress={() => {
            haptic.selection();
            toggleDebugHud();
          }}
        />
        <SettingsRow
          glyph="👥"
          tint={tint.neutral}
          label="Friends"
          onPress={() => {
            haptic.press();
            router.push('/friends');
          }}
        />
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
          label="Leave feedback"
          onPress={() => openURL('mailto:hello@gapped.app?subject=Gapped%20feedback')}
        />
        <SettingsRow
          glyph="✉️"
          tint={tint.neutral}
          label="Contact us"
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
        Deletion erases your profile, records, streaks and recorded drives — on this device and on
        our servers, including any leaderboard entries. If the server cannot be reached, nothing is
        deleted and we say so, rather than wiping this device and leaving the rest behind.
      </Text>

      <Text variant="legal" style={styles.footer}>
        © 2026 Gapped · Every number in this app is measured, never estimated.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 44, justifyContent: 'center' },
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
