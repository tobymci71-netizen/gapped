import { useFocusEffect, useIsFocused } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { PressableScale } from '@/components/PressableScale';
import { OnSurface, Text } from '@/components/Text';
import { useDriveStore } from '@/drive/recorder';
import { haptic } from '@/lib/haptics';
import { driveLog } from '@/lib/log';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { LocationArrowIcon, PinIcon } from '@/onboarding/place/icons';
import {
  type LastRequest,
  LOCATION_ACTION_LABEL,
  LOCATION_STATUS_LABEL,
  locationAction,
  locationCaption,
  locationStatus,
} from '@/onboarding/place/locationStep';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { duration } from '@/theme/motion';
import { color, radius, space } from '@/theme/tokens';

/**
 * How long the OS's answer — "Allowed" or "Not allowed" — stays on the card
 * before the step moves on by itself. Long enough to see the status change,
 * the answer to the question just asked, and short enough not to feel like
 * waiting. A pause, not a motion, but built from the motion scale so it keeps
 * time with the status's own fade.
 */
const ANSWER_BEAT_MS = duration.slow + duration.base;

/**
 * How far the headline scales with the text size: uncapped, the display face
 * at the largest accessibility sizes is wider per word than the screen and
 * breaks words in half. The copy under it scales freely.
 */
const HEADLINE_MAX_SCALE = 1.5;

/**
 * Location soft ask (docs/ONBOARDING.md, step 7). Explains before the OS
 * dialog appears, never blocks: "Not now" always moves on, because location
 * is needed to record a drive, not to finish onboarding.
 *
 * Whichever way the dialog is answered, the card shows the answer and the
 * step moves on, as the reference does. A refusal is a choice, not a mistake
 * to be corrected here: it gets no error buzz and no stop on this screen, and
 * Back still finds Open Settings waiting.
 *
 * The status on the card is the recorder's own (useDriveStore), not a copy
 * kept here: the same permission recording will use, re-read by the store on
 * every return to the foreground. So it reads Not requested, Allowed or Not
 * allowed truthfully, including after a trip to Settings.
 */
export default function LocationStep() {
  const advance = useOnboardingAdvance('/onboarding/location');
  const requestPermissions = useDriveStore((s) => s.requestPermissions);
  const permission = useDriveStore((s) => s.permission);
  const canAskAgain = useDriveStore((s) => s.canAskAgain);
  /*
   * How the last request ended (locationStep.ts, LastRequest).
   *
   * 'failed': the request threw rather than answered — a phone setting or a
   * platform fault, not a refusal, so it gets "Try again" rather than Open
   * Settings.
   *
   * 'answered': the OS has just answered and the step is about to move on.
   * The footer holds still as Continue meanwhile (a tap skips the wait),
   * rather than flashing "Open Settings" under a refusal for the moment
   * before it leaves.
   */
  const [last, setLast] = useState<LastRequest>('none');
  /*
   * One request at a time. The request spans the foreground dialog, the
   * background dialog and starting the GPS watch — over a second with no
   * dialog showing when iOS waits out an "Allow Once" — and a second tap in
   * that window ran a second request that navigated on its own. A ref rather
   * than disabling the button: on the common path the request resolves in a
   * few milliseconds, and a disabled state would flash the button grey.
   */
  const inFlight = useRef(false);
  /** The pending move-on after the answer lands. */
  const beat = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set by Open Settings; see the effect below ask(). */
  const sentToSettings = useRef(false);

  const action = locationAction({ permission, canAskAgain }, last);
  const status = locationStatus(permission);

  const moveOn = useCallback(() => {
    if (beat.current) clearTimeout(beat.current);
    beat.current = null;
    sentToSettings.current = false;
    advance();
  }, [advance]);

  // Back to this step shows what the permission is now, not the pause before
  // it left. Cleared on the way back in rather than on the way out, so the
  // footer does not change under the step while it slides away.
  useFocusEffect(
    useCallback(() => {
      setLast((l) => (l === 'answered' ? 'none' : l));
    }, []),
  );

  // A pending auto-advance must not fire from a step that has been left by
  // Back. (Continue and Not now go through moveOn, which clears it.)
  useEffect(
    () => () => {
      if (beat.current) clearTimeout(beat.current);
    },
    [],
  );

  const ask = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await requestPermissions();
      // The card now reads Allowed or Not allowed (the store took the answer
      // before resolving); let that land, then carry on either way.
      setLast('answered');
      if (beat.current) clearTimeout(beat.current);
      beat.current = setTimeout(moveOn, ANSWER_BEAT_MS);
    } catch (e) {
      // Uncaught, this left the step with no way forward but Not now, and no
      // word on why nothing happened.
      driveLog('location.request.FAILED', { message: String(e) });
      haptic.error();
      setLast('failed');
    } finally {
      inFlight.current = false;
    }
  }, [requestPermissions, moveOn]);

  /*
   * "Open Settings" sends them out of the app to grant it. When they come
   * back with it granted, carry on as if they had tapped Allow here: the
   * request now resolves without a foreground dialog, asks for background
   * access (which belongs in onboarding) and starts the watch, and the step
   * moves on — rather than leaving them to find Continue.
   *
   * Driven by the store's own re-read on return (recorder.ts syncPermission)
   * rather than a second AppState listener here: two listeners on the same
   * 'active' raced, and when the store's answer landed first it changed the
   * button, tore this step's listener down mid-request and dropped the re-ask.
   *
   * Only after a trip to Settings from this step, and only while it is
   * focused: after Not now it is still mounted under the next step, and must
   * not navigate from there. Once per trip: ask() can itself leave the app
   * again (iOS's "Always" upgrade alert, Android 11+'s background-location
   * page), and coming back from that must not start a second request.
   */
  const focused = useIsFocused();
  useEffect(() => {
    if (permission !== 'granted' || !sentToSettings.current || !focused) return;
    sentToSettings.current = false;
    void ask();
  }, [permission, focused, ask]);

  const primary = () => {
    switch (action) {
      case 'continue':
        return moveOn();
      case 'settings':
        sentToSettings.current = true;
        Linking.openSettings().catch(() => undefined);
        return;
      default:
        return ask();
    }
  };

  return (
    <OnboardingFrame
      route="/onboarding/location"
      footer={
        <View style={styles.footer}>
          <Button
            label={LOCATION_ACTION_LABEL[action]}
            variant="light"
            onPress={primary}
          />
          {action === 'continue' ? null : (
            <PressableScale
              onPress={moveOn}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              accessibilityHint="Continues without location. You can turn it on later."
              style={styles.notNow}
            >
              <Text variant="bodyMedium" style={styles.notNowLabel}>
                Not now
              </Text>
            </PressableScale>
          )}
        </View>
      }
    >
      <View style={styles.hero} importantForAccessibility="no-hide-descendants">
        <Entrance>
          <LocationArrowIcon />
        </Entrance>
      </View>

      <Text variant="headline" accessibilityRole="header" maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        Ready to drive.
      </Text>
      <Text variant="body">Turn on location for speed, distance and your route.</Text>

      <View
        style={styles.card}
        accessible
        accessibilityLabel={`Location, ${LOCATION_STATUS_LABEL[status]}`}
      >
        <OnSurface>
          <PinIcon />
          <Text variant="bodyMedium" style={styles.cardLabel}>
            Location
          </Text>
          <StatusText key={status} label={LOCATION_STATUS_LABEL[status]} on={status === 'allowed'} />
        </OnSurface>
      </View>

      <Text variant="caption">{locationCaption(action)}</Text>
    </OnboardingFrame>
  );
}

/** The card's status, fading in each time it changes. */
function StatusText({ label, on }: { label: string; on: boolean }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.base)}>
      <Text variant="caption" style={on ? styles.statusOn : undefined}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Takes the slack above the copy, so the arrow sits in the open upper part
  // of a tall phone and the words sit low, near the thumb and the buttons. On
  // a 667pt phone it shrinks to its minimum and the copy moves up.
  hero: { flexGrow: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    marginTop: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
  },
  cardLabel: { flex: 1 },
  statusOn: { color: color.accent },
  footer: { gap: space.xs },
  notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  notNowLabel: { color: color.text2 },
});
