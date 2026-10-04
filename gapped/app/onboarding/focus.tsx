import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { FOCUS_OPTIONS } from '@/onboarding/flow';
import { FocusRow } from '@/onboarding/place/FocusRow';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';
import { space } from '@/theme/tokens';

/**
 * Your focus (docs/ONBOARDING.md, step 8): four rows, one answer, required.
 * The answer picks the next step's proof and is kept on the profile; it
 * leaves the device only to `onboarding_answers`, which only its owner can
 * read, never the world-readable profile row.
 */
export default function FocusStep() {
  const advance = useOnboardingAdvance('/onboarding/focus');
  const focus = useProfile((s) => s.focus);
  const setFocus = useProfile((s) => s.setFocus);

  return (
    <OnboardingFrame
      route="/onboarding/focus"
      centered
      eyebrow="Your focus"
      title="What matters to your drive?"
      subtitle="Choose what you want to explore after each drive."
      footer={<Button label="Continue" variant="light" disabled={!focus} onPress={advance} />}
    >
      <View accessibilityRole="radiogroup" style={styles.rows}>
        {FOCUS_OPTIONS.map((option, i) => (
          <Entrance key={option.key} index={i}>
            <FocusRow
              option={option}
              selected={focus === option.key}
              onPress={() => setFocus(option.key)}
            />
          </Entrance>
        ))}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  rows: { gap: space.sm },
});
