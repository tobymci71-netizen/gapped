import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CarSilhouette } from '@/components/CarSilhouette';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useProfile } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { color, gutter, space } from '@/theme/tokens';
import { IntroPage } from './IntroPage';
import type { IntroPageCopy } from './introTimeline';

/** How far the car rises as it settles in, pt. */
const SETTLE_TRAVEL = 16;

/**
 * CarSilhouette draws inside a square and centres the vehicle in it, so a
 * long, low car leaves a third of the square empty above and below. The page
 * lays out only the middle half of the square (the rest overflows, unclipped,
 * into the margins), so the heading sits under the car rather than under a
 * band of nothing.
 */
const VISIBLE_BAND = 0.5;

type Props = {
  copy: IntroPageCopy;
  width: number;
  hidden: boolean;
  /** Passed to IntroPage: a vertical drag began here. */
  onVerticalDrag?: () => void;
  /** Some of the page is on screen: the car settles in as it slides over. */
  onScreen: boolean;
};

/**
 * Page 4, "Built by drivers": a large white silhouette, the ride the next step
 * asks about, tail light lit. A coupé, the shape most people read as "a car";
 * a motorbike if the person picked one on the ride step and came Back here.
 *
 * The silhouette mounts with the carousel, under the splash, so its own
 * draw-on reveal has finished long before anyone swipes here. What this page
 * adds is a settle: a short rise and fade as it first slides into view,
 * ease-out, nothing that bounces.
 */
export function BuiltPage({ copy, width, hidden, onScreen, onVerticalDrag }: Props) {
  const reduced = useReducedMotion();
  const kind = useProfile((s) => s.vehicleKind);
  const { height } = useWindowDimensions();
  // As wide as the copy below it; on a short screen the height caps it first.
  const size = Math.min(width - gutter * 2, Math.round(height * 0.5));

  const settle = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    // Reduced motion: in place from the start, not waiting to be seen.
    if (reduced) {
      settle.value = 1;
      return;
    }
    if (!onScreen) return;
    settle.value = withTiming(1, { duration: duration.slow, easing: easing.decel });
  }, [onScreen, reduced, settle]);

  const settleStyle = useAnimatedStyle(() => ({
    opacity: settle.value,
    transform: [{ translateY: (1 - settle.value) * SETTLE_TRAVEL }],
  }));

  return (
    <IntroPage
      copy={copy}
      width={width}
      hidden={hidden}
      onVerticalDrag={onVerticalDrag}
    >
      {/* Decoration: the heading below says what the page means. */}
      <View
        style={[styles.car, { height: Math.round(size * VISIBLE_BAND) }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={settleStyle}>
          <CarSilhouette
            bodyType={kind === 'motorbike' ? 'motorbike' : 'coupe'}
            size={size}
            color={color.text1}
            lit
          />
        </Animated.View>
      </View>
    </IntroPage>
  );
}

const styles = StyleSheet.create({
  car: { alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
