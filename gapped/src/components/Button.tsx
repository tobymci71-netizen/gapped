import React from 'react';
import { StyleSheet, Text, ViewStyle } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
import { button, color, font, radius, space, type, textStyle } from '@/theme/tokens';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'light';
  disabled?: boolean;
  style?: ViewStyle;
  /**
   * What VoiceOver says, when the visible label alone would read badly.
   * Defaults to `label`.
   */
  accessibilityLabel?: string;
  /**
   * A glyph drawn after the label — onboarding's "Continue →" — given the
   * label's ink so it follows the variant and the disabled state. It is
   * decoration: VoiceOver hears the label, never the glyph, so draw it rather
   * than typing "→" into `label` ("Continue, rightwards arrow").
   */
  trailing?: (ink: string) => React.ReactNode;
};

/**
 * Primary: full-width pill, acid fill, black label (contrast requires it).
 * Secondary: transparent fill, hairline stroke, white label.
 * Light: white pill, black label — onboarding's primary action. The flow keeps
 *   lime for progress, checks and the one Pro button (docs/ONBOARDING.md), so
 *   a lime Continue on every step would spend the accent on the routine tap.
 *   Disabled matches primary's: `disabled` fill, text3 label.
 * Press: 0.97 scale spring + light haptic via PressableScale.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
  accessibilityLabel,
  trailing,
}: Props) {
  const ink =
    variant === 'primary' || variant === 'light'
      ? disabled
        ? color.text3
        : // onAccent is the canvas black, so the label on white reads 19.8:1.
          color.onAccent
      : color.text1;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      silent={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.base,
        trailing && styles.withTrailing,
        variant === 'primary' && {
          backgroundColor: disabled ? color.disabled : color.accent,
        },
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && {
          backgroundColor: disabled ? color.disabled : color.danger,
        },
        variant === 'light' && {
          backgroundColor: disabled ? color.disabled : color.text1,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: ink }]}>{label}</Text>
      {trailing ? trailing(ink) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    // minHeight, not height: at accessibility text sizes a 19pt label
    // overflowed the fixed 58pt pill. The pill still reads at 58pt at default
    // scale because the padding sums to it.
    minHeight: button.height,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  withTrailing: { flexDirection: 'row', gap: space.sm },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: color.hairline,
  },
  label: {
    fontFamily: font.bodySemibold,
    // Was a literal 19, which is not on the type scale. cardTitle (21) is the
    // nearest token and reads as the CTA size it was approximating.
    ...textStyle(type.body),
    textAlign: 'center',
  },
});
