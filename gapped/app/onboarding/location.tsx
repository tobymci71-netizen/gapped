import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { OnboardingStep } from '@/components/OnboardingStep';
import { Text } from '@/components/Text';
import { useDriveStore } from '@/drive/recorder';
import { haptic } from '@/lib/haptics';
import { driveLog } from '@/lib/log';
import { color, space } from '@/theme/tokens';

/**
 * Where the last request left this step.
 *
 *   denied  the OS permission was refused
 *   failed  the request threw — on Android, granting permission with device
 *           Location off raises the "turn on location" dialog, and declining
 *           it rejects the request. Different from a refusal: the fix is a
 *           phone setting, not this app's permission.
 */
type Outcome = 'none' | 'denied' | 'failed';

/**
 * Permission priming: always explain BEFORE triggering the OS dialog
 * (spec Phase 8). Honest framing — background access is what makes
 * background recording possible; without it we track foreground-only.
 */
export default function LocationStep() {
  const router = useRouter();
  const requestPermissions = useDriveStore((s) => s.requestPermissions);
  const [outcome, setOutcome] = useState<Outcome>('none');
  /*
   * One request at a time. The request spans the foreground dialog, the
   * background dialog and starting the GPS watch — over a second with no
   * dialog showing when iOS waits out an "Allow Once" — and a second tap in
   * that window ran a second request that navigated on its own. A ref rather
   * than disabling the button: on the common path the request resolves in a
   * few milliseconds, and a disabled state would flash the button grey.
   */
  const inFlight = useRef(false);

  const ask = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const granted = await requestPermissions();
      if (granted) {
        setOutcome('none');
        router.navigate('/onboarding/vehicle-type');
      } else {
        // Every other rejection path in the app fires this.
        haptic.error();
        setOutcome('denied');
      }
    } catch (e) {
      // Uncaught, this left the step with no way forward: no navigation, and
      // the "Continue without location" escape only appeared on a refusal.
      driveLog('location.request.FAILED', { message: String(e) });
      haptic.error();
      setOutcome('failed');
    } finally {
      inFlight.current = false;
    }
  }, [requestPermissions, router]);

  /*
   * "Open Settings" sends them out of the app to grant it. When they come
   * back with it granted, carry on as if they had tapped Allow here — the
   * request now resolves without a dialog (bar the "Always" upgrade, which
   * belongs in onboarding) and starts the watch, rather than leaving the
   * declined copy and a dead Open Settings button on screen.
   *
   * Only while this step is focused: after "Continue without location" it is
   * still mounted under the next step, and must not navigate from there.
   * Only from `denied`: re-asking automatically from `failed` would re-raise
   * Android's location dialog every time it closed.
   *
   * One re-ask per return. ask() can itself leave the app again (iOS's
   * "Always" upgrade alert, Android 11+'s background-location settings page),
   * and the 'active' on the way back from that arrives while this listener is
   * still live. Once the first request had finished it could start a second,
   * which on Android would open that settings page again.
   */
  useFocusEffect(
    useCallback(() => {
      if (outcome !== 'denied') return;
      let armed = true;
      const sub = AppState.addEventListener('change', (state) => {
        if (state !== 'active' || !armed) return;
        Location.getForegroundPermissionsAsync()
          .then(({ status }) => {
            if (!armed) return;
            if (status === 'granted') {
              armed = false;
              return ask();
            }
            // "Ask Next Time" in iOS Settings: the dialog can be shown again,
            // so offer it rather than another trip to Settings.
            if (status === 'undetermined') setOutcome('none');
          })
          .catch(() => undefined);
      });
      return () => {
        armed = false;
        sub.remove();
      };
    }, [outcome, ask]),
  );

  return (
    <OnboardingStep
      step={3}
      title="Location access"
      subtitle={
        'Gapped records your drives from GPS. "Always" access lets a drive keep recording with the screen off or the app in the background — without it we can only track while the app is open.'
      }
      /* Once denied, iOS will not re-present the dialog, so "Enable location"
         is permanently inert. Swap the primary action for the one that can
         actually resolve it; the skip path stays available in the body. */
      footer={
        outcome === 'denied' ? (
          <Button
            label="Open Settings"
            onPress={() => {
              haptic.press();
              Linking.openSettings().catch(() => undefined);
            }}
          />
        ) : (
          <Button
            label={outcome === 'failed' ? 'Try again' : 'Enable location'}
            onPress={ask}
          />
        )
      }
    >
      {/* Icon tile priming beat (the video leads the ask with a big glyph). */}
      <View style={styles.tileWrap}>
        <View style={styles.tile}>
          <Text style={styles.tileGlyph}>➤</Text>
        </View>
      </View>
      {outcome !== 'none' ? (
        <>
          <Text variant="body">
            {outcome === 'denied'
              ? "Location was declined. You can still continue and grant it later from Settings — recording won't work until you do."
              : "Location couldn't be started. Check that Location is turned on for your phone, then try again — or continue and turn it on later. Recording won't work until you do."}
          </Text>
          <Button
            label="Continue without location"
            variant="secondary"
            onPress={() => router.navigate('/onboarding/vehicle-type')}
          />
        </>
      ) : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  tileWrap: { alignItems: 'center', marginTop: space.xl },
  tile: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: color.accentTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlyph: {
    color: color.accent,
    fontSize: 52,
    // Without an explicit lineHeight the glyph is clipped to a sliver before
    // it is even rotated.
    lineHeight: 64,
    textAlign: 'center',
    transform: [{ rotate: '-45deg' }],
  },
});
