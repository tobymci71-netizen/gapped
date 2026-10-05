import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/Text';
import {
  alpha,
  color,
  font,
  glow,
  italicOverhang,
  maxFontScale,
  radius,
  slant,
  space,
  textStyle,
  type,
} from '@/theme/tokens';

type Props = {
  /** What the figure is ("Distance"). */
  label: string;
  /** The figure, already formatted ("19.8"). */
  value: string;
  /** Its unit ("mi"). */
  unit?: string;
  /**
   * The small red light before the label. It marks the one hero figure on a
   * screen, so it is on by default and the plate should appear once.
   */
  led?: boolean;
  /** What VoiceOver says. Defaults to "<label>, <value> <unit>". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The slanted "number plate" that holds a screen's hero figure — the drive
 * summary's distance (Nightrun-Summary). A dark plate at the logo's slant
 * with a hairline edge, lifted off the map by a deep shadow; the figure in
 * the wide italic. Sizes itself to its content; place it.
 *
 * One element to VoiceOver, read as a sentence rather than three fragments.
 */
export function NumberPlate({ label, value, unit, led = true, accessibilityLabel, style }: Props) {
  return (
    <View
      style={[styles.plate, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `${label}, ${value}${unit ? ` ${unit}` : ''}`}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.face]} />
      <View style={styles.labelRow}>
        {led ? <View style={styles.led} /> : null}
        <Text variant="label">{label}</Text>
      </View>
      <View style={styles.figure}>
        <Text
          style={styles.value}
          numberOfLines={1}
          maxFontSizeMultiplier={maxFontScale.numeral}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {value}
        </Text>
        {unit ? (
          <Text style={styles.unit} maxFontSizeMultiplier={maxFontScale.numeral}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const PLATE_VALUE = type.heroNumeral;
const PLATE_UNIT = type.title;

const styles = StyleSheet.create({
  plate: {
    alignSelf: 'flex-start',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 22,
    paddingRight: space.xl,
  },
  face: {
    borderRadius: radius.sm,
    transform: slant.transform,
    backgroundColor: alpha(color.canvas, 0.9),
    borderWidth: 1,
    borderColor: color.hairline,
    // The plate is not a light: a shadow, never a glow.
    boxShadow: '0 18px 40px -16px rgba(0, 0, 0, 0.9)',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // A light: the one red thing on the plate, so it may glow.
  led: {
    width: 18,
    height: 3,
    borderRadius: 1,
    backgroundColor: color.accent,
    transform: slant.transform,
    boxShadow: `0 0 ${glow.tight}px 1px ${alpha(color.accent, 0.8)}`,
  },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: space.xs },
  value: {
    fontFamily: font.display,
    ...textStyle(PLATE_VALUE),
    paddingRight: italicOverhang(PLATE_VALUE.size),
    color: color.text1,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  unit: {
    fontFamily: font.display,
    ...textStyle(PLATE_UNIT),
    paddingRight: italicOverhang(PLATE_UNIT.size),
    color: color.text2,
  },
});
