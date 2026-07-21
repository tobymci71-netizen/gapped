import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { color, radius, space } from '@/theme/tokens';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

export function ChoiceRow({ label, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && { backgroundColor: color.surface3 },
      ]}
    >
      <Text variant="bodyMedium" style={selected ? { color: color.accent } : undefined}>
        {label}
      </Text>
    </Pressable>
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
