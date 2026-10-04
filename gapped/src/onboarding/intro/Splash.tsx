import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing } from '@/theme/motion';
import {
  landingFor,
  type Landing,
  type Rect,
  SPLASH_HOLD_MS,
  SPLASH_START_SCALE,
} from './introTimeline';
import { playStingOnce, prepareSting } from './sting';
import { Wordmark } from './Wordmark';

/**
 * Whether the splash has already run in this process. It is a launch beat:
 * a remount of the intro (a reset back into onboarding, say) opens straight
 * on the carousel instead of replaying it.
 */
let ran = false;
export function splashHasRun(): boolean {
  return ran;
}
function markSplashRan(): void {
  ran = true;
}

/** If measuring either wordmark has not answered by now, crossfade instead. */
const MEASURE_WAIT_MS = duration.base;

type Props = {
  /**
   * The screen has stopped sliding in (./useArrived). Nothing moves before
   * then: the wordmark's entrance is the first motion on screen.
   */
  start: boolean;
  /** The carousel header's wordmark, which the splash wordmark lands on. */
  target: React.RefObject<View | null>;
  /** The header wordmark's visibility: 0 until the splash mark lands on it. */
  markShown: SharedValue<number>;
  /** The carousel's content, 0 (hidden) to 1, revealed as the mark moves. */
  reveal: SharedValue<number>;
  /** The move has begun: the carousel's own entrances can start. */
  onMoveStart: () => void;
  /** The mark has landed and the header owns it: unmount the splash. */
  onDone: () => void;
};

/**
 * The splash (docs/ONBOARDING.md, step 0): GAPPED fades and scales in from
 * 0.96, the sting plays as it lands, and after a hold it rises and shrinks
 * into the carousel header. It never fades out: the mark the person watched
 * arrive is the one that ends up in the header.
 *
 * It is an overlay on the carousel, not a screen before it. The carousel is
 * laid out underneath from the first frame with its content hidden, so the
 * header position the mark travels to is a real, measured place, and the
 * content can rise in while the mark is still moving.
 *
 * Reduced motion: the mark appears without the scale, the sting still plays,
 * and after the same hold it crossfades into the header in place of the move.
 */
export function Splash({ start, target, markShown, reveal, onMoveStart, onDone }: Props) {
  const reduced = useReducedMotion();
  const markRef = useRef<View>(null);

  const appear = useSharedValue(0);
  const move = useSharedValue(0);
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const endScale = useSharedValue(1);
  /** 1 when the mark travels to the header, 0 when it crossfades there. */
  const travels = useSharedValue(0);

  // Load the sting while the screen is still arriving, so it is ready to
  // start the moment the wordmark lands.
  useEffect(() => {
    prepareSting();
  }, []);

  // Runs once, when the screen has arrived. `reduced` is read at the start: a
  // setting flipped during these two seconds applies to the next screen, not
  // this beat.
  useEffect(() => {
    if (!start) return;
    let hold: ReturnType<typeof setTimeout> | undefined;
    let measureWait: ReturnType<typeof setTimeout> | undefined;
    /**
     * Set by the cleanup. Every step below arrives late by design (an
     * animation's end hopping back from the UI thread, a measurement, a
     * timer), so any of them can land after an unmount; they stop here
     * instead of starting a new timer or calling the parent of a screen that
     * has gone.
     */
    let cancelled = false;

    const finish = () => {
      if (cancelled) return;
      markSplashRan();
      onDone();
    };

    const moveTo = (landing: Landing | null) => {
      clearTimeout(measureWait);
      if (cancelled) return;
      onMoveStart();
      const timing = { duration: duration.slow, easing: easing.standard };
      if (landing) {
        dx.set(landing.dx);
        dy.set(landing.dy);
        endScale.set(landing.scale);
        travels.set(1);
      } else {
        // Crossfade: the header mark fades up as this one fades down.
        markShown.set(withTiming(1, timing));
      }
      // The content follows the mark a beat behind, decelerating in.
      reveal.set(
        withDelay(
          duration.instant,
          withTiming(1, { duration: duration.slow, easing: easing.decel }),
        ),
      );
      move.set(
        withTiming(1, timing, (finished) => {
          'worklet';
          if (!finished) return;
          // Set here, on the UI thread, in the frame the move ends: the
          // header mark is up before the splash can unmount, so there is no
          // frame with neither.
          markShown.value = 1;
          scheduleOnRN(finish);
        }),
      );
    };

    const startMove = once(moveTo);

    const beginMove = () => {
      if (cancelled) return;
      if (reduced) {
        startMove(null);
        return;
      }
      measureWait = setTimeout(() => startMove(null), MEASURE_WAIT_MS);
      measure(markRef.current, (from) =>
        measure(target.current, (to) => startMove(landingFor(from, to))),
      );
    };

    const landed = () => {
      if (cancelled) return;
      playStingOnce();
      hold = setTimeout(beginMove, SPLASH_HOLD_MS);
    };

    appear.set(
      withTiming(
        1,
        { duration: reduced ? duration.fast : duration.slow, easing: easing.decel },
        (finished) => {
          'worklet';
          if (finished) scheduleOnRN(landed);
        },
      ),
    );

    return () => {
      cancelled = true;
      clearTimeout(hold);
      clearTimeout(measureWait);
      cancelAnimation(appear);
      cancelAnimation(move);
    };
    // Keyed on `start` alone by design (see above); the parent's callbacks
    // and the shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const markStyle = useAnimatedStyle(() => {
    const m = move.value;
    const inScale = reduced ? 1 : SPLASH_START_SCALE + (1 - SPLASH_START_SCALE) * appear.value;
    return {
      opacity: appear.value * (travels.value === 1 ? 1 : 1 - m),
      transform: [
        { translateX: dx.value * m },
        { translateY: dy.value * m },
        { scale: inScale * (1 + (endScale.value - 1) * m) },
      ],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.center}>
        <Animated.View style={markStyle}>
          {/* A plain view to measure: the animated wrapper's own frame is
              transformed, and this one is read before any transform moves. */}
          <View ref={markRef} collapsable={false}>
            <Wordmark size="splash" />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function measure(node: View | null, then: (r: Rect | null) => void): void {
  if (!node) {
    then(null);
    return;
  }
  node.measureInWindow((x, y, width, height) => then({ x, y, width, height }));
}

function once<A>(fn: (a: A) => void): (a: A) => void {
  let done = false;
  return (a) => {
    if (done) return;
    done = true;
    fn(a);
  };
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
