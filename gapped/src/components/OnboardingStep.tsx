import { useIsFocused, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  LayoutAnimation,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { SAFETY_ACKNOWLEDGEMENT } from '@/config/flags';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing } from '@/theme/motion';
import { color, space } from '@/theme/tokens';

/**
 * Steps in onboarding, so the progress bar fills to exactly 100% on the last
 * one. Shrinks by one when the road-legal acknowledgement is switched off,
 * otherwise the bar would stop short of full and look broken.
 */
export const TOTAL_STEPS = SAFETY_ACKNOWLEDGEMENT ? 7 : 6;

type Props = {
  step: number; // 1-based
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
  /** Pass false when the body hosts its own list (FlashList can't nest in a ScrollView). */
  scroll?: boolean;
  /**
   * Give the title and subtitle's space to the body while the keyboard is up.
   *
   * For a body that is a search field over a list. On a 667pt phone the
   * keyboard, the pinned footer and the heading together left the country
   * list 0–20pt tall, so typing filtered results nobody could see. The large
   * title yielding while a search is active is iOS's own search behaviour.
   */
  collapseHeadingWithKeyboard?: boolean;
};

/**
 * Whether the keyboard is up, tracked only when `enabled`.
 *
 * iOS announces the keyboard before it moves (`Will*`), so the change can ride
 * the keyboard's own duration and curve — the same thing KeyboardAvoidingView
 * does for its padding, which lands in the same commit. Android only reports
 * after the fact (`Did*`) with no duration, so there the change is immediate.
 *
 * Tracked even while the step is covered by the next one, so the state is
 * still true when it is uncovered; only the animation waits for `animate`, so
 * a step underneath never arms a LayoutAnimation for the screen on top.
 */
function useKeyboardShown(enabled: boolean, animate: boolean): boolean {
  const [shown, setShown] = useState(() => Keyboard.isVisible());
  const current = useRef(shown);
  useEffect(() => {
    if (!enabled) return;
    const ios = Platform.OS === 'ios';
    const handler = (next: boolean) => (e: KeyboardEvent) => {
      // iOS repeats Will-Show when the keyboard only changes shape. A
      // configured LayoutAnimation waits for the next commit, so arming one
      // with nothing to animate would animate whatever renders next — the
      // list re-filtering on the following keystroke.
      if (next === current.current) return;
      current.current = next;
      if (animate && e.duration > 0) {
        LayoutAnimation.configureNext({
          duration: e.duration,
          update: {
            duration: e.duration,
            type: LayoutAnimation.Types[e.easing] ?? LayoutAnimation.Types.keyboard,
          },
        });
      }
      setShown(next);
    };
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', handler(true)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', handler(false)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [enabled, animate]);
  return enabled && shown;
}

export function OnboardingStep({
  step,
  title,
  subtitle,
  children,
  footer,
  scroll,
  collapseHeadingWithKeyboard = false,
}: Props) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const collapsed = useKeyboardShown(collapseHeadingWithKeyboard, focused && !reduced);

  /**
   * The bar starts where the PREVIOUS step left it and grows to this one.
   *
   * Each step is a separate route, so a static width meant the fill was simply
   * painted at its new length on mount — the one element that should carry
   * continuity across the push was the one that never moved.
   */
  const progress = useSharedValue((step - 1) / TOTAL_STEPS);
  useEffect(() => {
    const target = step / TOTAL_STEPS;
    progress.value = reduced
      ? target
      : withTiming(target, { duration: duration.slow, easing: easing.decel });
  }, [step, reduced, progress]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    // flexGrow lets the body fill the viewport when a step scrolls, as it does
    // when it doesn't: a body can then size itself to the room it has (the
    // vehicle step's circle) and still scroll when the content outgrows it.
    <Screen footer={footer} scroll={scroll} style={styles.fill}>
      {/* Header row: back chevron left of the linear progress track. */}
      <View style={styles.headerRow}>
        <PressableScale
          onPress={() => {
            haptic.press();
            router.back();
          }}
          silent
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </PressableScale>
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${step} of ${TOTAL_STEPS}`}
          accessibilityValue={{ min: 0, max: TOTAL_STEPS, now: step }}
        >
          <Animated.View style={[styles.progressFill, fillStyle]} />
        </View>
      </View>
      {/*
        Collapsed by height rather than unmounted, so the change is a layout
        update that animates with the keyboard instead of a cut. It is one
        native LayoutAnimation on the keyboard's own curve, in the same commit
        as KeyboardAvoidingView's padding — not a height driven frame by frame,
        which is what the design rules forbid for headers. The space has to
        actually go to the list, so translating inside a clip would not do.
      */}
      <View
        style={[styles.heading, collapsed && styles.headingCollapsed]}
        accessibilityElementsHidden={collapsed}
        importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
      >
        <Text variant="headline">{title}</Text>
        {subtitle ? (
          <Text variant="body" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.body}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
  },
  back: {
    // 44×44 is Apple's minimum touch target; this was 32×32.
    width: 44,
    height: 44,
    marginLeft: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { color: color.text1, fontSize: 30, lineHeight: 34 },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.surface2,
  },
  progressFill: {
    height: 6,
    width: '100%',
    borderRadius: 3,
    backgroundColor: color.accent,
    // Scaled, not resized: width cannot be animated on the UI thread.
    transformOrigin: 'left center',
  },
  heading: { marginTop: space.xxl, overflow: 'hidden' },
  headingCollapsed: { marginTop: 0, height: 0 },
  subtitle: { marginTop: space.md },
  body: { flex: 1, marginTop: space.xl, gap: space.md },
});
