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

/**
 * Declared at module scope, not inside the screen.
 *
 * Defined in the render body it was a new component type on every render, so
 * React unmounted and remounted both cards each time — discarding
 * PressableScale's in-flight press animation, which is exactly the tactile
 * feedback this step exists to give.
 */
function CardChoice({
  kind,
  glyph,
  label,
  selected,
  onSelect,
}: {
  kind: 'car' | 'motorbike';
  glyph: string;
  label: string;
  selected: boolean;
  onSelect: (kind: 'car' | 'motorbike') => void;
}) {
  return (
    <PressableScale
      silent
      onPress={() => {
        haptic.selection();
        onSelect(kind);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <Text style={styles.glyph}>{glyph}</Text>
      <Text variant="bodyMedium" style={selected ? { color: color.accent } : undefined}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** 2-up square choice cards — the pattern from the recording's vehicle step. */
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
      <View style={styles.rowWrap}>
        <CardChoice
          kind="car"
          glyph="🚗"
          label="Car"
          selected={vehicleKind === 'car'}
          onSelect={setVehicleKind}
        />
        <CardChoice
          kind="motorbike"
          glyph="🏍️"
          label="Motorbike"
          selected={vehicleKind === 'motorbike'}
          onSelect={setVehicleKind}
        />
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
