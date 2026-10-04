import { type NativeStackNavigationProp, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';

type StackNavigation = NativeStackNavigationProp<Record<string, object | undefined>>;

/**
 * Longest wait for the slide-in to report that it has finished. The event
 * normally lands well inside this; the timer covers a launch with no
 * transition at all (a cold start straight onto this route, a transition the
 * OS skipped). Not a motion value, so not from theme/motion.ts.
 */
const ARRIVAL_FALLBACK_MS = 700;

/**
 * True once the screen has stopped moving: its push has finished, or, for
 * the first screen of a nested stack, the push of the stack itself.
 *
 * The intro is the first screen of the onboarding stack, and the cold-start
 * redirect (app/index.tsx) brings that whole stack in with a slide from the
 * right. A splash that starts on mount fades in while sliding sideways, so the
 * wordmark entered as "G", then "GAP", from the right edge (seen frame by
 * frame on a simulator). Black sliding over black is invisible, so waiting for
 * the slide to land costs nothing to look at and lets the splash be the
 * first thing that moves.
 *
 * `enabled` false (the splash already ran) answers true at once.
 */
export function useArrived(enabled: boolean): boolean {
  const navigation = useNavigation<StackNavigation>();
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      setArrived(true);
    };
    const onEnd = (e: { data: { closing: boolean } }) => {
      if (!e.data.closing) land();
    };
    const parent = navigation.getParent<StackNavigation>();
    const unsubscribe = [
      navigation.addListener('transitionEnd', onEnd),
      parent?.addListener('transitionEnd', onEnd),
    ];
    const timer = setTimeout(land, ARRIVAL_FALLBACK_MS);
    return () => {
      done = true;
      unsubscribe.forEach((u) => u?.());
      clearTimeout(timer);
    };
  }, [enabled, navigation]);

  return enabled ? arrived : true;
}
