import React from 'react';
import { Pressable, PressableProps, StyleSheet } from 'react-native';
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
 * The opacity the caller's own style asks for — 0.45 on a dimmed pill, say —
 * or 1 when it sets none.
 *
 * The animated style has to own `opacity` (it is the reduced-motion press
 * feedback), and Reanimated resolves it after the caller's style, so a caller
 * dimming a disabled control through its style was silently overruled and the
 * control looked live. Reading the caller's value here and multiplying the
 * press dip into it keeps one owner for the property without losing either.
 */
export function restingOpacity(style: PressableProps['style']): number {
  if (typeof style === 'function') return 1;
  const opacity = StyleSheet.flatten(style)?.opacity;
  return typeof opacity === 'number' ? opacity : 1;
}

/**
 * Wraps a committed-press handler (onPress / onLongPress) with the press
 * haptic.
 *
 * The caller's handler runs before the haptic, not after. The haptics throttle
 * lets one through per 100 ms, so whichever fires first is the one felt: a
 * handler with its own, more specific pattern (Start drive's driveStarted)
 * must get there first, and the generic press only fills in when the handler
 * fired nothing.
 *
 * No handler, no wrapper: a haptic on a tap that does nothing (a
 * long-press-only card, tapped briefly) is noise.
 */
export function withPressHaptic<E>(
  handler: ((e: E) => void) | null | undefined,
  silent: boolean | undefined,
): ((e: E) => void) | undefined {
  if (!handler) return undefined;
  return (e) => {
    handler(e);
    if (!silent) haptic.press();
  };
}

/**
 * Every tappable scales to 0.97 with spring.snap on press-in (spec §A8).
 * Reduced motion: opacity dip instead of scale.
 *
 * The haptic waits for the press to commit (onPress / onLongPress) rather than
 * firing at touch-down. Press-in fires the instant a finger lands, before a
 * parent ScrollView has decided the touch is a scroll, so a touch-down haptic
 * buzzed on every scroll that happened to start on a row — and haptics are
 * never on scroll. The scale stays on press-in: visual feedback has to be
 * immediate, and a scroll cancels it cleanly with a spring back.
 */
export function PressableScale({
  children,
  onPressIn,
  onPress,
  onLongPress,
  silent,
  ...rest
}: PressableProps & { silent?: boolean; children?: React.ReactNode }) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();
  // Captured by the worklet, so a caller toggling its dimmed style re-runs the
  // mapper with the new value.
  const baseOpacity = restingOpacity(rest.style);

  // Both keys are always present. Returning a different set of keys depending
  // on `reduced` leaves whichever key was dropped stuck at its last value if
  // the setting changes while mounted — the hazard BottomSheet already
  // documents.
  const style = useAnimatedStyle(() => ({
    opacity: reduced
      ? withTiming(baseOpacity * (pressed.value ? 0.7 : 1), { duration: duration.instant })
      : baseOpacity,
    transform: [
      { scale: reduced ? 1 : withSpring(pressed.value ? 0.97 : 1, spring.snap) },
    ],
  }));

  return (
    <AnimatedPressable
      {...rest}
      style={[rest.style as object, style]}
      // set() rather than `.value =`: the React hooks lint treats a hook's
      // return value as immutable and flags property writes in handlers.
      onPressIn={(e) => {
        pressed.set(1);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(0);
        rest.onPressOut?.(e);
      }}
      onPress={withPressHaptic(onPress, silent)}
      onLongPress={withPressHaptic(onLongPress, silent)}
    >
      {children}
    </AnimatedPressable>
  );
}
