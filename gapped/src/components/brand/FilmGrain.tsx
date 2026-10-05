import { Canvas, ColorMatrix, Fill, FractalNoise, Group } from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { ambient } from '@/theme/motion';

/**
 * Noise to alpha, as the mockups' feColorMatrix does it: white everywhere,
 * alpha = (2.2 × noise − 1.1) × opacity, so only the brighter half of the
 * noise shows, as specks. Skia's translate column is normalised (0–1), like
 * SVG's.
 *
 * The opacity has to be in the matrix. This filter writes alpha from the
 * noise and ignores the alpha it is given, so an opacity on the paint or a
 * parent group is thrown away — which is how the grain first shipped at
 * several times its intended strength.
 */
export function grainMatrix(opacity: number): number[] {
  const o = Math.min(1, Math.max(0, opacity));
  return [
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    2.2 * o, 0, 0, 0, -1.1 * o,
  ];
}

/** The mockups' five jitter positions (pt), one every ambient.grainStep ms. */
const OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-14, 9],
  [11, -13],
  [-7, 15],
  [15, 4],
];

type Props = {
  /** Default 0.08: felt, not seen. The welcome hero goes to 0.1. */
  opacity?: number;
  /** Jitter the grain like film running through a gate. Default true. */
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Film grain over a hero scene. Lay it last, over the artwork and under the
 * text; it fills its parent and takes no touches.
 *
 * Skia FractalNoise on the GPU, so the grain costs no texture. The jitter is a
 * Reanimated value that steps five times a cycle on the UI thread, and the
 * canvas redraws only when it steps — not every frame. It stands still under
 * Reduce Motion and whenever the screen is not focused (a tab in the
 * background, a screen under a pushed one).
 *
 * Uses the navigation focus, so render it inside a screen.
 */
export function FilmGrain({ opacity = 0.08, animated = true, style }: Props) {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const live = animated && !reduced && focused;
  const step = useSharedValue(0);

  useEffect(() => {
    if (!live) {
      cancelAnimation(step);
      return;
    }
    step.set(
      withRepeat(
        withSequence(
          ...[1, 2, 3, 4, 0].map((k) =>
            withDelay(ambient.grainStep, withTiming(k, { duration: 0 })),
          ),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(step);
  }, [live, step]);

  const transform = useDerivedValue(() => {
    const [x, y] = OFFSETS[Math.round(step.get()) % OFFSETS.length];
    return [{ translateX: x }, { translateY: y }];
  });

  return (
    <Canvas
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, style]}
    >
      {/* Fill paints the whole canvas; the group's transform moves only the
          noise underneath it, so the canvas never needs measuring. */}
      <Group transform={transform}>
        <Fill>
          <FractalNoise freqX={1} freqY={1} octaves={2} seed={7} />
          <ColorMatrix matrix={grainMatrix(opacity)} />
        </Fill>
      </Group>
    </Canvas>
  );
}
