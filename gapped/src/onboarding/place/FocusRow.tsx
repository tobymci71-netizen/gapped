import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { OnSurface, Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import type { ChoiceOption } from '@/onboarding/flow';
import type { Focus } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { color, radius, space } from '@/theme/tokens';
import { CheckIcon, GaugeIcon, PeopleIcon, StopwatchIcon, TrophyIcon } from './icons';

/** One glyph per focus, shared by the question's rows and the proof's pill. */
export function FocusIcon({ focus, size, tint }: { focus: Focus; size?: number; tint: string }) {
  switch (focus) {
    case 'topSpeed':
      return <GaugeIcon size={size} color={tint} />;
    case 'zeroToSixty':
      return <StopwatchIcon size={size} color={tint} />;
    case 'localRanking':
      return <TrophyIcon size={size} color={tint} />;
    case 'beatFriends':
      return <PeopleIcon size={size} color={tint} />;
  }
}

/** The radio's diameter. Inside a 60pt row, so the row is the touch target. */
const RADIO = 24;

/**
 * A single-select row on "What matters to your drive?": glyph, title, the grey
 * line under it, and a radio on the right that fills lime when chosen
 * (docs/ONBOARDING.md, "Focus"). Announced as a radio, checked or not, so
 * VoiceOver says what kind of choice this is as well as what it says.
 */
export function FocusRow({
  option,
  selected,
  onPress,
}: {
  option: ChoiceOption<Focus>;
  selected: boolean;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    const to = selected ? 1 : 0;
    on.set(reduced ? to : withTiming(to, { duration: duration.fast, easing: easing.decel }));
  }, [selected, reduced, on]);

  // The fill grows from 60% as it fades in: a dot being set, not a flash.
  const fill = useAnimatedStyle(() => ({
    opacity: on.get(),
    transform: [{ scale: 0.6 + 0.4 * on.get() }],
  }));

  return (
    <PressableScale
      silent
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={[option.spoken ?? option.label, option.sublabel].filter(Boolean).join(', ')}
      style={[styles.row, selected && styles.rowSelected]}
    >
      <OnSurface>
        <FocusIcon focus={option.key} tint={selected ? color.text1 : color.text2} />
        <View style={styles.text}>
          <Text variant="bodyMedium">{option.label}</Text>
          {option.sublabel ? <Text variant="caption">{option.sublabel}</Text> : null}
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          <Animated.View style={[styles.radioFill, fill]}>
            <CheckIcon size={14} color={color.onAccent} />
          </Animated.View>
        </View>
      </OnSurface>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    // 60, not more: four rows, the heading and the pinned Continue have to
    // share a 667pt screen, and every point here is four points there.
    minHeight: 60,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
  },
  // A step lighter, so the chosen row reads as chosen even before the eye
  // reaches the radio at the far edge.
  rowSelected: { backgroundColor: color.surface3 },
  text: { flex: 1, gap: 2 },
  radio: {
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    borderWidth: 1.5,
    borderColor: color.text3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: color.accent },
  radioFill: {
    position: 'absolute',
    top: -1.5,
    left: -1.5,
    right: -1.5,
    bottom: -1.5,
    borderRadius: RADIO / 2,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
