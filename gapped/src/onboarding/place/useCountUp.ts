import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * Ease-out cubic: fast off the mark, settling into the final figure. The
 * curve the rest of the flow's motion uses in spirit (theme/motion.ts,
 * `decel`) — a counter that slows as it arrives reads as a reading settling,
 * one that runs at constant speed reads as a clock.
 */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/**
 * Linear progress from 0 to 1 over `durationMs`, once, starting when `play`
 * first turns true (the screen has arrived — ./useArrival) and holding at 1
 * after. Until then it holds at 0, the start state. Reduced motion gets 1
 * straight away: the end state, with nothing moving.
 *
 * On the JS thread, one state update a frame for well under a second: it
 * drives Text, which the UI thread cannot write to without a TextInput shim,
 * and on a still onboarding step the JS thread has nothing else to do.
 */
export function useProgress(durationMs: number, play = true): number {
  const reduced = useReducedMotion();
  const still = reduced || durationMs <= 0;
  const [t, setT] = useState(0);

  useEffect(() => {
    if (still || !play) return;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const p = Math.min(1, Math.max(0, (now - start) / durationMs));
      setT(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, still, play]);

  return still ? 1 : t;
}

/**
 * A number that counts up from 0 to `target` once, easing out as it arrives
 * ("Numbers count" — docs/ONBOARDING.md, "Look and motion").
 */
export function useCountUp(target: number, durationMs: number, play = true): number {
  return target * easeOutCubic(useProgress(durationMs, play));
}
