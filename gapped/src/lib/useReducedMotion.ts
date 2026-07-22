/**
 * prefers-reduced-motion, shipped from the start (spec §A0). Components fall
 * back to opacity-only transitions when this is true.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let cached = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    cached = v;
  })
  .catch(() => undefined);

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(cached);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      cached = v;
      setReduced(v);
    });
    return () => sub.remove();
  }, []);
  return reduced;
}
