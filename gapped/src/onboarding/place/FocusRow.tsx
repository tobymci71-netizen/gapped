import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { OnSurface, Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import type { ChoiceOption } from '@/onboarding/flow';
import { ChoiceMark, panel, RowLight } from '@/onboarding/ui/choice';
import type { Focus } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { color, space } from '@/theme/tokens';
import { GaugeIcon, PeopleIcon, StopwatchIcon, TrophyIcon } from './icons';

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

/**
 * A single-select row on "What matters to your drive?": glyph, title, the
 * line under it, and a radio mark on the right (docs/ONBOARDING.md, "Focus").
 * A night panel; the chosen one lights up — the red light down its left
 * edge, its words white, the mark filled white (src/onboarding/ui/choice).
 * Announced as a radio, checked or not, so VoiceOver says what kind of choice
 * this is as well as what it says.
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
      style={styles.row}
    >
      <RowLight on={on} />
      <OnSurface>
        <FocusIcon focus={option.key} tint={selected ? color.text1 : color.text2} />
        <View style={styles.text}>
          <Text variant="bodyMedium" style={!selected && styles.labelRest}>
            {option.label}
          </Text>
          {option.sublabel ? <Text variant="caption">{option.sublabel}</Text> : null}
        </View>
        <ChoiceMark on={on} />
      </OnSurface>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    ...panel,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    // 60, not more: four rows, the heading and the pinned Continue have to
    // share a 667pt screen, and every point here is four points there.
    minHeight: 60,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  text: { flex: 1, gap: 2 },
  labelRest: { color: color.text2 },
});
