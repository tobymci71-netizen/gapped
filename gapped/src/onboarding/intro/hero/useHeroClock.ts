import { useEffect, useMemo, useRef } from 'react';
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { COPY_TOTAL_MS, CURVE, INTRO, STILL_MS } from './heroMath';

export type HeroClock = {
  /**
   * Milliseconds of hero time: every loop and entrance on the scene reads it.
   * It advances on the UI thread only while the hero is running, so a paused
   * scene (screen not focused, page swiped away) costs nothing and resumes
   * exactly where it stopped.
   */
  t: SharedValue<number>;
  /**
   * The trails' burst, 0 → 1, on its own timing rather than the clock: the
   * static canvas reads only this, so once it lands that canvas never draws
   * again.
   */
  burst: SharedValue<number>;
  /**
   * Ms since the copy started to rise, as a 0 → 1 fraction of the whole
   * cascade. Also off the clock: swiping away mid-rise must not leave the
   * button half-faded on the next page.
   */
  copy: SharedValue<number>;
};

/**
 * The welcome hero's clock.
 *
 * `play`: the intro may start (the splash has begun its move, or there was no
 * splash). `running`: the scene is on screen and focused. `copyDelay`: how
 * long after `play` the copy starts to rise. Reduce Motion stops the clock on
 * the still frame (STILL_MS) with everything landed, and never starts it.
 */
export function useHeroClock({
  play,
  running,
  reduced,
  copyDelay,
}: {
  play: boolean;
  running: boolean;
  reduced: boolean;
  copyDelay: number;
}): HeroClock {
  const t = useSharedValue(reduced ? STILL_MS : 0);
  const burst = useSharedValue(reduced ? 1 : 0);
  const copy = useSharedValue(reduced ? 1 : 0);
  const started = useRef(false);

  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    // A long gap (the app was backgrounded mid-frame) advances one frame's
    // worth, not the whole gap: the scene resumes, it does not jump.
    if (dt != null) t.value += Math.min(dt, 50);
  }, false);

  // The entrances that run off the clock start once, on the first `play`.
  useEffect(() => {
    if (reduced) {
      cancelAnimation(burst);
      cancelAnimation(copy);
      burst.set(1);
      copy.set(1);
      if (t.get() < STILL_MS) t.set(STILL_MS);
      return;
    }
    if (!play || started.current) return;
    started.current = true;
    burst.set(
      withDelay(
        INTRO.burst.delay,
        withTiming(1, { duration: INTRO.burst.duration, easing: Easing.bezier(...CURVE.burst) }),
      ),
    );
    copy.set(
      withDelay(copyDelay, withTiming(1, { duration: COPY_TOTAL_MS, easing: Easing.linear })),
    );
  }, [play, reduced, copyDelay, burst, copy, t]);

  useEffect(() => {
    frame.setActive(play && running && !reduced);
  }, [frame, play, running, reduced]);
  useEffect(() => () => frame.setActive(false), [frame]);

  return useMemo(() => ({ t, burst, copy }), [t, burst, copy]);
}
