import { useIsFocused } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, PixelRatio, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { ambient, duration, easing } from '@/theme/motion';
import type { BodyType } from '../bodyType';
import { VEHICLE_RENDERS } from './manifest';
import { fitInFrame, type Placement } from './place';
import type { RenderView } from './types';

/** The breathing tail lights' dimmest, as on the Drive and Garage heroes. */
const BREATHE_LOW = 0.55;
/** How far the vehicle rises as it appears. */
const SETTLE = 6;
/** The small images' share of the full size (scripts/render-vehicles/export.mjs). */
const SMALL_SCALE = 1 / 3;

type Props = {
  bodyType: BodyType;
  view: RenderView;
  /** The frame the render is laid out in, in points. */
  width: number;
  height: number;
  /**
   * Where the image goes in the frame. Default: the vehicle contained and
   * centred (fitInFrame). Pass placeOnGround's result to stand it on a floor.
   */
  placement?: Placement;
  /**
   * `set`: the vehicle in its paint. `idle`: the vehicle dimmed, lights off,
   * parked in the dark: a placeholder before anything is chosen.
   */
  tone?: 'set' | 'idle';
  /** The tail lights: `on`, `breathe` (slow pulse, as when parked) or `off`. */
  lights?: 'on' | 'breathe' | 'off';
  /** Fade and settle in when it mounts or the vehicle changes; the lights catch after. */
  appear?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A body type's rendered vehicle (docs/VEHICLE_ART.md): the image, and its
 * tail lights on a layer of their own, so they can catch as it appears and
 * breathe while it is parked. Red is light: the tail lights are the only red
 * that glows (a livery may wear racing red as paint; docs/VEHICLE_ART.md).
 *
 * Decorative: hidden from VoiceOver. The screen around it names the vehicle.
 * Under Reduce Motion it appears without travel and the lights hold steady.
 */
export function VehicleRender({
  bodyType,
  view,
  width,
  height,
  placement,
  tone = 'set',
  lights = 'on',
  appear = true,
  style,
}: Props) {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const renders = VEHICLE_RENDERS[bodyType];
  const r = renders?.views[view];

  const shown = useSharedValue(appear ? 0 : 1);
  const lamp = useSharedValue(appear ? 0 : 1);
  const lit = tone === 'set' && lights !== 'off';
  const breathing = lit && lights === 'breathe' && focused && !reduced;

  // Appear, then the lights catch: a quick flicker and on, as an engine starts.
  useEffect(() => {
    if (!appear) return;
    shown.set(0);
    lamp.set(0);
    if (reduced) {
      shown.set(withTiming(1, { duration: duration.fast }));
      lamp.set(1);
      return;
    }
    shown.set(withTiming(1, { duration: duration.slow, easing: easing.decel }));
    lamp.set(
      withDelay(
        Math.round(duration.slow * 0.7),
        withSequence(
          withTiming(0.7, { duration: 70 }),
          withTiming(0.15, { duration: 60 }),
          withTiming(1, { duration: 140 }),
        ),
      ),
    );
  }, [bodyType, view, tone, appear, reduced, shown, lamp]);

  // The parked breathe, only while it can be seen and motion is allowed.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!breathing) {
      cancelAnimation(pulse);
      pulse.set(1);
      return;
    }
    pulse.set(
      withRepeat(
        withTiming(BREATHE_LOW, { duration: ambient.breathe, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [breathing, pulse]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * SETTLE }],
  }));
  const lampStyle = useAnimatedStyle(() => ({ opacity: lamp.get() * pulse.get() }));

  if (!r || width <= 0 || height <= 0) return <View style={[{ width, height }, style]} />;

  const p = placement ?? fitInFrame(r, width, height);
  // The third-size images while they are still sharp on this screen.
  const small = p.width * PixelRatio.get() <= r.w * SMALL_SCALE;
  const imageBox = { left: p.left, top: p.top, width: p.width, height: p.height };

  return (
    <View
      style={[{ width, height }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        <Image
          source={small ? r.bodySmall : r.body}
          style={[styles.image, imageBox, tone === 'idle' && styles.idle]}
          resizeMode="stretch"
        />
        {lit ? (
          <Animated.View style={[StyleSheet.absoluteFill, lampStyle]}>
            <Image source={small ? r.lightsSmall : r.lights} style={[styles.image, imageBox]} resizeMode="stretch" />
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { position: 'absolute' },
  // The placeholder, quiet: it stands for "a vehicle goes here". Dimmed, not
  // tinted: a tint would grey the soft contact shadow into a smear.
  idle: { opacity: 0.55 },
});
