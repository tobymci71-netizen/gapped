import { useRouter } from 'expo-router';
import React, { useEffect, useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { progressFor, TOTAL_PROGRESS_STEPS, type OnboardingRoute } from '@/onboarding/flow';
import { StepTitle } from '@/onboarding/ui/StepTitle';
import { duration, easing } from '@/theme/motion';
import { alpha, color, glow, slant, space } from '@/theme/tokens';

/** The track: a hairline, chrome rather than content. */
const TRACK = 1;
/** The lit stretch, a touch heavier than the track it runs along. */
const FILL = 2;
/** The light at the head of the line. */
const HEAD = { width: 14, height: 3 } as const;

type Props = {
  /**
   * This step's route. The progress position comes from the flow registry
   * (src/onboarding/flow.ts), never from the screen, so no step can disagree
   * with the order about where it sits.
   */
  route: OnboardingRoute;
  /** The label over the title ("Your focus"), set in mono after a small red light. */
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
 * The flow's progress: a thin line across the night with a red light at its
 * head, the way a route trail ends in the car's own tail light.
 *
 * The light starts where the PREVIOUS step left it and travels to this one.
 * Each step is its own route, so a static length would simply be painted at
 * its new length on mount — the one element that should carry continuity
 * across the push would be the one that never moved. It only ever goes
 * forward: Back uncovers the earlier step's own, already-settled line rather
 * than pulling this one back.
 */
function ProgressLine({ step }: { step: number }) {
  const reduced = useReducedMotion();
  const gradientId = `onbTrail${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(Math.max(0, step - 1) / TOTAL_PROGRESS_STEPS);
  useEffect(() => {
    const target = step / TOTAL_PROGRESS_STEPS;
    progress.value = reduced
      ? target
      : withTiming(target, { duration: duration.slow, easing: easing.decel });
  }, [step, reduced, progress]);

  // Scaled, not resized: width cannot be animated on the UI thread. The
  // gradient scales with it, so the head is always the brightest point.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  // Clamped to the track: on the first step the trail is shorter than the
  // light, which would otherwise hang off the line's start, into the gap by
  // the back chevron.
  const headStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.max(0, progress.value * width - HEAD.width) },
      ...slant.transform,
    ],
  }));

  return (
    <View
      style={styles.progress}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${TOTAL_PROGRESS_STEPS}`}
      accessibilityValue={{ min: 0, max: TOTAL_PROGRESS_STEPS, now: step }}
    >
      <View style={styles.track} />
      <Animated.View style={[styles.trail, fillStyle]}>
        <Svg width="100%" height={FILL}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={color.accent} stopOpacity={0.1} />
              <Stop offset="0.7" stopColor={color.accent} stopOpacity={0.55} />
              <Stop offset="1" stopColor={color.accentHot} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={FILL} fill={`url(#${gradientId})`} />
        </Svg>
      </Animated.View>
      {width > 0 ? <Animated.View style={[styles.head, headStyle]} /> : null}
    </View>
  );
}

/**
 * Chrome for every onboarding step: back chevron (no word "Back") and the
 * progress line, then an optional eyebrow, title and subtitle (StepTitle), a
 * scrolling body and a pinned footer, all on the night. docs/ONBOARDING.md is
 * the contract for what goes in it.
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
              <Icon name="chevronLeft" size={24} color={color.text1} strokeWidth={2} />
            </PressableScale>
          ) : null}
          {step !== null ? <ProgressLine step={step} /> : null}
        </View>
      ) : null}
      {hasHeading ? (
        <StepTitle
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          centered={centered}
          style={styles.heading}
        />
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
  progress: { flex: 1, height: HEAD.height + glow.tight * 2, justifyContent: 'center' },
  track: { height: TRACK, backgroundColor: color.hairline },
  trail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: FILL,
    transformOrigin: 'left center',
  },
  // The light at the head: the logo's slant, lit, so it glows.
  head: {
    position: 'absolute',
    left: 0,
    width: HEAD.width,
    height: HEAD.height,
    borderRadius: 1,
    backgroundColor: color.accent,
    boxShadow: `0 0 ${glow.tight}px 1px ${alpha(color.accent, 0.85)}`,
  },
  heading: { marginTop: space.xxl },
  body: { flex: 1, marginTop: space.xl, gap: space.md },
  bodyNoHeading: { marginTop: 0 },
});
