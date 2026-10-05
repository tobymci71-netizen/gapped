import {
  BlurMask,
  Canvas,
  DashPathEffect,
  Group,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { SlantTag } from '@/components/brand/SlantTag';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing, spring } from '@/theme/motion';
import { color, font, italicOverhang, textStyle, type } from '@/theme/tokens';

/**
 * The app's signature object (spec §A3). Skia tick ring with trailing
 * illumination, spring-driven sweep, speed glow, idle breathe, rolling
 * odometer numeral, and a border-only PB pulse — no red flashing, no alarm.
 *
 * Nightrun: the ring is an instrument's lights, so the lit ticks and their
 * spill are the brand's red on a night-blue unlit ring; the needle is white
 * (a needle, not a light). The unit is set in the wide italic, as every
 * Nightrun figure's unit is, and a personal best is a slanted deep-red tag.
 *
 * Performance: all geometry is precomputed in useMemo; per-frame work is
 * shared-value interpolation only. Nothing allocates per frame — the
 * recorder is running and we do not compete with it.
 */

const START_ANGLE = 135;
const SWEEP = 270;

/**
 * Room around the dial for the speed glow to fade out in.
 *
 * The glow is a 20pt stroke blurred at sigma 18, centred 24pt in from the
 * dial's edge, so it reaches well past that edge. Drawn on a canvas exactly
 * the dial's size it was cut off in straight lines there: a faint square
 * round the dial whenever it lit, seen on the welcome carousel and the unit
 * step. The canvas now overhangs the dial by this much on every side and
 * draws everything shifted in by it; the dial's own box, and everything laid
 * out around it, is unchanged. 40pt plus the 14pt inside the edge is three
 * sigma, where the blur has all but gone.
 */
const GLOW_ROOM = 40;

/**
 * How far "mph" / "km/h" grows with Dynamic Type. The numeral above it is a
 * fixed size (AnimatedNumber does not scale), and uncapped at the largest
 * accessibility sizes the unit outgrew the ring it sits inside.
 */
const UNIT_MAX_SCALE = 1.3;

type Props = {
  /** Current speed in DISPLAY units (already converted at render). */
  value: number;
  /** Dial maximum in display units (e.g. 160 mph / 260 km/h). */
  maxValue: number;
  unit: string;
  /**
   * Personal best in display units; null when none yet. Breaking it shows the
   * NEW PB badge — so never pass it to a live drive's dial: rewarding speed
   * mid-drive is what NO_IN_DRIVE_SPEED_NUDGES (src/config/flags.ts) forbids.
   */
  pb?: number | null;
  size?: number;
  active?: boolean;
  /**
   * The red bloom that swells behind the ring as the needle passes 30% of the
   * dial. On by default (the onboarding demo dial). The live drive HUD turns
   * it off: a light that grows brighter the faster you go is a reward for a
   * number going up mid-drive, which NO_IN_DRIVE_SPEED_NUDGES forbids. The
   * lit ticks still show the speed; they are the instrument.
   */
  speedGlow?: boolean;
};

export function Speedometer({
  value,
  maxValue,
  unit,
  pb,
  size = 300,
  active = true,
  speedGlow = true,
}: Props) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(value, maxValue));

  // Spring-followed speed (the "needle"), then a 40ms-lagged follower for
  // tick illumination so the sweep feels liquid rather than snapping.
  //
  // Both hold the FRACTION of the dial, not the display-unit speed. They held
  // the speed, and the worklets divided by `maxValue` from their closure — so a
  // unit change swapped the divisor on the next frame while the value was still
  // in the old unit: 109 km/h of 260 read as 109 of 160, the needle leapt ~70°
  // and sprang back, though the physical speed never moved. The fraction is
  // the same in either unit, so now the dial barely twitches.
  const frac = maxValue > 0 ? clamped / maxValue : 0;
  const speed = useSharedValue(0);
  const lit = useSharedValue(0);

  useEffect(() => {
    speed.value = reduced
      ? withTiming(frac, { duration: duration.instant })
      : withSpring(frac, spring.needle);
    lit.value = withTiming(frac, {
      duration: reduced ? duration.instant : duration.fast,
      easing: easing.standard,
    });
  }, [frac, reduced, speed, lit]);

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

  /**
   * PB break, LATCHED for the run.
   *
   * This was recomputed per fix (`clamped > pb`), so speed oscillating across
   * the stored best sprang the badge in and out repeatedly and flipped the
   * glow white and back with it. Breaking a personal best is an event, not a
   * condition — once it happens it stays true until the dial goes idle or the
   * best itself changes.
   */
  const [isPb, setIsPb] = useState(false);
  const session = `${pb ?? 'none'}|${active}`;
  const sessionRef = useRef(session);
  useEffect(() => {
    // One effect, not two. Split across a "latch" effect and a "reset" effect
    // they run in declaration order, so a best broken on the very first fix
    // was set and then immediately cleared by the reset in the same commit.
    if (sessionRef.current !== session) {
      sessionRef.current = session;
      setIsPb(false);
      return;
    }
    if (pb != null && pb > 5 && clamped > pb) setIsPb(true);
  }, [clamped, pb, session]);

  const pbScale = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      // The one animation in this file that never consulted reduced motion.
      pbScale.value = withTiming(isPb ? 1 : 0, { duration: duration.instant });
      return;
    }
    pbScale.value = isPb
      ? withSpring(1, spring.bouncy)
      : withTiming(0, { duration: duration.fast });
  }, [isPb, reduced, pbScale]);

  const c = size / 2;
  const strokeR = c - 24;
  // The readout was pinned at 84pt whatever the dial size, so three digits
  // overprinted the tick ring on the 200pt HUD and the 220pt onboarding
  // preview. 0.28 keeps the 84pt look at the 300pt default.
  const readoutSize = Math.round(size * 0.28);

  const { ringPath, glowPath } = useMemo(() => {
    const rect = Skia.XYWHRect(c - strokeR, c - strokeR, strokeR * 2, strokeR * 2);
    const ring = Skia.Path.Make();
    ring.addArc(rect, START_ANGLE, SWEEP);
    const glow = Skia.Path.Make();
    glow.addArc(rect, START_ANGLE, SWEEP);
    return { ringPath: ring, glowPath: glow };
  }, [c, strokeR]);

  // Glow ramps in above 30% of dial max (spec: below 30% of tier max, no glow)
  const glowOpacity = useDerivedValue(() => {
    const f = speed.value;
    return f < 0.3 ? 0 : Math.min(1, ((f - 0.3) / 0.7) * 0.85);
  });

  const needleAngle = useDerivedValue(
    () => ((START_ANGLE + speed.value * SWEEP) * Math.PI) / 180,
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
      <Canvas
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -GLOW_ROOM,
          top: -GLOW_ROOM,
          width: size + GLOW_ROOM * 2,
          height: size + GLOW_ROOM * 2,
        }}
      >
        <Group transform={[{ translateX: GLOW_ROOM }, { translateY: GLOW_ROOM }]}>
          {/* glow underlay — radius/opacity scale with speed (off on the live HUD) */}
          {speedGlow ? (
            <Path
              path={glowPath}
              style="stroke"
              strokeWidth={20}
              color={isPb ? color.text1 : color.accent}
              start={0}
              end={speed}
              opacity={glowOpacity}
            >
              <BlurMask blur={18} style="outer" />
            </Path>
          ) : null}
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
            end={lit}
          >
            <DashPathEffect intervals={[3.5, 6.5]} />
          </Path>
          {/* needle head */}
          <Group transform={needleTransform} origin={vec(c, c)}>
            <Path path={needlePath} style="stroke" strokeWidth={3} color={color.text1} />
          </Group>
        </Group>
      </Canvas>

      <View style={styles.center} pointerEvents="none">
        <AnimatedNumber value={String(Math.round(active ? value : 0))} size={readoutSize} />
        <Text style={styles.unit} maxFontSizeMultiplier={UNIT_MAX_SCALE}>
          {unit}
        </Text>
        {/* Below the unit at any dial size: a fixed `bottom: 48` cleared it at
            300pt but sat over the lower half of "mph" on the 200pt HUD. */}
        <Animated.View style={[styles.pbBadge, { bottom: Math.round(size * 0.16) }, pbStyle]}>
          <SlantTag label="NEW PB" variant="red" />
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
    fontFamily: font.display,
    ...textStyle(type.title),
    paddingRight: italicOverhang(type.title.size),
    color: color.text2,
    // Pulled up under the numeral by the room its line box leaves below the
    // glyphs, so the word sits where the body-set unit used to.
    marginTop: -6.5,
  },
  // The tag carries its own deep-red plate (accentFill under white: 4.98:1).
  pbBadge: { position: 'absolute' },
});
