import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { rampAt } from './numbers';

/**
 * A number that ramps from 0 to `target` once, on appear, with an ease-out —
 * the make-proof count ticking up and the unit dial's needle sweeping in.
 *
 * Driven from a JS frame loop rather than a shared value because what it feeds
 * is React text and a component prop, not a style: a count has to be digits,
 * and the Speedometer takes a number. A few dozen renders of one screen is
 * nothing next to the clarity of a plain value.
 *
 * Once the ramp has run it is spent: a later change to `target` (a unit
 * switched, a count corrected) arrives at once, and the consumer's own motion
 * — the dial's needle, the odometer roll — carries it. Reduced motion gets the
 * end state from the first frame.
 */
export function useRamp(
  target: number,
  { durationMs, delayMs = 0 }: { durationMs: number; delayMs?: number },
): number {
  const reduced = useReducedMotion();
  /** Linear progress through the ramp, 0–1. */
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now + delayMs;
      const p = Math.min(1, Math.max(0, (now - start) / durationMs));
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, durationMs, delayMs]);

  if (reduced || progress >= 1) return target;
  return rampAt(progress * durationMs, durationMs, target);
}
