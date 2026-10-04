import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing } from '@/theme/motion';
import { color, font, radius, space, textStyle, type } from '@/theme/tokens';

export type Segment<K extends string> = { key: K; label: string };

type Props<K extends string> = {
  segments: readonly Segment<K>[];
  value: K;
  onChange: (key: K) => void;
};

/** Inset of the thumb inside the track. */
const INSET = 4;

/**
 * A pill track with a white thumb that slides to the chosen segment — Car |
 * Motorbike on the ride step and in the garage.
 *
 * White with a black label, not lime: selection in this flow is a white fill
 * (the unit cards, the attribution rows), and lime is kept for progress,
 * checks and links (docs/ONBOARDING.md, "Look and motion"). The thumb travels
 * on the entering curve, no spring, so it settles rather than bounces;
 * reduced motion moves it without travel.
 *
 * Each segment is its own 44pt button carrying its selected state, which is
 * how VoiceOver reads UIKit's segmented control: "Car, selected, button".
 */
export function SegmentedControl<K extends string>({ segments, value, onChange }: Props<K>) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    segments.findIndex((s) => s.key === value),
  );
  const segmentWidth = width > 0 ? (width - INSET * 2) / segments.length : 0;

  /** The thumb's offset from the first segment, in points. */
  const x = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (!segmentWidth) return;
    const target = index * segmentWidth;
    // The first placement is not a movement: the thumb starts where it
    // belongs instead of sliding in from the left edge on mount.
    if (reduced || !placed.get()) {
      x.set(target);
      placed.set(true);
      return;
    }
    x.set(withTiming(target, { duration: duration.base, easing: easing.decel }));
  }, [index, segmentWidth, reduced, x, placed]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { width: segmentWidth }, thumbStyle]}
        />
      ) : null}
      {segments.map((s, i) => {
        const selected = s.key === value;
        return (
          <PressableScale
            key={s.key}
            silent
            onPress={() => {
              if (selected) return;
              haptic.selection();
              onChange(s.key);
            }}
            accessibilityRole="button"
            accessibilityLabel={s.label}
            accessibilityState={{ selected }}
            style={styles.segment}
          >
            <SegmentLabel
              label={s.label}
              index={i}
              x={x}
              segmentWidth={segmentWidth}
              selected={selected}
            />
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * A segment's label, coloured by how much of the thumb is under it rather than
 * by the selection. Switched on selection, the new label turned black the
 * moment it was tapped — black on the dark track — and stayed unreadable for
 * the whole slide. Tied to the thumb, it darkens exactly as white arrives
 * beneath it.
 */
function SegmentLabel({
  label,
  index,
  x,
  segmentWidth,
  selected,
}: {
  label: string;
  index: number;
  x: SharedValue<number>;
  segmentWidth: number;
  selected: boolean;
}) {
  const style = useAnimatedStyle(() => {
    // Before the track is measured there is no thumb, so the chosen label
    // sits on the bare dark track: white there, not the black it wears on
    // the thumb, or the first frame shows a blank segment.
    if (!segmentWidth) return { color: selected ? color.text1 : color.text2 };
    const covered = Math.max(0, 1 - Math.abs(x.get() - index * segmentWidth) / segmentWidth);
    return { color: interpolateColor(covered, [0, 1], [color.text2, color.onAccent]) };
  });
  return (
    <Animated.Text style={[styles.label, style]} numberOfLines={2}>
      {label}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: INSET,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
  },
  thumb: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: radius.pill,
    backgroundColor: color.text1,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // One weight for both states: a label that turned semibold on selection
  // would change width and nudge its neighbour mid-slide.
  label: {
    fontFamily: font.bodySemibold,
    ...textStyle(type.body),
    textAlign: 'center',
  },
});
