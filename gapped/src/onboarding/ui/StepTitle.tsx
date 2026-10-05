import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { color, font, space } from '@/theme/tokens';
import { SlantLight } from './choice';

/**
 * How far a step's title grows with Dynamic Type. The wide face is a quarter
 * wider than body text, and uncapped at the largest accessibility sizes it
 * broke words in half ("What matters to your drive?", "Thanks for trusting
 * us."); the subtitle and body scale freely.
 */
export const TITLE_MAX_SCALE = 1.5;

/**
 * The small label over a title ("Your focus"), as Nightrun sets a label over
 * a figure: a short slanted red light, then the words in mono, sentence case.
 * The light marks the one thing the screen is about.
 */
export function Eyebrow({ label, centered = false }: { label: string; centered?: boolean }) {
  return (
    <View style={[styles.eyebrow, centered && styles.eyebrowCentred]}>
      <SlantLight />
      <Text variant="mono" style={styles.eyebrowText}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A step's heading: optional eyebrow, the title in the wide italic (a
 * VoiceOver header), and the line under it in soft body text. Shared by
 * OnboardingFrame and the steps that scroll their own heading (StepScroll),
 * so the two cannot drift apart.
 */
export function StepTitle({
  eyebrow,
  title,
  subtitle,
  centered = false,
  style,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[centered && styles.centred, style]}>
      {eyebrow ? <Eyebrow label={eyebrow} centered={centered} /> : null}
      {title ? (
        <Text
          variant="headline"
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_SCALE}
          lineBreakStrategyIOS="push-out"
          style={centered ? styles.centerText : undefined}
        >
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          variant="callout"
          lineBreakStrategyIOS="push-out"
          style={[styles.subtitle, centered && styles.centerText]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A text link with a 44pt target: white, semibold and underlined. Not red:
 * red is light, and a link is not one; the underline is what says "link" to
 * anyone, whatever colours they see.
 */
export function NightLink({
  label,
  onPress,
  role = 'link',
  hint,
  align = 'center',
  style,
}: {
  label: string;
  onPress: () => void;
  /** 'button' for an in-app action that reads as a link ("Not listed? Add it yourself"). */
  role?: 'link' | 'button';
  hint?: string;
  align?: 'center' | 'left';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      silent
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={[styles.link, align === 'center' ? styles.linkCentred : null, style]}
    >
      <Text variant="caption" style={[styles.linkText, align === 'center' && styles.centerText]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  centred: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  subtitle: { marginTop: space.sm },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  eyebrowCentred: { alignSelf: 'center' },
  eyebrowText: { color: color.text2 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md },
  linkCentred: { alignSelf: 'center' },
  linkText: {
    color: color.text1,
    fontFamily: font.bodySemibold,
    textDecorationLine: 'underline',
  },
});
