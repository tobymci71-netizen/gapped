import { useRouter } from 'expo-router';
import React from 'react';
import { OnboardingStep } from '@/components/OnboardingStep';
import { VehiclePicker } from '@/components/VehiclePicker';
import { useProfile } from '@/state/profile';

export default function VehicleStep() {
  const router = useRouter();
  const { vehicleKind, setVehicle } = useProfile();

  return (
    <OnboardingStep
      step={5}
      title="Your main ride"
      subtitle={
        vehicleKind === 'motorbike'
          ? 'Every marque, bikes first-class. Search or browse.'
          : 'Search any make — typing “merc” finds Mercedes-Benz.'
      }
      footer={null}
      scroll={false}
    >
      <VehiclePicker
        kind={vehicleKind === 'motorbike' ? 'motorbike' : 'car'}
        onSelect={(make, model) => {
          setVehicle(make, model);
          router.push('/onboarding/username');
        }}
      />
    </OnboardingStep>
  );
}
