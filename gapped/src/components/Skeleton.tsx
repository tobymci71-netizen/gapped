import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { color, radius } from '@/theme/tokens';
import { duration } from '@/theme/motion';

/**
 * Shimmer skeleton (spec §A6): every loading state is a skeleton matching the
 * final layout — a spinner tells the user nothing about what's coming.
 */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const pulse = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!reduced) {
      pulse.value = withRepeat(
        withTiming(1, { duration: duration.epic, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }
    return () => cancelAnimation(pulse);
  }, [pulse, reduced]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0.6 : 0.4 + pulse.value * 0.35,
  }));

  return (
    <Animated.View
      style={[
        { backgroundColor: color.surface2, borderRadius: radius.card / 2, height: 16 },
        style,
        animStyle,
      ]}
    />
  );
}
