import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from '@/components/icons';
import { alpha, color, glow, radius, slant } from '@/theme/tokens';

/**
 * Nightrun's choice rows for onboarding (src/onboarding/ui): every answer is
 * a night panel; the chosen one has a red light along its left edge that
 * spills a little red across the panel, its words turn white, and its mark
 * fills white with a check. The light is the only red on the row, and it is
 * a light, so it is the only thing that glows.
 *
 * Every piece takes `on`, 0 → 1, so a row can crossfade its selection on the
 * UI thread. None of it moves, so it reads the same under Reduce Motion.
 */

/** A night panel: the surface every choice, card and field in onboarding sits on. */
export const panel = {
  backgroundColor: color.surface1,
  borderWidth: 1,
  borderColor: color.hairline,
  borderRadius: radius.card,
} as const;

/** A raised night panel: an input, a pressed row. */
export const raisedPanel = {
  backgroundColor: color.surface2,
  borderWidth: 1,
  borderColor: color.hairline,
  borderRadius: radius.card,
} as const;

/** The light's width, and how far its spill reaches into the row. */
const LIGHT = 3;
const SPILL = 0.55;

/**
 * The selected row's light and its spill: lay it first inside a panel that
 * clips (overflow: hidden), so it sits under the row's content. Without `on`
 * it is simply lit (a row that is always "yours").
 */
export function RowLight({ on }: { on?: SharedValue<number> }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const style = useAnimatedStyle(() => ({ opacity: on ? on.value : 1 }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`spill${id}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color.accent} stopOpacity={0.16} />
            <Stop offset={SPILL} stopColor={color.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#spill${id})`} />
      </Svg>
      <View style={styles.light} />
    </Animated.View>
  );
}

/**
 * A short slanted red light: the mark Nightrun puts before the label of the
 * one live or hero thing on a screen (a step's eyebrow, a live board, an
 * instrument's reading). A light, so it glows; at the logo's lean.
 */
export function SlantLight({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.slantLight, style]} />;
}

/** The mark's diameter. */
export const MARK = 22;

/**
 * A radio's mark: an empty ring at rest, a white disc with a dark check once
 * chosen. White, not red: a check is not a light.
 */
export function ChoiceMark({ on, size = MARK }: { on: SharedValue<number>; size?: number }) {
  const rest = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const chosen = useAnimatedStyle(() => ({ opacity: on.value }));
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={round} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.layer, rest]}>
        <View style={[round, styles.ring]} />
      </Animated.View>
      <Animated.View style={[styles.layer, chosen]}>
        <View style={[round, styles.disc]}>
          <Icon
            name="check"
            size={Math.round(size * 0.64)}
            color={color.onLight}
            strokeWidth={2.4}
          />
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * A checkbox's box, for the consent rows: square, white once ticked. Same
 * family as ChoiceMark, squared off the way a checkbox is.
 */
export function CheckBoxMark({ on, size = 24 }: { on: SharedValue<number>; size?: number }) {
  const rest = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const chosen = useAnimatedStyle(() => ({ opacity: on.value }));
  const box = { width: size, height: size, borderRadius: radius.sm };
  return (
    <View style={box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.layer, rest]}>
        <View style={[box, styles.ring]} />
      </Animated.View>
      <Animated.View style={[styles.layer, chosen]}>
        <View style={[box, styles.disc]}>
          <Icon
            name="check"
            size={Math.round(size * 0.7)}
            color={color.onLight}
            strokeWidth={2.6}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slantLight: {
    width: 14,
    height: 3,
    borderRadius: 1,
    backgroundColor: color.accent,
    transform: slant.transform,
    boxShadow: `0 0 ${glow.tight}px 1px ${alpha(color.accent, 0.8)}`,
  },
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  light: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: LIGHT,
    backgroundColor: color.accent,
    boxShadow: `0 0 ${glow.tight}px 1px ${alpha(color.accent, 0.75)}`,
  },
  // text3, not hairline: the ring is the control's only boundary, and WCAG
  // asks 3:1 of one (hairline is ~1.3:1 on the panel).
  ring: { borderWidth: 1.5, borderColor: color.text3 },
  disc: { backgroundColor: color.text1, alignItems: 'center', justifyContent: 'center' },
});
