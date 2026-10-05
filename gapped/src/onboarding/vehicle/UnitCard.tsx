import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import type { UnitPref } from '@/drive/units';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { ChoiceMark, panel, RowLight } from '@/onboarding/ui/choice';
import { duration, easing } from '@/theme/motion';
import {
  color,
  font,
  italicOverhang,
  maxFontScale,
  space,
  textStyle,
  type,
} from '@/theme/tokens';

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

/**
 * One unit as a card: a night panel that lights up when chosen — the red
 * light down its left edge, its words turning white, the mark filling white
 * with a check (src/onboarding/ui/choice). The change crossfades on the
 * standard curve, so the light moves from one card to the other rather than
 * one blinking off as the other blinks on.
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

  const primaryStyle = useAnimatedStyle(() => ({
    color: interpolateColor(on.get(), [0, 1], [color.text2, color.text1]),
  }));

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
      <View style={styles.card}>
        <RowLight on={on} />
        <View style={styles.top}>
          <Animated.Text
            style={[styles.unit, primaryStyle]}
            numberOfLines={1}
            maxFontSizeMultiplier={maxFontScale.title}
          >
            {option.unit}
          </Animated.Text>
          <ChoiceMark on={on} />
        </View>
        <Animated.Text style={[styles.system, primaryStyle]}>{option.system}</Animated.Text>
        <Text variant="mono">{option.detail}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shared: { flex: 1 },
  // flexGrow, not flex: side by side the two cards stretch to the taller
  // one's height; stacked, each keeps its own content height.
  card: {
    ...panel,
    flexGrow: 1,
    minHeight: 112,
    padding: space.lg,
    gap: 2,
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.sm,
  },
  unit: {
    flexShrink: 1,
    fontFamily: font.display,
    ...textStyle(type.cardTitle),
    paddingRight: italicOverhang(type.cardTitle.size),
  },
  system: { fontFamily: font.bodyMedium, ...textStyle(type.callout) },
});
