import { useRouter } from 'expo-router';
import React from 'react';
import { Button } from '@/components/Button';
import { ChoiceRow } from '@/components/ChoiceRow';
import { OnboardingStep } from '@/components/OnboardingStep';
import { useProfile } from '@/state/profile';

export default function VehicleTypeStep() {
  const router = useRouter();
  const { vehicleKind, setVehicleKind } = useProfile();

  return (
    <OnboardingStep
      step={4}
      title="What do you drive?"
      subtitle="Motorbikes are first-class here — neither incumbent supports them."
      footer={
        <Button
          label="Continue"
          disabled={!vehicleKind}
          onPress={() => router.push('/onboarding/vehicle')}
        />
      }
    >
      <ChoiceRow
        label="Car"
        selected={vehicleKind === 'car'}
        onPress={() => setVehicleKind('car')}
      />
      <ChoiceRow
        label="Motorbike"
        selected={vehicleKind === 'motorbike'}
        onPress={() => setVehicleKind('motorbike')}
      />
    </OnboardingStep>
  );
}
