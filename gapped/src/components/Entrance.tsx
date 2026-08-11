import React from 'react';
import { ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, stagger, STAGGER_CAP } from '@/theme/motion';

/**
 * Staggered list/child entrance (spec §A6): fade + 12px translate, `stagger`
 * ms apart, capped at the first STAGGER_CAP children — never stagger 100
 * items. Reduced motion: opacity only.
 */
/** Vertical travel for a staggered entrance, px. */
const ENTRANCE_TRAVEL = 12;

export function Entrance({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const reduced = useReducedMotion();
  const delay = Math.min(index, STAGGER_CAP) * stagger;
  // withInitialValues pins the travel to the 12px this component documents.
  // Bare FadeInDown ships reanimated's 25px default, so every staggered
  // entrance in the app was moving twice as far as intended — which at
  // onboarding pace reads as heavy rather than brisk.
  const entering = reduced
    ? FadeIn.duration(duration.fast)
    : FadeInDown.duration(duration.base)
        .delay(delay)
        .withInitialValues({ transform: [{ translateY: ENTRANCE_TRAVEL }] });
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
