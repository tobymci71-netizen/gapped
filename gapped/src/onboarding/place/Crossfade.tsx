import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing } from '@/theme/motion';

type Props = {
  /** What is showing. A new id fades in over the old one, which fades out. */
  id: string;
  children: (id: string) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Crossfades between renders of `children(id)` as `id` changes — the country
 * step's map and count line when the country changes (docs/ONBOARDING.md,
 * "Changing country crossfades the map and swaps the line").
 *
 * Both layers are kept mounted and faded by hand rather than left to a
 * layout animation's `exiting`: the outgoing map is a Skia canvas, and a
 * canvas that has been unmounted has already dropped its picture, so an
 * exiting animation would fade out an empty box and the "crossfade" would be
 * a cut to black followed by a fade in.
 *
 * The incoming layer is laid out in the normal flow and the outgoing one is
 * pinned on top of it at the same place, so the container is always as tall
 * as what it is changing TO. A layer that is changed back to mid-fade keeps
 * its React identity (same key, same parent) and simply reverses from
 * wherever its opacity had got to.
 */
export function Crossfade({ id, children, style }: Props) {
  const [shown, setShown] = useState(id);
  const [leaving, setLeaving] = useState<string[]>([]);

  // Derived during render, React's pattern for state that follows a prop: the
  // swap lands in the same commit as the new id, so nothing renders a frame
  // with the new id and the old layers.
  if (id !== shown) {
    setLeaving((l) => [...l.filter((k) => k !== id), shown]);
    setShown(id);
  }

  // One flat keyed list, outgoing first so the incoming layer draws on top.
  // Flat matters: a layer only keeps its identity across the swap if it stays
  // among the same siblings, and a separate array for the outgoing ones would
  // remount the layer that just started leaving.
  const layers = [...leaving.map((k) => ({ k, out: true })), { k: shown, out: false }];

  return (
    <View style={style}>
      {layers.map(({ k, out }) => (
        <FadeLayer
          key={k}
          leaving={out}
          onGone={out ? () => setLeaving((l) => l.filter((x) => x !== k)) : undefined}
        >
          {children(k)}
        </FadeLayer>
      ))}
    </View>
  );
}

function FadeLayer({
  leaving,
  onGone,
  children,
}: {
  leaving: boolean;
  onGone?: () => void;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  // The parent hands a fresh closure every render; only the direction of the
  // fade should restart it, so the latest one is read through a ref.
  const gone = useRef(onGone);
  useEffect(() => {
    gone.current = onGone;
  });

  useEffect(() => {
    const done = () => gone.current?.();
    if (!leaving) {
      opacity.set(reduced ? 1 : withTiming(1, { duration: duration.slow, easing: easing.decel }));
      return;
    }
    if (reduced) {
      opacity.set(0);
      done();
      return;
    }
    // Out a little faster than in, on the exit curve, so the two never sit at
    // half opacity together looking like a double exposure.
    opacity.set(
      withTiming(0, { duration: duration.base, easing: easing.accel }, (finished) => {
        'worklet';
        if (finished) runOnJS(done)();
      }),
    );
  }, [leaving, reduced, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      style={[leaving ? styles.over : null, fade]}
      // The outgoing layer is on its way out: not something to read or tap.
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  over: { position: 'absolute', top: 0, left: 0, right: 0 },
});
