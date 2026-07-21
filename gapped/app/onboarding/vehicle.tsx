import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { Button } from '@/components/Button';
import { OnboardingStep } from '@/components/OnboardingStep';
import { useProfile } from '@/state/profile';
import { color, font, radius, space, type } from '@/theme/tokens';

export default function VehicleStep() {
  const router = useRouter();
  const { vehicleMake, vehicleModel, setVehicle } = useProfile();
  const [make, setMake] = useState(vehicleMake ?? '');
  const [model, setModel] = useState(vehicleModel ?? '');

  const canContinue = make.trim().length > 0 && model.trim().length > 0;

  return (
    <OnboardingStep
      step={5}
      title="Your main ride"
      subtitle="Make and model. Later this feeds vehicle-class brackets — fastest stock Miata beats fastest phone."
      footer={
        <Button
          label="Continue"
          disabled={!canContinue}
          onPress={() => {
            setVehicle(make.trim(), model.trim());
            router.push('/onboarding/username');
          }}
        />
      }
    >
      <TextInput
        style={styles.input}
        placeholder="Make (e.g. Volkswagen)"
        placeholderTextColor={color.text3}
        value={make}
        onChangeText={setMake}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        placeholder="Model (e.g. Golf R)"
        placeholderTextColor={color.text3}
        value={model}
        onChangeText={setModel}
        autoCapitalize="words"
        autoCorrect={false}
      />
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 56,
    borderRadius: radius.card,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.lg,
    color: color.text1,
    fontFamily: font.body,
    fontSize: type.body,
  },
});
