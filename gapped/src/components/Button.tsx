import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StreakArrow } from '@/components/brand/StreakArrow';
import { PressableScale } from '@/components/PressableScale';
import {
  alpha,
  button,
  color,
  font,
  glow,
  italicOverhang,
  maxFontScale,
  radius,
  slant,
  space,
  textStyle,
  type,
} from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'danger' | 'light';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
  /**
   * What VoiceOver says, when the visible label alone would read badly.
   * Defaults to `label`.
   */
  accessibilityLabel?: string;
  /**
   * A glyph drawn after the label — onboarding's "Continue →", a share icon,
   * a PRO chip — given the label's ink so it follows the variant and the
   * disabled state. It is decoration: VoiceOver hears the label, never the
   * glyph, so draw it rather than typing "→" into `label` ("Continue,
   * rightwards arrow"). Replaces the primary button's streak arrow.
   */
  trailing?: (ink: string) => React.ReactNode;
  /**
   * The logo's streak-tip arrow at the right end. On by default for primary
   * (the mockups' "Get started ➤"), off for the rest; pass false for a
   * primary action that does not lead anywhere ("Done", "Add").
   */
  arrow?: boolean;
};

/**
 * Every variant is a parallelogram at the logo's slant: the plate behind the
 * label is skewed, the label is not.
 *
 * Primary: deep-red plate (accentFill → accentFillPress, top to bottom), white
 *   wide-italic label, streak arrow, and the soft red spill under it — the one
 *   button that is a light, so the one that glows.
 * Secondary: outlined plate, white label, no glow.
 * Danger: outlined in danger, danger label. Never a red fill: a destructive
 *   action must not look like the primary one.
 * Light: white plate, ink label — onboarding's Continue. Routine taps should
 *   not spend the red.
 * Disabled (any variant): flat `disabled` plate, text3 label, no glow.
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
  arrow = variant === 'primary',
}: Props) {
  const ink = disabled
    ? color.text3
    : variant === 'primary'
      ? color.onAccent
      : variant === 'light'
        ? color.onLight
        : variant === 'danger'
          ? color.danger
          : color.text1;
  const end = trailing
    ? trailing(ink)
    : arrow
      ? <StreakArrow width={30} height={12} color={ink} />
      : null;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      silent={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.base, end ? styles.withEnd : null, style]}
    >
      <Plate variant={variant} disabled={!!disabled} />
      {/* Beside a trailing glyph or chip the label gives way and wraps, rather
          than pushing both past the plate at the largest text sizes. */}
      <Text
        style={[styles.label, end ? styles.labelBeside : null, { color: ink }]}
        maxFontSizeMultiplier={maxFontScale.button}
      >
        {label}
      </Text>
      {end}
    </PressableScale>
  );
}

/** The skewed shape behind the label, drawn per variant. */
function Plate({ variant, disabled }: { variant: Variant; disabled: boolean }) {
  if (disabled) return <View pointerEvents="none" style={[styles.plate, styles.plateDisabled]} />;
  switch (variant) {
    case 'primary':
      return (
        <View pointerEvents="none" style={[styles.plate, styles.platePrimary]}>
          {/* The fill's top-to-bottom fall, deep red to deeper, inside the
              skewed plate so it skews with it. */}
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="btnFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color.accentFill} />
                <Stop offset="1" stopColor={color.accentFillPress} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" rx={radius.sm} fill="url(#btnFill)" />
          </Svg>
          {/* The lit top edge. */}
          <View style={styles.highlight} />
        </View>
      );
    case 'light':
      return <View pointerEvents="none" style={[styles.plate, styles.plateLight]} />;
    case 'danger':
      return <View pointerEvents="none" style={[styles.plate, styles.plateDanger]} />;
    case 'secondary':
      return <View pointerEvents="none" style={[styles.plate, styles.plateSecondary]} />;
  }
}

const styles = StyleSheet.create({
  base: {
    // minHeight, not height: at accessibility text sizes the label wraps and
    // the plate grows with it. At default scale the padding sums to 56.
    minHeight: button.height,
    paddingVertical: space.md,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  // Label left, glyph right, as the mockups set "Get started ➤".
  withEnd: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingRight: 26 },
  labelBeside: { flexShrink: 1, textAlign: 'left' },
  label: {
    fontFamily: font.display,
    ...textStyle(type.title),
    paddingRight: italicOverhang(type.title.size),
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  plate: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.sm,
    transform: slant.transform,
  },
  platePrimary: {
    backgroundColor: color.accentFill,
    // The red light the button throws on the road beneath it (the mockups'
    // 0 16px 36px -14px spill). No overflow clipping on this plate: it would
    // be free to cut the shadow.
    boxShadow: `0 16px ${glow.wide}px -14px ${alpha(color.accent, 0.75)}`,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: radius.sm,
    right: radius.sm,
    height: 1,
    backgroundColor: alpha(color.accentCore, 0.35),
  },
  plateLight: { backgroundColor: color.text1 },
  plateSecondary: { borderWidth: 1, borderColor: color.outline },
  plateDanger: { borderWidth: 1, borderColor: color.danger },
  plateDisabled: { backgroundColor: color.disabled },
});
