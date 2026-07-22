import React from 'react';
import { StyleSheet, Text, ViewStyle } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
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
 * Press: 0.97 scale spring + light haptic via PressableScale.
 */
export function Button({ label, onPress, variant = 'primary', disabled, style }: Props) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      silent={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.base,
        variant === 'primary' && {
          backgroundColor: disabled ? color.disabled : color.accent,
        },
        variant === 'secondary' && styles.secondary,
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
          (variant === 'secondary' || variant === 'danger') && { color: color.text1 },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
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
