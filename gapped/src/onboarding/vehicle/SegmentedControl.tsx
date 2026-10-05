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
import { color, font, radius, slant, space, textStyle, type } from '@/theme/tokens';

export type Segment<K extends string> = { key: K; label: string };

type Props<K extends string> = {
  segments: readonly Segment<K>[];
  value: K;
  onChange: (key: K) => void;
};

/** Space between the segments' plates. */
const GAP = space.sm;

/** Apple's minimum touch target, and the plates' height. */
const SEGMENT_HEIGHT = 44;

/**
 * How far a slanted plate's corner leans past its box. The control is inset by
 * this so the outer ends keep their slant: in a scroll view, which clips at
 * its edges, the first and last plates were cut square at the gutter.
 */
const LEAN = Math.ceil((SEGMENT_HEIGHT / 2) * slant.tan);

/**
 * Segments as slanted plates at the logo's lean, a white plate sliding to the
 * chosen one — Car | Motorbike on the ride step and in the garage. The Ranks
 * tab's World | Country | Friends, in the same hand (Nightrun-Ranks).
 *
 * White with a dark label, not red: the selected one of a set is a white
 * plate (SlantTag 'white'), and red is kept for light. The plate travels on
 * the entering curve, no spring, so it settles rather than bounces; reduced
 * motion moves it without travel.
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
  const segmentWidth = width > 0 ? (width - GAP * (segments.length - 1)) / segments.length : 0;
  const pitch = segmentWidth + GAP;

  /** The thumb's offset from the first segment, in points. */
  const x = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (!segmentWidth) return;
    const target = index * pitch;
    // The first placement is not a movement: the thumb starts where it
    // belongs instead of sliding in from the left edge on mount.
    if (reduced || !placed.get()) {
      x.set(target);
      placed.set(true);
      return;
    }
    x.set(withTiming(target, { duration: duration.base, easing: easing.decel }));
  }, [index, segmentWidth, pitch, reduced, x, placed]);

  // The slant rides in the same transform: an animated transform replaces a
  // static one rather than adding to it.
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, ...slant.transform],
  }));

  return (
    <View style={styles.inset}>
      <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* The segments' plates, under the white one that slides over them. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.track]}>
          {segments.map((s) => (
            <View key={s.key} style={styles.plate} />
          ))}
        </View>
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
                pitch={pitch}
                segmentWidth={segmentWidth}
                selected={selected}
              />
            </PressableScale>
          );
        })}
      </View>
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
  pitch,
  segmentWidth,
  selected,
}: {
  label: string;
  index: number;
  x: SharedValue<number>;
  /** A segment's width plus the gap after it: how far apart the plates sit. */
  pitch: number;
  segmentWidth: number;
  selected: boolean;
}) {
  const style = useAnimatedStyle(() => {
    // Before the track is measured there is no white plate, so the chosen
    // label sits on the bare night: white there, not the dark ink it wears
    // on the plate, or the first frame shows a blank segment.
    if (!segmentWidth) return { color: selected ? color.text1 : color.text2 };
    const covered = Math.max(0, 1 - Math.abs(x.get() - index * pitch) / segmentWidth);
    return { color: interpolateColor(covered, [0, 1], [color.text2, color.onLight]) };
  });
  return (
    <Animated.Text style={[styles.label, style]} numberOfLines={2}>
      {label}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: LEAN },
  track: { flexDirection: 'row', gap: GAP },
  // The white plate. Skewed with the plates it slides over; its label is not.
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.xs,
    backgroundColor: color.text1,
  },
  segment: {
    flex: 1,
    minHeight: SEGMENT_HEIGHT,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Each segment's own outlined plate: a dark panel, so an unchosen segment
  // still reads as something to tap. outline, not hairline: it is the
  // control's only boundary.
  plate: {
    flex: 1,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: color.outline,
    backgroundColor: color.surface1,
    transform: slant.transform,
  },
  // One weight for both states: a label that turned semibold on selection
  // would change width and nudge its neighbour mid-slide.
  label: {
    fontFamily: font.bodySemibold,
    ...textStyle(type.callout),
    textAlign: 'center',
  },
});
