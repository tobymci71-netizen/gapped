import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, spring } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Every tappable scales to 0.97 with spring.snap on press-in (spec §A8).
 * Reduced motion: opacity dip instead of scale.
 */
export function PressableScale({
  children,
  onPressIn,
  silent,
  ...rest
}: PressableProps & { silent?: boolean; children?: React.ReactNode }) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();

  // Both keys are always present. Returning a different set of keys depending
  // on `reduced` leaves whichever key was dropped stuck at its last value if
  // the setting changes while mounted — the hazard BottomSheet already
  // documents.
  const style = useAnimatedStyle(() => ({
    opacity: reduced
      ? withTiming(pressed.value ? 0.7 : 1, { duration: duration.instant })
      : 1,
    transform: [
      { scale: reduced ? 1 : withSpring(pressed.value ? 0.97 : 1, spring.snap) },
    ],
  }));

  return (
    <AnimatedPressable
      {...rest}
      style={[rest.style as object, style]}
      onPressIn={(e) => {
        pressed.value = 1;
        if (!silent) haptic.press();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = 0;
        rest.onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
