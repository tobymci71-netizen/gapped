import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { haptic } from '@/lib/haptics';
import { duration, easing } from '@/theme/motion';
import { color, font, radius, space, textStyle, type } from '@/theme/tokens';
import { CheckGlyph } from './glyphs';

/** The mark's size at the default text size. */
const ICON = 20;
/** Icon box: wide enough for the widest mark, so every label starts on the same line. */
const ICON_BOX = 28;
/**
 * Marks grow with Dynamic Type, as SF Symbols do beside text, up to this
 * factor: past it a logo stops helping anyone read the row.
 */
const ICON_MAX_SCALE = 1.8;
/** The radio ring and the selected disc. */
const MARK = 22;

type Props = {
  label: string;
  /** What VoiceOver says instead of `label`, where the printed glyphs read badly. */
  spoken?: string;
  selected: boolean;
  onPress: () => void;
  /** Draws the icon at `size` in the colour given: white at rest, black once selected. */
  renderIcon: (color: string, size: number) => React.ReactNode;
};

/**
 * One answer in a single-select list — "How did you hear about us?".
 *
 * At rest a dark surface2 row with an empty ring; selected, the whole row
 * turns white with a black label and a black tick disc (docs/ONBOARDING.md,
 * "Selected row: white, black label, check"). A press lifts an unselected row
 * to surface3 for as long as the finger is down: the reference's touch
 * highlight, which is feedback and not a third state.
 *
 * The change is a colour crossfade over `duration.fast`, never a movement, so
 * it stays the same with Reduce Motion on. The icon cannot interpolate its
 * fill, so two copies — white and black — crossfade instead.
 */
export function SelectRow({ label, spoken, selected, onPress, renderIcon }: Props) {
  const on = useSharedValue(selected ? 1 : 0);
  const pressed = useSharedValue(0);
  const { fontScale } = useWindowDimensions();
  const iconScale = Math.min(Math.max(fontScale, 1), ICON_MAX_SCALE);
  const icon = Math.round(ICON * iconScale);
  const box = Math.round(ICON_BOX * iconScale);

  useEffect(() => {
    on.set(withTiming(selected ? 1 : 0, { duration: duration.fast, easing: easing.standard }));
  }, [selected, on]);

  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      on.value,
      [0, 1],
      [interpolateColor(pressed.value, [0, 1], [color.surface2, color.surface3]), color.text1],
    ),
  }));
  const labelColor = useAnimatedStyle(() => ({
    color: interpolateColor(on.value, [0, 1], [color.text1, color.onAccent]),
  }));
  const restLayer = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const onLayer = useAnimatedStyle(() => ({ opacity: on.value }));

  return (
    <PressableScale
      silent
      onPress={() => {
        // The app's existing selection tick, kept (docs/ONBOARDING.md, "Look
        // and motion"). Re-tapping the chosen row is not a change, so no tick.
        if (!selected) haptic.selection();
        onPress();
      }}
      onPressIn={() => {
        pressed.set(withTiming(1, { duration: duration.instant, easing: easing.standard }));
      }}
      onPressOut={() => {
        pressed.set(withTiming(0, { duration: duration.fast, easing: easing.standard }));
      }}
      accessibilityRole="radio"
      accessibilityLabel={spoken ?? label}
      accessibilityState={{ checked: selected }}
      style={styles.row}
    >
      <Animated.View style={[StyleSheet.absoluteFill, fill]} />
      <View style={{ width: box, height: box }}>
        <Animated.View style={[styles.layer, restLayer]}>
          {renderIcon(color.text1, icon)}
        </Animated.View>
        <Animated.View style={[styles.layer, onLayer]}>
          {renderIcon(color.onAccent, icon)}
        </Animated.View>
      </View>
      <Animated.Text style={[styles.label, labelColor]}>{label}</Animated.Text>
      <View style={styles.mark}>
        <Animated.View style={[styles.layer, restLayer]}>
          <View style={styles.ring} />
        </Animated.View>
        <Animated.View style={[styles.layer, onLayer]}>
          <View style={styles.disc}>
            <CheckGlyph size={14} color={color.text1} />
          </View>
        </Animated.View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    // minHeight, so a label at the largest text sizes grows the row instead
    // of being cut by it.
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  label: {
    flex: 1,
    fontFamily: font.bodyMedium,
    ...textStyle(type.body),
  },
  mark: { width: MARK, height: MARK },
  ring: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    borderWidth: 2,
    // text3 rather than hairline: the ring is the control's only boundary, and
    // hairline is 1.3:1 on surface2 where WCAG asks 3:1 of one.
    borderColor: color.text3,
  },
  disc: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    backgroundColor: color.onAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
