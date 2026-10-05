import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Share, StyleSheet, View } from 'react-native';
import { INTERNAL_TOOLS } from '@/config/flags';
import { ACKNOWLEDGEMENTS_URL, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '@/config/links';
import { countryByCode, type CountryCode } from '@/data/countries';
import { GappedMark } from '@/components/brand/GappedMark';
import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { SettingsRow } from '@/components/SettingsRow';
import { Text } from '@/components/Text';
import { sweepExportFiles } from '@/drive/deleteDrive';
import { speedForDisplay } from '@/drive/units';
import { mps } from '@/types/units';
import { useDriveStore } from '@/drive/recorder';
import { clearAll } from '@/drive/wal';
import { haptic } from '@/lib/haptics';
import { ensureUserId, supabase } from '@/lib/supabase';
import { syncIdentity } from '@/lib/sync';
import { useRecords } from '@/state/records';
import { CountrySheet } from '@/onboarding/place/CountrySheet';
import { rearmLocaleUnitDefault } from '@/onboarding/vehicle/deviceUnits';
import { discardVehiclePhoto } from '@/onboarding/vehicle/vehiclePhoto';
import { useProfile } from '@/state/profile';
import { alpha, color, space } from '@/theme/tokens';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** How much of the account id the row shows; the share sheet sends all of it. */
const ACCOUNT_ID_PREVIEW = 8;

/** SettingsRow's metrics (src/components/SettingsRow.tsx): icon box and gap. */
const ROW_ICON = 22;
/** Separators start after the icon, iOS-style, as SettingsSection's do. */
const SEPARATOR_INSET = space.lg + ROW_ICON + space.md;

/**
 * A statement in a settings group: drawn like a SettingsRow without a press,
 * but allowed to wrap. SettingsRow holds its label to one line, which suits a
 * control's name and cuts a sentence off ("Routes never shown to oth…") — and
 * half a privacy promise is not one.
 */
function StatementRow({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.statement} accessible accessibilityLabel={label}>
      <View style={styles.statementIcon}>
        <Icon name={icon} size={ROW_ICON} color={color.text2} />
      </View>
      <Text variant="bodyMedium" style={styles.statementLabel}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A group of rows on one night panel, under a mono heading (a VoiceOver
 * header, so the rotor can jump between groups). Hairlines between the rows,
 * inset past the icons. `danger` gives the panel a faint danger edge: the
 * destructive row stands apart from everything else on the screen.
 */
function Group({
  title,
  danger,
  children,
}: {
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="mono" style={styles.groupTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <Card style={[styles.panel, danger ? styles.panelDanger : null]}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={styles.separator} /> : null}
            {row}
          </View>
        ))}
      </Card>
    </View>
  );
}

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
 * With no backend configured (anonymous, offline-only), or no session ever
 * created on this device, there is nothing on a server to remove and the local
 * wipe is the whole operation.
 *
 * "No session" has to be a clean answer, though. getSession refreshes an
 * expired access token, and when that refresh fails offline it returns
 * `{ session: null, error }` while the session stays stored. Reading that as
 * "no server account" skipped the server delete, wiped the device and reported
 * success — and the next online launch restored the very account the user had
 * just deleted. So an error is a failure like any other: nothing is touched.
 */
async function deleteAccount(): Promise<void> {
  if (supabase) {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
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

  // GPX/CSV exports are deleted once shared, but one whose share was cut off
  // (the app killed with the sheet up) is still in the cache, carrying a full
  // route.
  step('exports', () => {
    sweepExportFiles();
  });

  // The car photo from onboarding is a file the profile only names
  // (Documents/vehicle-photos, kept there so iOS cannot purge it), so reset()
  // forgets the name and leaves the picture. Deleted first, while the profile
  // still says which file it is. discardVehiclePhoto never throws and touches
  // nothing outside that folder.
  step('photo', () => discardVehiclePhoto(useProfile.getState().vehiclePhotoUri));

  // Reset in memory first, then drop the persisted copy — a pending persist
  // write can only ever re-persist first-run defaults. The field list lives on
  // the store (INITIAL) rather than here, so adding a field to the profile
  // cannot leave it surviving a "full" wipe.
  //
  // The guard then lands on onboarding in this same process, so the speed
  // unit's locale default is armed again: reset() put it back to km/h, and the
  // once-per-launch offer was spent on the account that has just gone.
  step('profile', () => {
    useProfile.getState().reset();
    useProfile.persist.clearStorage();
    rearmLocaleUnitDefault();
  });
  step('records', () => {
    useRecords.getState().reset();
    useRecords.persist.clearStorage();
  });
  // The recorder's last finished drive outlives the screens. Left in place,
  // the fresh Drive tab mounted after re-onboarding saw it as new and wrote
  // the deleted account's PB and streak day into the just-reset records.
  // Only the session fields: confirmDelete refuses while a drive is open, so
  // there is no live recording here to tear down.
  step('drive', () => {
    useDriveStore.setState({ lastSummary: null, recovered: [], lastDiscardedAt: null });
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
  const { unitPref, country, setUnitPref, setCountry, debugHud, toggleDebugHud } = useProfile();
  // A deletion can sit for up to ~30 s while auth-js retries a token refresh,
  // with nothing on screen; a second confirm in that window would start a
  // second deletion over the first.
  const [deleting, setDeleting] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  // The id support needs to find an account: there is no email or phone
  // number to look someone up by. Undefined while it is being read, null when
  // it could not be (offline with no usable session).
  const [accountId, setAccountId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    // ensureUserId rather than a bare getSession: it is what every other
    // screen uses to reach the account, and it never throws.
    ensureUserId().then((id) => {
      if (live) setAccountId(id);
    });
    return () => {
      live = false;
    };
  }, []);

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

  // The sheet fires its own selection haptic on a pick.
  const closeCountry = useCallback(() => setCountryOpen(false), []);
  const chooseCountry = useCallback(
    (code: CountryCode) => {
      setCountry(code);
      // The root layout also pushes on a country change; this is the same
      // push, deduplicated in sync.ts, made here so the change does not wait
      // on that subscription to reach the server.
      syncIdentity().catch(() => undefined);
    },
    [setCountry],
  );

  const shareAccountId = () => {
    if (!accountId) return;
    haptic.press();
    Share.share({ message: accountId }).catch(() => undefined);
  };

  const confirmDelete = () => {
    if (deleting) return;
    // Wiping the WAL under an open drive would leave the recorder appending
    // fixes to a row that no longer exists.
    if (useDriveStore.getState().driveId != null) {
      haptic.error();
      Alert.alert(
        'Finish this drive first',
        'A drive is still recording. Stop it, then delete your account.',
      );
      return;
    }
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
            setDeleting(true);
            // No navigation on success: resetting the profile flips the
            // onboarding guard in app/_layout.tsx, which replaces the whole
            // stack with onboarding — nothing left behind it to go back to.
            deleteAccount().catch((e: unknown) => {
              setDeleting(false);
              if (e instanceof LocalWipeError) {
                // The opposite of the case below: the account IS gone, so
                // "nothing was deleted" would be the false statement.
                Alert.alert(
                  'Account deleted',
                  'Your account was deleted, but some data on this device could not be cleared. Deleting and reinstalling the app removes it.',
                );
                return;
              }
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

  // Settings can be the only screen in the stack (opened by a link on a cold
  // start), and back with nothing to go back to is silently dropped.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/drive'));

  return (
    <Screen>
      <View style={styles.header}>
        <PressableScale
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Icon name="chevronLeft" size={24} color={color.text1} strokeWidth={2} />
        </PressableScale>
      </View>
      <Text variant="headline" accessibilityRole="header">
        Settings
      </Text>

      <Group title="Preferences">
        <SettingsRow
          icon="units"
          label="Units"
          value={unitLabel}
          onPress={toggleUnits}
        />
        {/*
          The country picks the national board a driver's runs are ranked on.
          Runs already ranked keep the board they were ranked on; the next
          verified run goes to the new one.
        */}
        <SettingsRow
          icon="globe"
          label="Country"
          value={countryValue}
          onPress={() => {
            haptic.press();
            setCountryOpen(true);
          }}
        />
        {/*
          Shows IMU rate and gravity-removed G on the drive HUD. Development
          builds only (INTERNAL_TOOLS): a TestFlight build is the App Store
          binary, and App Review reads a debug switch as an unfinished app.
          The test-crash row that lived here is gone for the same reason, and
          because no release build has a crash reporter for it to test.
        */}
        {INTERNAL_TOOLS ? (
          <SettingsRow
            icon="chart"
            label="Debug HUD"
            value={debugHud ? 'On' : 'Off'}
            onPress={() => {
              haptic.selection();
              toggleDebugHud();
            }}
          />
        ) : null}
        <SettingsRow
          icon="friends"
          label="Friends"
          onPress={() => {
            haptic.press();
            router.push('/friends');
          }}
        />
      </Group>

      <Group title="Privacy">
        {/*
          Was "Private by default", which the leaderboards make untrue: a
          username, country and run results are public. What is private is the
          route — drives are readable by their owner only (RLS on drives), and
          the boards carry figures, never coordinates.
        */}
        <StatementRow icon="shield" label="Routes never shown to other drivers" />
        <SettingsRow
          icon="location"
          label="Location permission"
          onPress={() => {
            haptic.press();
            Linking.openSettings().catch(() => undefined);
          }}
        />
        <SettingsRow
          icon="hidden"
          label="Hidden drivers"
          onPress={() => {
            haptic.press();
            router.push('/hidden-drivers');
          }}
        />
        {/* A statement, not a control: it wraps rather than being cut off. */}
        <StatementRow icon="noAds" label="No ads, no data resale" />
      </Group>
      {/*
        Says where drives go, on every plan, and what of them is public.
        "Recorded on your device" alone, under Privacy, read as if they stayed
        there; every account's drives upload so the server can verify them
        (src/lib/sync.ts). The second sentence is the share card, which is the
        only picture of a route that leaves the phone, and only when its owner
        sends it.
      */}
      <Text variant="legal" style={styles.note}>
        Drives are recorded on your device and sent to our servers, which verify them before they
        count. A share card you send yourself shows the route trimmed near its start and end.
        Your username, country and run results (top speed, distance, 0-60 and the date) are
        public on the leaderboards.
      </Text>

      {/*
        Every page is a links.ts URL (GitHub Pages). Contact and feedback go
        to the support page rather than an email link: the address is not
        settled, and the page can change without an app release.
      */}
      <Group title="About">
        <SettingsRow icon="driving" label="Gapped" value={VERSION} />
        {supabase ? (
          <SettingsRow
            icon="idCard"
            label="Account ID"
            value={
              accountId
                ? `${accountId.slice(0, ACCOUNT_ID_PREVIEW)}…`
                : accountId === null
                  ? 'Unavailable offline'
                  : '—'
            }
            onPress={accountId ? shareAccountId : undefined}
          />
        ) : null}
        <SettingsRow
          icon="lock"
          label="Privacy Policy"
          onPress={() => openURL(PRIVACY_URL)}
        />
        <SettingsRow
          icon="document"
          label="Terms of Use"
          onPress={() => openURL(TERMS_URL)}
        />
        <SettingsRow
          icon="feedback"
          label="Leave feedback"
          onPress={() => openURL(SUPPORT_URL)}
        />
        <SettingsRow
          icon="mail"
          label="Contact us"
          onPress={() => openURL(SUPPORT_URL)}
        />
        <SettingsRow
          icon="package"
          label="Acknowledgements"
          onPress={() => openURL(ACKNOWLEDGEMENTS_URL)}
        />
      </Group>
      {accountId ? (
        <Text variant="legal" style={styles.note}>
          Tap Account ID to share it. It is how we find your account if you contact us.
        </Text>
      ) : null}

      <Group title="Account">
        <SettingsRow
          icon="pencil"
          label="Change username"
          onPress={() => {
            haptic.press();
            router.push('/edit-username');
          }}
        />
      </Group>

      {/*
        Delete account stands apart, on its own panel with a danger edge, so
        it is never one row down from an everyday control.
      */}
      <Group danger>
        <SettingsRow
          icon="trash"
          label="Delete account"
          value={deleting ? 'Deleting…' : undefined}
          destructive
          onPress={confirmDelete}
        />
      </Group>
      <Text variant="legal" style={styles.note}>
        Deletion erases your profile, records, streaks and recorded drives — on this device and on
        our servers, including any leaderboard entries. If the server cannot be reached, nothing is
        deleted and we say so, rather than wiping this device and leaving the rest behind.
      </Text>
      {/*
        An anonymous account lives in this app's storage and nowhere else a
        person could sign back in from, so uninstalling strands the data
        rather than deleting it. Saying so is the difference between someone
        believing they left and actually having left.
      */}
      <Text variant="legal" style={styles.note}>
        Uninstalling Gapped does not delete your data. Delete your account here first. If you have
        lost access, contact us with your username or Account ID.
      </Text>

      <View style={styles.footer}>
        <GappedMark size="sm" />
        <Text variant="legal" style={styles.footerText}>
          © 2026 Toby Mcintosh · Every number in this app is measured, never estimated.
        </Text>
      </View>

      <CountrySheet
        visible={countryOpen}
        selected={country}
        onSelect={chooseCountry}
        onClose={closeCountry}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 44, justifyContent: 'center' },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.md,
  },
  group: { marginTop: space.xl, gap: space.sm },
  groupTitle: { color: color.text3 },
  // Rows own their padding so separators can run full-bleed from the inset.
  panel: { padding: 0, overflow: 'hidden' },
  panelDanger: { borderColor: alpha(color.danger, 0.35) },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.hairline,
    marginLeft: SEPARATOR_INSET,
  },
  note: { marginTop: space.sm },
  footer: { marginTop: space.xxl, alignItems: 'center', gap: space.md },
  footerText: { textAlign: 'center' },
  // SettingsRow's metrics, so the statement sits in the panel like the rows
  // around it.
  statement: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
  },
  statementIcon: {
    width: ROW_ICON,
    height: ROW_ICON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statementLabel: { flex: 1 },
});
