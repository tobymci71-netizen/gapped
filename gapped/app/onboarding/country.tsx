import { useRouter } from 'expo-router';
import React from 'react';
import { Button } from '@/components/Button';
import { ChoiceRow } from '@/components/ChoiceRow';
import { OnboardingStep } from '@/components/OnboardingStep';
import { useProfile } from '@/state/profile';

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'GB', name: '🇬🇧 United Kingdom' },
  { code: 'US', name: '🇺🇸 United States' },
  { code: 'DE', name: '🇩🇪 Germany' },
  { code: 'FR', name: '🇫🇷 France' },
  { code: 'NL', name: '🇳🇱 Netherlands' },
  { code: 'ES', name: '🇪🇸 Spain' },
  { code: 'IT', name: '🇮🇹 Italy' },
  { code: 'PL', name: '🇵🇱 Poland' },
  { code: 'SE', name: '🇸🇪 Sweden' },
  { code: 'AU', name: '🇦🇺 Australia' },
  { code: 'CA', name: '🇨🇦 Canada' },
  { code: 'JP', name: '🇯🇵 Japan' },
];

export default function CountryStep() {
  const router = useRouter();
  const { country, setCountry } = useProfile();

  return (
    <OnboardingStep
      step={2}
      title="Select your country"
      subtitle="This decides which leaderboards you appear on."
      footer={
        <Button
          label="Continue"
          disabled={!country}
          onPress={() => router.push('/onboarding/location')}
        />
      }
    >
      {COUNTRIES.map((c) => (
        <ChoiceRow
          key={c.code}
          label={c.name}
          selected={country === c.code}
          onPress={() => setCountry(c.code)}
        />
      ))}
    </OnboardingStep>
  );
}
