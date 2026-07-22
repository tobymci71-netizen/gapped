import React from 'react';
import { StyleSheet } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

export function ChoiceRow({ label, selected, onPress }: Props) {
  return (
    <PressableScale
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      silent
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.row, selected ? styles.selected : null]}
    >
      <Text variant="bodyMedium" style={selected ? { color: color.accent } : undefined}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    borderRadius: radius.card,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  selected: {
    borderColor: color.accent,
    borderWidth: 1.5,
  },
});
