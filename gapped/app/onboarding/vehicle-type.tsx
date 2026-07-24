import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { OnboardingStep } from '@/components/OnboardingStep';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/state/profile';
import { color, radius, space } from '@/theme/tokens';

/** 2-up square choice cards — the pattern from the recording's vehicle step. */
export default function VehicleTypeStep() {
  const router = useRouter();
  const { vehicleKind, setVehicleKind } = useProfile();

  const CardChoice = ({
    kind,
    glyph,
    label,
  }: {
    kind: 'car' | 'motorbike';
    glyph: string;
    label: string;
  }) => (
    <PressableScale
      silent
      onPress={() => {
        haptic.selection();
        setVehicleKind(kind);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: vehicleKind === kind }}
      style={[styles.card, vehicleKind === kind && styles.cardSelected]}
    >
      <Text style={styles.glyph}>{glyph}</Text>
      <Text
        variant="bodyMedium"
        style={vehicleKind === kind ? { color: color.accent } : undefined}
      >
        {label}
      </Text>
    </PressableScale>
  );

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
      <View style={styles.rowWrap}>
        <CardChoice kind="car" glyph="🚗" label="Car" />
        <CardChoice kind="motorbike" glyph="🏍️" label="Motorbike" />
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  rowWrap: { flexDirection: 'row', gap: space.md },
  card: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.card + 8,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  cardSelected: {
    borderColor: color.accent,
    borderWidth: 1.5,
  },
  glyph: { fontSize: 56 },
});
