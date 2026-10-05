import { useFocusEffect, useIsFocused } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Linking, StyleSheet, View } from 'react-native';
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
  advancesOnAnswer,
  type LastRequest,
  LOCATION_ACTION_LABEL,
  LOCATION_NOTE_TEXT,
  LOCATION_STATUS_LABEL,
  locationAction,
  locationCaption,
  locationNote,
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
 * Resolves once no system dialog covers the app. iOS makes the app 'inactive'
 * while a permission dialog is up, and the AppState event reaches JS a beat
 * after the dialog does, so this looks once more after that beat.
 */
async function untilNoSystemDialog(): Promise<void> {
  await new Promise((r) => setTimeout(r, duration.fast));
  if (AppState.currentState === 'active') return;
  await new Promise<void>((resolve) => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      sub.remove();
      resolve();
    });
  });
}

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
 *
 * Background ("Always") is what keeps a drive recording with the screen
 * locked, and iOS asks for it in a second dialog right after the first. The
 * line under the card says what to pick there before the tap and while the
 * dialogs are up (locationNote, 'chooseAlways'). If the answer leaves
 * location on only while Gapped is open, the step stays put and says what
 * that means and how to change it (LOCATION_NOTE_TEXT.screenLock), with Open
 * Settings beside Continue — never a block. Coming back from Settings with
 * Always on moves the step along.
 */
export default function LocationStep() {
  const advance = useOnboardingAdvance('/onboarding/location');
  const requestPermissions = useDriveStore((s) => s.requestPermissions);
  const permission = useDriveStore((s) => s.permission);
  const canAskAgain = useDriveStore((s) => s.canAskAgain);
  const background = useDriveStore((s) => s.backgroundPermission);
  /*
   * How the last request ended (locationStep.ts, LastRequest).
   *
   * 'failed': the request threw rather than answered — a phone setting or a
   * platform fault, not a refusal, so it gets "Try again" rather than Open
   * Settings.
   *
   * 'answered': the OS has just answered and the step is about to move on —
   * or, when the answer leaves location on only while Gapped is open, is
   * waiting on Continue under the screen-lock warning. The footer holds
   * still as Continue meanwhile (a tap skips the wait), rather than flashing
   * "Open Settings" under a refusal for the moment before it leaves.
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
  /*
   * The same request, as state, for the line under the card only: while the
   * dialogs are up it keeps saying what to choose, rather than reading the
   * half-answered permission (foreground in, background not yet) as a
   * warning.
   */
  const [asking, setAsking] = useState(false);
  /** The pending move-on after the answer lands. */
  const beat = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set by Open Settings; see the effect below ask(). */
  const sentToSettings = useRef(false);
  /**
   * Set while the step holds on the screen-lock warning, and by its Open
   * Settings; see the effect below.
   */
  const awaitingAlways = useRef(false);

  const action = locationAction({ permission, canAskAgain }, last);
  const status = locationStatus(permission);
  const note = locationNote({ permission, background }, action, asking);

  const moveOn = useCallback(() => {
    if (beat.current) clearTimeout(beat.current);
    beat.current = null;
    sentToSettings.current = false;
    awaitingAlways.current = false;
    advance();
  }, [advance]);

  /** Shows the answer for a beat, then moves on. */
  const moveOnAfterBeat = useCallback(() => {
    if (beat.current) clearTimeout(beat.current);
    beat.current = setTimeout(moveOn, ANSWER_BEAT_MS);
  }, [moveOn]);

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
    setAsking(true);
    try {
      await requestPermissions();
      // The "Always" request can resolve with its dialog still up (see
      // recorder.ts); moving on beneath it would leave it over "Your focus".
      await untilNoSystemDialog();
      // The card now reads Allowed or Not allowed (the store took both
      // answers before resolving); let that land, then carry on — unless the
      // answer leaves recording cut off at screen lock, which is said and
      // left on screen until Continue.
      setLast('answered');
      const now = useDriveStore.getState();
      const after = locationNote(
        { permission: now.permission, background: now.backgroundPermission },
        'continue',
        false,
      );
      if (advancesOnAnswer(after)) {
        moveOnAfterBeat();
      } else {
        awaitingAlways.current = true;
        AccessibilityInfo.announceForAccessibility(LOCATION_NOTE_TEXT.screenLock);
      }
    } catch (e) {
      // Uncaught, this left the step with no way forward but Not now, and no
      // word on why nothing happened.
      driveLog('location.request.FAILED', { message: String(e) });
      haptic.error();
      setLast('failed');
    } finally {
      inFlight.current = false;
      setAsking(false);
    }
  }, [requestPermissions, moveOnAfterBeat]);

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

  /*
   * Always turns up while the step holds on the screen-lock warning: the
   * warning is answered, so the step does what it would have done had the
   * dialog's answer said so at once — shows it, and moves on. Nothing is
   * asked; the store re-reads background on every return (syncPermission).
   *
   * Two ways here. Back from Settings, after the warning's Open Settings. Or
   * straight after the dialog: expo-location can resolve the Always request
   * before the dialog is answered (its 1.5 s timer; see recorder.ts), so
   * ask() can read the old "While Using" and hold on the warning a moment
   * before the store's re-read on 'active' brings in the Always picked in
   * the dialog.
   */
  useEffect(() => {
    if (background !== 'granted' || !awaitingAlways.current || !focused) return;
    awaitingAlways.current = false;
    setLast('answered');
    moveOnAfterBeat();
  }, [background, focused, moveOnAfterBeat]);

  const openSettingsForAlways = () => {
    awaitingAlways.current = true;
    Linking.openSettings().catch(() => undefined);
  };

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
          {action !== 'continue' ? (
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
          ) : note === 'screenLock' ? (
            <PressableScale
              onPress={openSettingsForAlways}
              accessibilityRole="button"
              accessibilityLabel="Open Settings"
              accessibilityHint="Opens Gapped's settings, where Location can be set to Always."
              style={styles.notNow}
            >
              <Text variant="bodyMedium" style={styles.notNowLabel}>
                Open Settings
              </Text>
            </PressableScale>
          ) : null}
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

      {note ? <NoteText key={note} text={LOCATION_NOTE_TEXT[note]} /> : null}

      <Text variant="caption">{locationCaption(action)}</Text>
    </OnboardingFrame>
  );
}

/**
 * The line about recording with the screen locked, fading in when it changes
 * from what to choose to what the answer means. White rather than the
 * caption's grey: it is the one thing on the step that changes how a drive
 * records.
 */
function NoteText({ text }: { text: string }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.base)}>
      <Text variant="caption" style={styles.note}>
        {text}
      </Text>
    </Animated.View>
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
  note: { color: color.text1 },
  footer: { gap: space.xs },
  notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  notNowLabel: { color: color.text2 },
});
