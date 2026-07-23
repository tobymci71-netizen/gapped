import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { ChoiceRow } from '@/components/ChoiceRow';
import { OnboardingStep } from '@/components/OnboardingStep';
import { Speedometer } from '@/components/Speedometer';
import { useProfile } from '@/state/profile';
import { space } from '@/theme/tokens';

/** Demo speed shown on the preview dial, in m/s (≈ 68 mph / 109 km/h). */
const PREVIEW_MS = 30.4;

export default function UnitStep() {
  const router = useRouter();
  const { unitPref, setUnitPref } = useProfile();

  const imperial = unitPref === 'imperial';

  return (
    <OnboardingStep
      step={1}
      title="Choose your unit"
      subtitle="For the speedometer and every stat. Stored once, converted at render — it will never disagree with itself."
      footer={<Button label="Continue" onPress={() => router.push('/onboarding/country')} />}
    >
      {/* Live preview: the dial re-renders in the chosen unit immediately. */}
      <View style={styles.dial}>
        <Speedometer
          value={imperial ? PREVIEW_MS * 2.23694 : PREVIEW_MS * 3.6}
          maxValue={imperial ? 160 : 260}
          unit={imperial ? 'mph' : 'km/h'}
          size={220}
          active
        />
      </View>
      <ChoiceRow label="km/h" selected={!imperial} onPress={() => setUnitPref('metric')} />
      <ChoiceRow label="mph" selected={imperial} onPress={() => setUnitPref('imperial')} />
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  dial: { alignItems: 'center', marginBottom: space.sm },
});
