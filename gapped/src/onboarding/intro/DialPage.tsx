import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Speedometer } from '@/components/Speedometer';
import { speedForDisplay } from '@/drive/units';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useProfile } from '@/state/profile';
import { easing } from '@/theme/motion';
import { space } from '@/theme/tokens';
import { mps } from '@/types/units';
import { IntroPage } from './IntroPage';
import {
  DIAL_SWEEP_MS,
  dialDemoLabel,
  type IntroPageCopy,
  SPLASH_START_SCALE,
} from './introTimeline';

/**
 * Demo speed the hero dial sweeps to, m/s (≈ 87 mph / 140 km/h).
 *
 * Branded. This constant is where the 313 km/h bug lived: it briefly held 87,
 * a value already in display units (mph), which speedForDisplay then converted
 * a second time. With MetresPerSecond on the parameter, a bare 87 no longer
 * compiles here — the mistake is now caught at build time, not on a screenshot.
 */
const DEMO_MS = mps(38.9);

/** Dial ceilings per unit, matching the unit step and the live drive HUD. */
const DIAL_MAX_MPH = 160;
const DIAL_MAX_KMH = 260;

/** The sweep reaches the JS thread in thousandths: smooth, and no faster. */
const SWEEP_STEPS = 1000;

type Props = {
  copy: IntroPageCopy;
  width: number;
  hidden: boolean;
  /** Passed to IntroPage: a vertical drag began here. */
  onVerticalDrag?: () => void;
  /** Start the sweep: the splash has handed over and this page is in view. */
  play: boolean;
  /** The carousel's reveal, 0 → 1: the dial grows into place with it. */
  reveal: SharedValue<number>;
};

/**
 * Page 1, "Track every drive": the app's real Speedometer, its needle
 * sweeping up from 0 as the screen appears. The live dial IS the pitch; it is
 * the component the drive HUD uses, not an illustration of it.
 *
 * The sweep plays once. It does not replay on a return to this page, because
 * the way back to 0 is the dial's idle state, and an idle dial breathes on a
 * loop that would keep running under every later step.
 */
export function DialPage({ copy, width, hidden, play, reveal, onVerticalDrag }: Props) {
  const reduced = useReducedMotion();
  const unitPref = useProfile((s) => s.unitPref);
  const demo = speedForDisplay(DEMO_MS, unitPref);

  // The dial sizes to the viewport: a fixed 280 overflowed the hero on a 667pt
  // device, so the bottom of the pitch went under the footer.
  const { height } = useWindowDimensions();
  const dial = Math.min(280, Math.round(width * 0.62), Math.round(height * 0.34));

  // The sweep is eased on the UI thread and handed to the Speedometer as its
  // value, a step per frame. The dial follows values on a spring tuned for a
  // live drive, which overshoots a jump to the demo speed by about 16%; fed
  // the eased curve instead, it trails it and settles without visible
  // overshoot (see DIAL_SWEEP_MS).
  const sweep = useSharedValue(0);
  const [step, setStep] = useState(0);
  useAnimatedReaction(
    () => Math.round(sweep.value * SWEEP_STEPS),
    (now, before) => {
      if (now !== before) scheduleOnRN(setStep, now);
    },
  );
  useEffect(() => {
    // Reduced motion gets the value immediately (the sweep IS the animation),
    // and without waiting for `play`: the dial fades up during the splash's
    // crossfade, and it should fade up reading the speed it holds rather than
    // reading 0 and then jumping.
    if (reduced) {
      sweep.value = 1;
      return;
    }
    if (!play) return;
    sweep.value = withTiming(1, { duration: DIAL_SWEEP_MS, easing: easing.decel });
  }, [play, reduced, sweep]);

  // "The gauge fades in with a slight scale": the fade is the carousel's
  // reveal; the scale is this, from the splash mark's own starting scale.
  const growStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: reduced ? 1 : SPLASH_START_SCALE + (1 - SPLASH_START_SCALE) * reveal.value },
    ],
  }));

  const shown = demo.value * (step / SWEEP_STEPS);

  return (
    <IntroPage
      copy={copy}
      width={width}
      hidden={hidden}
      onVerticalDrag={onVerticalDrag}
    >
      <Animated.View style={[styles.dial, growStyle]}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={dialDemoLabel(demo.value, demo.unit)}
        >
          <Speedometer
            value={shown}
            maxValue={unitPref === 'imperial' ? DIAL_MAX_MPH : DIAL_MAX_KMH}
            unit={demo.unit}
            size={dial}
            active
          />
        </View>
      </Animated.View>
    </IntroPage>
  );
}

const styles = StyleSheet.create({
  dial: { alignItems: 'center', marginBottom: space.sm },
});
