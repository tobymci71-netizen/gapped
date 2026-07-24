import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Button } from '@/components/Button';
import { OnboardingStep } from '@/components/OnboardingStep';
import { VehicleChooser } from '@/components/VehicleChooser';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/state/profile';

export default function VehicleStep() {
  const router = useRouter();
  const { vehicleKind, vehicleMake, vehicleModel, setVehicle } = useProfile();
  const kind = vehicleKind === 'motorbike' ? 'motorbike' : 'car';

  const [make, setMake] = useState<string | null>(vehicleMake);
  const [model, setModel] = useState<string | null>(vehicleModel);

  return (
    <OnboardingStep
      step={5}
      title="Choose your main ride"
      subtitle={
        kind === 'motorbike'
          ? 'Select the bike you ride the most.'
          : 'Select the car you drive the most.'
      }
      scroll={false}
      footer={
        <Button
          label="Continue"
          disabled={!make || !model}
          onPress={() => {
            if (!make || !model) return;
            setVehicle(make, model);
            router.push('/onboarding/username');
          }}
        />
      }
    >
      <VehicleChooser
        kind={kind}
        make={make}
        model={model}
        onMakeChange={setMake}
        onModelChange={(next) => {
          setModel(next || null);
          if (next) haptic.selection();
        }}
      />
    </OnboardingStep>
  );
}
