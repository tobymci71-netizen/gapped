import {
  BlurMask,
  Canvas,
  DashPathEffect,
  Group,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, spring } from '@/theme/motion';
import { color, font } from '@/theme/tokens';

/**
 * The app's signature object (spec §A3). Skia tick ring with trailing
 * illumination, spring-driven sweep, speed glow, idle breathe, rolling
 * odometer numeral, and a border-only PB pulse — no red flashing, no alarm.
 *
 * Performance: all geometry is precomputed in useMemo; per-frame work is
 * shared-value interpolation only. Nothing allocates per frame — the
 * recorder is running and we do not compete with it.
 */

const START_ANGLE = 135;
const SWEEP = 270;

type Props = {
  /** Current speed in DISPLAY units (already converted at render). */
  value: number;
  /** Dial maximum in display units (e.g. 160 mph / 260 km/h). */
  maxValue: number;
  unit: string;
  /** Personal best in display units; null when none yet. */
  pb?: number | null;
  size?: number;
  active?: boolean;
};

export function Speedometer({ value, maxValue, unit, pb, size = 300, active = true }: Props) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(value, maxValue));

  // Spring-followed speed (the "needle"), then a 40ms-lagged follower for
  // tick illumination so the sweep feels liquid rather than snapping.
  const speed = useSharedValue(0);
  const lit = useSharedValue(0);

  useEffect(() => {
    speed.value = reduced
      ? withTiming(clamped, { duration: duration.instant })
      : withSpring(clamped, spring.needle);
    lit.value = withTiming(clamped, {
      duration: reduced ? duration.instant : 220,
      easing: Easing.bezier(0.2, 0, 0, 1),
    });
  }, [clamped, reduced, speed, lit]);

  // Idle breathe: at 0 the ring scales 1.0→1.015 over 3s so the screen is
  // never static. Killed when moving or when reduced motion is on.
  const breathe = useSharedValue(1);
  const idle = clamped < 1;
  useEffect(() => {
    if (idle && !reduced) {
      breathe.value = withRepeat(
        withSequence(
          withTiming(1.015, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(breathe);
      breathe.value = withTiming(1, { duration: duration.fast });
    }
    return () => cancelAnimation(breathe);
  }, [idle, reduced, breathe]);

  // PB break: label springs in; glow shifts white (handled via pbActive).
  const isPb = pb != null && pb > 5 && clamped > pb;
  const pbScale = useSharedValue(0);
  useEffect(() => {
    pbScale.value = isPb
      ? withSpring(1, spring.bouncy)
      : withTiming(0, { duration: duration.fast });
  }, [isPb, pbScale]);

  const c = size / 2;
  const strokeR = c - 24;

  const { ringPath, glowPath } = useMemo(() => {
    const rect = Skia.XYWHRect(c - strokeR, c - strokeR, strokeR * 2, strokeR * 2);
    const ring = Skia.Path.Make();
    ring.addArc(rect, START_ANGLE, SWEEP);
    const glow = Skia.Path.Make();
    glow.addArc(rect, START_ANGLE, SWEEP);
    return { ringPath: ring, glowPath: glow };
  }, [c, strokeR]);

  const litEnd = useDerivedValue(() => lit.value / maxValue);
  const glowEnd = useDerivedValue(() => speed.value / maxValue);
  // Glow ramps in above 30% of dial max (spec: below 30% of tier max, no glow)
  const glowOpacity = useDerivedValue(() => {
    const frac = speed.value / maxValue;
    return frac < 0.3 ? 0 : Math.min(1, ((frac - 0.3) / 0.7) * 0.85);
  });

  const needleAngle = useDerivedValue(
    () => ((START_ANGLE + (speed.value / maxValue) * SWEEP) * Math.PI) / 180,
  );
  const needleTransform = useDerivedValue(() => [{ rotate: needleAngle.value }]);

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value }],
  }));
  const pbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pbScale.value }],
    opacity: pbScale.value,
  }));

  const needlePath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(c + strokeR - 14, c);
    p.lineTo(c + strokeR + 10, c);
    return p;
  }, [c, strokeR]);

  return (
    <Animated.View style={[{ width: size, height: size }, breatheStyle]}>
      <Canvas style={{ width: size, height: size }}>
        {/* glow underlay — radius/opacity scale with speed */}
        <Path
          path={glowPath}
          style="stroke"
          strokeWidth={20}
          color={isPb ? '#FFFFFF' : color.accent}
          start={0}
          end={glowEnd}
          opacity={glowOpacity}
        >
          <BlurMask blur={18} style="outer" />
        </Path>
        {/* unlit tick ring */}
        <Path
          path={ringPath}
          style="stroke"
          strokeWidth={18}
          color={color.surface3}
        >
          <DashPathEffect intervals={[3.5, 6.5]} />
        </Path>
        {/* lit ticks — 40ms trailing follower */}
        <Path
          path={ringPath}
          style="stroke"
          strokeWidth={18}
          color={color.accent}
          start={0}
          end={litEnd}
        >
          <DashPathEffect intervals={[3.5, 6.5]} />
        </Path>
        {/* needle head */}
        <Group transform={needleTransform} origin={vec(c, c)}>
          <Path path={needlePath} style="stroke" strokeWidth={3} color={color.text1} />
        </Group>
      </Canvas>

      <View style={styles.center} pointerEvents="none">
        <AnimatedNumber value={String(Math.round(active ? value : 0))} size={84} />
        <Text style={styles.unit}>{unit}</Text>
        <Animated.View style={[styles.pbBadge, pbStyle]}>
          <Text style={styles.pbText}>NEW PB</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unit: {
    fontFamily: font.bodyMedium,
    fontSize: 17,
    color: color.text2,
    marginTop: -6,
  },
  pbBadge: {
    position: 'absolute',
    bottom: 48,
    backgroundColor: color.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pbText: {
    fontFamily: font.displayBlack,
    fontSize: 13,
    color: color.onAccent,
    letterSpacing: 1.5,
  },
});
