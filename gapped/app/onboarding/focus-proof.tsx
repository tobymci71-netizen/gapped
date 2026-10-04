import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { Text } from '@/components/Text';
import { vehicleNoun } from '@/onboarding/flow';
import { focusProofCopy } from '@/onboarding/place/focusProof';
import { FocusPill, FocusProofVisual, ProofPoints } from '@/onboarding/place/FocusProofVisual';
import { useArrival } from '@/onboarding/place/useArrival';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';
import { space } from '@/theme/tokens';

/**
 * How far this step's headline scales with the text size. The display face is
 * wide, and uncapped at the largest accessibility sizes it broke "Measured,"
 * into "Meas" and "ured," across two lines; at this cap the longest word on
 * any variant still fits a 375pt screen whole. The body copy scales freely.
 */
const HEADLINE_MAX_SCALE = 1.5;

/**
 * Focus proof (docs/ONBOARDING.md, step 9): the answer just given, repeated in
 * a pill, then what Gapped does about it — one variant per focus, each with a
 * visual that animates in once and holds — and the same three marks under
 * every one. Not generic: a screen that said the same thing whatever was
 * picked would make the question before it pointless.
 *
 * The reference's version is a "2.4x faster" bar chart under every answer.
 * There is no study behind a number like that here, so there is no number
 * like that here: each visual shows the mechanism instead, and every figure
 * on it is labelled as a sample.
 */
export default function FocusProofStep() {
  const advance = useOnboardingAdvance('/onboarding/focus-proof');
  // Required by the step before; a deep link that skipped it still gets a
  // whole screen rather than an empty one.
  const focus = useProfile((s) => s.focus) ?? 'topSpeed';
  const kind = useProfile((s) => s.vehicleKind);
  const unitPref = useProfile((s) => s.unitPref);
  const country = useProfile((s) => s.country);
  // The visual grows once the step has stopped sliding in, where it is seen.
  const arrived = useArrival();

  const noun = vehicleNoun(kind);
  const copy = focusProofCopy(focus, noun);

  return (
    <OnboardingFrame
      route="/onboarding/focus-proof"
      footer={<Button label="Continue" variant="light" onPress={advance} />}
    >
      <View style={styles.head}>
        <FocusPill focus={focus} />
        <Text
          variant="headline"
          accessibilityRole="header"
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
          style={styles.center}
        >
          {copy.title}
        </Text>
        <Text variant="body" style={styles.center}>
          {copy.body}
        </Text>
      </View>
      <Entrance index={1} style={styles.visual}>
        <FocusProofVisual focus={focus} context={{ noun, unitPref, country }} play={arrived} />
      </Entrance>
      <Entrance index={2}>
        <ProofPoints />
      </Entrance>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  // The frame's own heading block sits this far down; this step builds its
  // heading itself (the pill comes first), so it keeps the same line.
  head: { marginTop: space.xxl, alignItems: 'center', gap: space.md },
  center: { textAlign: 'center' },
  visual: { marginTop: space.md },
});
