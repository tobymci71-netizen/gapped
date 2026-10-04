import { useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { useEffect, useState } from 'react';

/**
 * Longest wait for the push transition to report that it has finished. The
 * event normally lands well inside this; the timer is for the cases where it
 * never comes (a step that was the stack's first screen, a transition skipped
 * by the OS). Not a motion value, so not from theme/motion.ts.
 */
const ARRIVAL_FALLBACK_MS = 650;

/**
 * True once the screen has finished sliding in, and from then on.
 *
 * What waits for it: anything that should be seen happening. A count that
 * runs while its screen is still sliding sideways has mostly finished by the
 * time the screen stops — the focus proof's 0.5 s bars were three-quarters
 * grown on arrival, which is the same as not animating, only blurrier — and a
 * sheet that rises during the push is two motions at right angles, which
 * reads as the app stumbling. Waiting makes each one beat after another, as
 * the reference does it.
 */
export function useArrival(): boolean {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    if (arrived) return;
    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      setArrived(true);
    };
    const unsubscribe = navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) land();
    });
    const timer = setTimeout(land, ARRIVAL_FALLBACK_MS);
    return () => {
      done = true;
      unsubscribe();
      clearTimeout(timer);
    };
  }, [arrived, navigation]);

  return arrived;
}
