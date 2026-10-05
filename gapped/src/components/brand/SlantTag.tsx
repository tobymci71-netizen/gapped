import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import {
  alpha,
  color,
  font,
  maxFontScale,
  radius,
  slant,
  textStyle,
  type,
} from '@/theme/tokens';

export type SlantTagVariant = 'red' | 'white-outline' | 'dark' | 'white';

type Props = {
  label: string;
  /**
   * red: deep-red fill, white text — "You", a lit status. Use sparingly: it is
   *   a light.
   * white-outline: a faint white wash in a white outline — "Verified", "SAMPLE".
   * dark: night panel in a hairline — a quiet chip on a busy hero.
   * white: solid white, ink text — the selected one of a set.
   */
  variant?: SlantTagVariant;
  /** md is 24pt tall (Verified on the drive summary), sm 18pt ("You" in a row). */
  size?: 'sm' | 'md';
  /** A stroke icon before the label (Verified carries 'check'). */
  icon?: IconName;
  /**
   * Hidden from VoiceOver when whatever it sits on already says it (a PRO chip
   * on a control whose label reads "…, Gapped Pro"). Otherwise it is read as
   * its label, or `accessibilityLabel` when given.
   */
  decorative?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const INK: Record<SlantTagVariant, string> = {
  red: color.onAccent,
  'white-outline': color.text1,
  dark: color.text2,
  white: color.onLight,
};

/**
 * A parallelogram tag at the logo's slant. The plate is skewed; the text on it
 * is not. Grows with Dynamic Type up to maxFontScale.chip, as the old chips did.
 */
export function SlantTag({
  label,
  variant = 'white-outline',
  size = 'md',
  icon,
  decorative = false,
  accessibilityLabel,
  style,
}: Props): React.JSX.Element {
  const ink = INK[variant];
  const small = size === 'sm';
  return (
    <View
      style={[styles.tag, small ? styles.sm : styles.md, style]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'text'}
      accessibilityLabel={decorative ? undefined : (accessibilityLabel ?? label)}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.plate, plates[variant]]} />
      {icon ? <Icon name={icon} size={small ? 10 : 12} color={ink} strokeWidth={2.2} /> : null}
      <Text
        style={[styles.label, small ? styles.labelSm : styles.labelMd, { color: ink }]}
        maxFontSizeMultiplier={maxFontScale.chip}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  md: { minHeight: 24, paddingHorizontal: 10, gap: 6 },
  sm: { minHeight: 18, paddingHorizontal: 7, gap: 4 },
  plate: { borderRadius: radius.xs, transform: slant.transform },
  label: { fontFamily: font.bodySemibold },
  labelMd: { ...textStyle(type.small) },
  labelSm: { ...textStyle(type.tiny), fontFamily: font.bodyBold },
});

const plates = StyleSheet.create({
  red: { backgroundColor: color.accentFill },
  'white-outline': {
    backgroundColor: alpha(color.text1, 0.07),
    borderWidth: 1,
    borderColor: alpha(color.text1, 0.22),
  },
  dark: { backgroundColor: alpha(color.canvas, 0.9), borderWidth: 1, borderColor: color.hairline },
  white: { backgroundColor: color.text1 },
});
