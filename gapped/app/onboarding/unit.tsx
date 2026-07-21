import { useRouter } from 'expo-router';
import React from 'react';
import { Button } from '@/components/Button';
import { ChoiceRow } from '@/components/ChoiceRow';
import { OnboardingStep } from '@/components/OnboardingStep';
import { useProfile } from '@/state/profile';

export default function UnitStep() {
  const router = useRouter();
  const { unitPref, setUnitPref } = useProfile();

  return (
    <OnboardingStep
      step={1}
      title="Choose your unit"
      subtitle="For the speedometer and every stat. Stored once, converted at render — it will never disagree with itself."
      footer={<Button label="Continue" onPress={() => router.push('/onboarding/country')} />}
    >
      <ChoiceRow label="km/h" selected={unitPref === 'metric'} onPress={() => setUnitPref('metric')} />
      <ChoiceRow
        label="mph"
        selected={unitPref === 'imperial'}
        onPress={() => setUnitPref('imperial')}
      />
    </OnboardingStep>
  );
}
