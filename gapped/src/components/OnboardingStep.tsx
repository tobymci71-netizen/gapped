import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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
};

export function OnboardingStep({ step, title, subtitle, children, footer, scroll }: Props) {
  const router = useRouter();
  const reduced = useReducedMotion();

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
    <Screen footer={footer} scroll={scroll}>
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
      <Text variant="headline" style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      <View style={styles.body}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  title: { marginTop: space.xxl },
  subtitle: { marginTop: space.md },
  body: { flex: 1, marginTop: space.xl, gap: space.md },
});
