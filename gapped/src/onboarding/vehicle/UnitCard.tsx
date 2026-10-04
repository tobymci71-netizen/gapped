import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import type { UnitPref } from '@/drive/units';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing } from '@/theme/motion';
import { color, font, radius, space, textStyle, type } from '@/theme/tokens';
import { CheckIcon, RingIcon } from './icons';

export type UnitOption = {
  key: UnitPref;
  /** The big label: what the speedometer will read. */
  unit: string;
  system: string;
  /** Distance and length units, as printed. */
  detail: string;
  /** What VoiceOver says for the card; the printed abbreviations read badly. */
  spoken: string;
};

/** docs/ONBOARDING.md, step 5: "km/h · Metric · km · m" and "mph · Imperial · mi · ft". */
export const UNIT_OPTIONS: readonly UnitOption[] = [
  {
    key: 'metric',
    unit: 'km/h',
    system: 'Metric',
    detail: 'km · m',
    spoken: 'Kilometres per hour. Metric: kilometres and metres',
  },
  {
    key: 'imperial',
    unit: 'mph',
    system: 'Imperial',
    detail: 'mi · ft',
    spoken: 'Miles per hour. Imperial: miles and feet',
  },
];

/** The detail line on a white card: black, quietened to read as secondary. */
const DETAIL_ON_WHITE_OPACITY = 0.7;

/**
 * One unit as a card. Selected is the flow's selected state — white fill,
 * black text, a check — and the change crossfades fill, text and mark
 * together on the standard curve, so the white moves from one card to the
 * other rather than one card blinking off as the other blinks on.
 */
export function UnitCard({
  option,
  selected,
  onSelect,
  shared = true,
}: {
  option: UnitOption;
  selected: boolean;
  onSelect: () => void;
  /** Side by side, sharing the row's width. False when the cards stack. */
  shared?: boolean;
}) {
  const reduced = useReducedMotion();
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    const target = selected ? 1 : 0;
    on.set(
      reduced ? target : withTiming(target, { duration: duration.fast, easing: easing.standard }),
    );
  }, [selected, reduced, on]);

  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.get(), [0, 1], [color.surface2, color.text1]),
  }));
  const primaryStyle = useAnimatedStyle(() => ({
    color: interpolateColor(on.get(), [0, 1], [color.text1, color.onAccent]),
  }));
  const detailStyle = useAnimatedStyle(() => ({
    color: interpolateColor(on.get(), [0, 1], [color.text2, color.onAccent]),
    opacity: 1 - (1 - DETAIL_ON_WHITE_OPACITY) * on.get(),
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - on.get() }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: on.get() }));

  return (
    <PressableScale
      onPress={() => {
        if (selected) return;
        haptic.selection();
        onSelect();
      }}
      silent
      // One of two, like the focus and attribution rows (SelectRow): a radio
      // in the step's radiogroup, read as "checked" rather than "selected".
      accessibilityRole="radio"
      accessibilityLabel={option.spoken}
      accessibilityState={{ checked: selected }}
      style={shared ? styles.shared : undefined}
    >
      <Animated.View style={[styles.card, cardStyle]}>
        <View style={styles.top}>
          <Animated.Text style={[styles.unit, primaryStyle]} numberOfLines={1}>
            {option.unit}
          </Animated.Text>
          <View style={styles.mark}>
            <Animated.View style={[styles.markLayer, ringStyle]}>
              <RingIcon />
            </Animated.View>
            <Animated.View style={[styles.markLayer, checkStyle]}>
              <CheckIcon size={20} color={color.onAccent} />
            </Animated.View>
          </View>
        </View>
        <Animated.Text style={[styles.system, primaryStyle]}>{option.system}</Animated.Text>
        <Animated.Text style={[styles.detail, detailStyle]}>{option.detail}</Animated.Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shared: { flex: 1 },
  // flexGrow, not flex: side by side the two cards stretch to the taller
  // one's height; stacked, each keeps its own content height.
  card: {
    flexGrow: 1,
    minHeight: 112,
    padding: space.lg,
    borderRadius: radius.card,
    gap: 2,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.sm,
  },
  unit: { flexShrink: 1, fontFamily: font.display, ...textStyle(type.cardTitle) },
  mark: { width: 24, height: 24 },
  markLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  system: { fontFamily: font.bodyMedium, ...textStyle(type.body) },
  detail: { fontFamily: font.body, ...textStyle(type.caption) },
});
