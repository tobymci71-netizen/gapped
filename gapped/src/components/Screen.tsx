import React, { useId } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { NightBackdrop, type NightBackdropVariant } from '@/components/brand/NightBackdrop';
import { color, gutter, space } from '@/theme/tokens';

/** How far the status bar scrim fades out below the status bar. */
const SCRIM_FADE = 28;
/** Scroll distance over which the scrim comes in. */
const SCRIM_IN = 16;

type Props = {
  children: React.ReactNode;
  /** Scrollable content (default true). Fixed layouts (live drive HUD) pass false. */
  scroll?: boolean;
  style?: ViewStyle;
  /** Pinned below the scroll area, above the home indicator — the fixed-CTA pattern. */
  footer?: React.ReactNode;
  /**
   * The night behind the screen (NightBackdrop). Default 'top': the canvas
   * with a faint sky glow at the top edge, so every screen sits on the same
   * night. 'horizon' for a screen that draws a scene on the horizon, 'plain'
   * for none. The backdrop stays put while the content scrolls.
   */
  backdrop?: NightBackdropVariant;
};

export function Screen({ children, scroll = true, style, footer, backdrop = 'top' }: Props) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const body = scroll ? (
    <Animated.ScrollView
      style={styles.flex}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }, style]}
      showsVerticalScrollIndicator={false}
      // The default ('never') spends the first tap with the keyboard up on
      // dismissing it, so a button beside its field — Decode VIN, Friends' Add
      // — took two taps. 'handled' lets a tap on a control through and still
      // dismisses on a tap on empty space; 'always' would lose the latter.
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </Animated.ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, { paddingTop: insets.top + 12 }, style]}>
      {children}
    </View>
  );

  return (
    // Both onboarding text-entry steps pin their Continue button to the
    // footer, and without this the keyboard covered it while the field it
    // belongs to was focused.
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: color.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <NightBackdrop variant={backdrop} />
      {body}
      {scroll ? <StatusBarScrim height={insets.top} scrollY={scrollY} /> : null}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/**
 * The night drawn back over the status bar once the content scrolls, fading
 * out just below it. Without it, scrolled text ran on under the clock and the
 * battery. Hidden at rest, so the sky glow at the top edge is untouched until
 * something is actually under the status bar.
 */
function StatusBarScrim({ height, scrollY }: { height: number; scrollY: SharedValue<number> }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, SCRIM_IN], [0, 1], 'clamp'),
  }));
  const total = height + SCRIM_FADE;
  if (height <= 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.scrim, { height: total }, fade]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`scrim${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.canvas} stopOpacity={1} />
            <Stop offset={height / total} stopColor={color.canvas} stopOpacity={0.92} />
            <Stop offset="1" stopColor={color.canvas} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#scrim${id})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  flex: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxl },
  // The canvas, so content scrolling under the footer disappears behind it
  // rather than through it. No rule above it: the CTA floats on the night.
  footer: { paddingHorizontal: gutter, paddingTop: space.md, backgroundColor: color.canvas },
});
