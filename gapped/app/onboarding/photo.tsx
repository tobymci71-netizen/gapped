import React, { useRef, useState } from 'react';
import { AccessibilityInfo, Linking, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { vehicleNoun } from '@/onboarding/flow';
import { panel } from '@/onboarding/ui/choice';
import { NightLink } from '@/onboarding/ui/StepTitle';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { vehicleTitle } from '@/onboarding/vehicle/draft';
import { pickVehiclePhoto, type PickOutcome } from '@/onboarding/vehicle/pickPhoto';
import { VehicleArt } from '@/onboarding/vehicle/VehicleArt';
import { discardVehiclePhoto } from '@/onboarding/vehicle/vehiclePhoto';
import { useProfile } from '@/state/profile';
import { duration } from '@/theme/motion';
import { color, gutter, space } from '@/theme/tokens';

type Problem = Exclude<PickOutcome['kind'], 'picked' | 'canceled'>;

/** What to say when a pick did not produce a photo. Never "error". */
const PROBLEM_COPY: Record<Problem, string> = {
  denied: 'Gapped can’t see your photos. Allow access in Settings to add one.',
  failed: 'Your photos didn’t open. Try again.',
  unavailable: 'Adding a photo needs the latest version of Gapped.',
};

/**
 * Step 4, "Add a car photo" (docs/ONBOARDING.md). A library pick replaces the
 * illustration, or the illustration stays. Optional either way.
 *
 * Before a pick: Add photo (the white plate), Keep current image (the
 * outlined plate, which moves on). After: the photo takes the render's place in the same frame
 * and Continue appears, with "Choose another" beside it and a link back to
 * the illustration.
 *
 * The photo is copied into the app's Documents (./vehiclePhoto explains why)
 * and its URI stored as `vehiclePhotoUri`; replacing or removing one deletes
 * the old copy, so a person trying three photos does not leave two behind.
 */
export default function PhotoStep() {
  const advance = useOnboardingAdvance('/onboarding/photo');
  const kind = useProfile((s) => s.vehicleKind) ?? 'car';
  const make = useProfile((s) => s.vehicleMake);
  const model = useProfile((s) => s.vehicleModel);
  const nickname = useProfile((s) => s.nickname);
  const photoUri = useProfile((s) => s.vehiclePhotoUri);
  const setVehiclePhotoUri = useProfile((s) => s.setVehiclePhotoUri);
  const noun = vehicleNoun(kind);
  const { title } = vehicleTitle({ nickname, make, model });

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // The guard itself, beside the state that greys the pills: `busy` is read
  // from the render that drew the button, so a second tap landing before
  // that re-render would launch the picker again while the first was still
  // presenting, and whatever the second launch reported would be printed
  // under the picker the person was actually using.
  const picking = useRef(false);

  const { width, height } = useWindowDimensions();
  // The stage gives way to the two pinned pills on a short screen.
  const stage = Math.round(Math.min(width - gutter * 2, 300, height * 0.36));

  const pick = async () => {
    if (picking.current) return;
    picking.current = true;
    setBusy(true);
    setProblem(null);
    let outcome: PickOutcome;
    try {
      outcome = await pickVehiclePhoto();
    } catch {
      // pickVehiclePhoto resolves every failure it knows of; anything else
      // still lands as a line on the screen, never as an unhandled rejection.
      outcome = { kind: 'failed' };
    } finally {
      picking.current = false;
      setBusy(false);
    }
    if (outcome.kind === 'picked') {
      const previous = useProfile.getState().vehiclePhotoUri;
      setVehiclePhotoUri(outcome.uri);
      if (previous !== outcome.uri) discardVehiclePhoto(previous);
      haptic.selection();
    } else if (outcome.kind !== 'canceled') {
      setProblem(outcome.kind);
      // accessibilityLiveRegion below is Android's; iOS has to be told.
      AccessibilityInfo.announceForAccessibility(PROBLEM_COPY[outcome.kind]);
    }
  };

  const openSettings = () => {
    // Rejects only where there is no Settings page to open; the line above
    // the link already says what to do.
    Linking.openSettings().catch(() => undefined);
  };

  const keepIllustration = () => {
    const previous = photoUri;
    setVehiclePhotoUri(null);
    discardVehiclePhoto(previous);
  };

  return (
    <OnboardingFrame
      route="/onboarding/photo"
      centered
      title={`Add a ${noun} photo`}
      subtitle="Make it yours, or keep the illustration."
      footer={
        <View style={styles.footer}>
          {photoUri ? (
            <>
              <Button label="Continue" variant="light" disabled={busy} onPress={advance} />
              <Button label="Choose another" variant="secondary" disabled={busy} onPress={pick} />
            </>
          ) : (
            <>
              <Button label="Add photo" variant="light" disabled={busy} onPress={pick} />
              <Button
                label="Keep current image"
                variant="secondary"
                disabled={busy}
                onPress={advance}
              />
            </>
          )}
        </View>
      }
    >
      <View style={styles.body}>
        <View
          style={[styles.stage, { width: stage, height: stage }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${photoUri ? 'Photo' : 'Illustration'} of your ${noun}, ${title}`}
        >
          <VehicleArt
            kind={kind}
            make={make}
            model={model}
            photoUri={photoUri}
            size={stage}
            shape="square"
          />
        </View>

        {problem ? (
          <Animated.View
            entering={FadeIn.duration(duration.base)}
            exiting={FadeOut.duration(duration.fast)}
            style={styles.problem}
            accessibilityLiveRegion="polite"
          >
            <Text variant="caption" style={styles.problemText}>
              {PROBLEM_COPY[problem]}
            </Text>
            {problem === 'denied' ? (
              <NightLink label="Open Settings" onPress={openSettings} />
            ) : null}
          </Animated.View>
        ) : photoUri ? (
          <NightLink label="Use the illustration instead" role="button" onPress={keepIllustration} />
        ) : (
          <Text variant="caption" style={styles.caption} numberOfLines={2}>
            {title}
          </Text>
        )}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  // The photo's slot, drawn even while it holds the illustration, so the
  // person can see where their photo will go before they pick one.
  stage: {
    ...panel,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { textAlign: 'center' },
  problem: { alignItems: 'center', gap: space.xs, paddingHorizontal: space.md },
  problemText: { color: color.warning, textAlign: 'center' },
  footer: { gap: space.sm },
});
