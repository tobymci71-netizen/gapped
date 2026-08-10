import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { CountryPicker } from '@/components/CountryPicker';
import { OnboardingStep } from '@/components/OnboardingStep';
import { useProfile } from '@/state/profile';
import { space } from '@/theme/tokens';

export default function CountryStep() {
  const router = useRouter();
  const { country, setCountry } = useProfile();

  return (
    <OnboardingStep
      step={2}
      title="Select your country"
      subtitle="This decides which boards you appear on."
      scroll={false}
      footer={
        <Button
          label="Continue"
          disabled={!country}
          onPress={() => router.push('/onboarding/location')}
        />
      }
    >
      <View style={styles.sheetWrap}>
        <CountryPicker selected={country} onSelect={setCountry} />
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, marginHorizontal: -space.xl, marginBottom: -space.xxl },
});
