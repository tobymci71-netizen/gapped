import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { button, color, font } from '@/theme/tokens';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * Primary: full-width pill, acid fill, black label (contrast requires it).
 * Secondary: transparent fill, hairline stroke, white label.
 */
export function Button({ label, onPress, variant = 'primary', disabled, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && {
          backgroundColor: disabled ? color.disabled : pressed ? color.accentPress : color.accent,
        },
        variant === 'secondary' && [
          styles.secondary,
          pressed && { backgroundColor: color.surface2 },
        ],
        variant === 'danger' && {
          backgroundColor: disabled ? color.disabled : color.danger,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === 'primary' && { color: disabled ? color.text3 : color.onAccent },
          variant === 'secondary' && { color: color.text1 },
          variant === 'danger' && { color: color.text1 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: button.height,
    borderRadius: button.height / 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: color.hairline,
  },
  label: {
    fontFamily: font.bodySemibold,
    fontSize: 19,
  },
});
