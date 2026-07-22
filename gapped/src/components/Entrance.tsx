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
  const entering = reduced
    ? FadeIn.duration(duration.fast)
    : FadeInDown.duration(duration.base).delay(delay);
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
