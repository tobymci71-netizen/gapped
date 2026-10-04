import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { progressFor, TOTAL_PROGRESS_STEPS, type OnboardingRoute } from '@/onboarding/flow';
import { duration, easing } from '@/theme/motion';
import { color, font, space } from '@/theme/tokens';

/** The progress bar's height: a hairline that reads as chrome, not content. */
const PROGRESS_HEIGHT = 3;

/**
 * How far the title grows with Dynamic Type. The display face is wide, and
 * uncapped at the largest accessibility sizes (about 3x) it broke words in
 * half — "What matters to your drive?" and "Thanks for trusting us." among
 * them. 1.5x is the cap the steps that draw their own headline already use
 * (focus-proof, location, setup); the subtitle and body scale freely.
 */
const TITLE_MAX_SCALE = 1.5;

type Props = {
  /**
   * This step's route. The progress position comes from the flow registry
   * (src/onboarding/flow.ts), never from the screen, so no step can disagree
   * with the order about where it sits.
   */
  route: OnboardingRoute;
  /** Small lime capitals above the title ("YOUR FOCUS"). */
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** Centre the heading block. Steps built around one big object use it. */
  centered?: boolean;
  children?: React.ReactNode;
  /** Pinned under the body, above the home indicator. */
  footer?: React.ReactNode;
  /** Pass false when the body hosts its own list (FlashList can't nest in a ScrollView). */
  scroll?: boolean;
  /**
   * Whether to show the back chevron. Defaults to showing it wherever the
   * progress bar shows, and hiding it where the bar is hidden (the carousel,
   * setup, the paywall): those steps are either the start or past the point
   * of going back.
   */
  back?: boolean;
  /** Replaces the default `router.back()`, e.g. to close a sheet first. */
  onBack?: () => void;
};

/**
 * The bar under the flow: grey track, lime fill.
 *
 * The fill starts where the PREVIOUS step left it and grows to this one. Each
 * step is its own route, so a static width would simply be painted at its new
 * length on mount — the one element that should carry continuity across the
 * push would be the one that never moved. It only ever grows: Back uncovers
 * the earlier step's own, already-settled bar rather than shrinking this one.
 */
function ProgressBar({ step }: { step: number }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(Math.max(0, step - 1) / TOTAL_PROGRESS_STEPS);
  useEffect(() => {
    const target = step / TOTAL_PROGRESS_STEPS;
    progress.value = reduced
      ? target
      : withTiming(target, { duration: duration.slow, easing: easing.decel });
  }, [step, reduced, progress]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    <View
      style={styles.progressTrack}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${TOTAL_PROGRESS_STEPS}`}
      accessibilityValue={{ min: 0, max: TOTAL_PROGRESS_STEPS, now: step }}
    >
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

/**
 * A chevron drawn rather than typed. The "‹" character this replaced sat on a
 * font's baseline, so it needed a hand-tuned size and line height to be
 * centred, and still rendered thinner than the SF Symbol it stood in for.
 */
function Chevron() {
  return (
    <Svg width={12} height={20} viewBox="0 0 12 20">
      <Path
        d="M10 2 L2 10 L10 18"
        stroke={color.text1}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * Chrome for every onboarding step: back chevron (no word "Back") and the 3pt
 * progress bar, then an optional eyebrow, title and subtitle, a scrolling body
 * and a pinned footer. docs/ONBOARDING.md is the contract for what goes in it.
 *
 * The body scrolls by default, so a step works at 375×667 and at the largest
 * Dynamic Type sizes without the footer covering its last control.
 */
export function OnboardingFrame({
  route,
  eyebrow,
  title,
  subtitle,
  centered = false,
  children,
  footer,
  scroll,
  back,
  onBack,
}: Props) {
  const router = useRouter();

  const step = progressFor(route);
  const showBack = back ?? step !== null;
  const hasHeading = !!(eyebrow || title || subtitle);

  return (
    // flexGrow lets the body fill the viewport when a step scrolls, as it does
    // when it doesn't: a body can then size itself to the room it has and
    // still scroll when the content outgrows it.
    <Screen footer={footer} scroll={scroll} style={styles.fill}>
      {showBack || step !== null ? (
        <View style={styles.headerRow}>
          {showBack ? (
            <PressableScale
              onPress={() => {
                haptic.press();
                if (onBack) onBack();
                else router.back();
              }}
              silent
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.back}
            >
              <Chevron />
            </PressableScale>
          ) : null}
          {step !== null ? <ProgressBar step={step} /> : null}
        </View>
      ) : null}
      {hasHeading ? (
        <View style={[styles.heading, centered && styles.headingCentered]}>
          {eyebrow ? (
            <Text variant="caption" style={[styles.eyebrow, centered && styles.centerText]}>
              {eyebrow}
            </Text>
          ) : null}
          {title ? (
            <Text
              variant="headline"
              accessibilityRole="header"
              maxFontSizeMultiplier={TITLE_MAX_SCALE}
              style={centered ? styles.centerText : undefined}
            >
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="body" style={[styles.subtitle, centered && styles.centerText]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.body, !hasHeading && styles.bodyNoHeading]}>{children}</View>
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
    // Holds the row's height when only the bar shows, so the heading below
    // sits at the same place on every step.
    minHeight: 44,
  },
  back: {
    // 44×44 is Apple's minimum touch target. Pulled into the gutter so the
    // chevron, not the invisible box around it, lines up with the content.
    width: 44,
    height: 44,
    marginLeft: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    flex: 1,
    height: PROGRESS_HEIGHT,
    borderRadius: PROGRESS_HEIGHT / 2,
    // hairline, not a surface: at 3pt a surface grey all but vanishes into
    // the canvas, and the remaining length is half of what the bar says.
    backgroundColor: color.hairline,
    overflow: 'hidden',
  },
  progressFill: {
    height: PROGRESS_HEIGHT,
    width: '100%',
    borderRadius: PROGRESS_HEIGHT / 2,
    backgroundColor: color.accent,
    // Scaled, not resized: width cannot be animated on the UI thread.
    transformOrigin: 'left center',
  },
  heading: { marginTop: space.xxl },
  headingCentered: { alignItems: 'center' },
  eyebrow: {
    color: color.accent,
    fontFamily: font.bodySemibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: space.sm,
  },
  centerText: { textAlign: 'center' },
  subtitle: { marginTop: space.md },
  body: { flex: 1, marginTop: space.xl, gap: space.md },
  bodyNoHeading: { marginTop: 0 },
});
