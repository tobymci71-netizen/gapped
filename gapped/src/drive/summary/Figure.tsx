import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Numeral, Text } from '@/components/Text';
import { color, font, maxFontScale, slant, space, type } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  unit?: string;
  /** What VoiceOver says for the figure: "25 minutes", "47 miles per hour". */
  spoken: string;
  /** The slanted hairline before every figure but a row's first. */
  divider?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * One figure in the summary's ruled row ("Duration / Average / Top speed"):
 * Stat's look — mono label over a wide-italic figure and its unit, open on
 * the night, a slanted rule between — read by VoiceOver as one sentence,
 * "Duration, 25 minutes", rather than three fragments.
 *
 * `children` go under the figure (the 0–60 slot's "Needs a standing start").
 */
export function Figure({ label, value, unit, spoken, divider, children, style }: Props) {
  return (
    <View
      style={[styles.figure, divider ? styles.withDivider : null, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${spoken}`}
    >
      {divider ? <View style={styles.divider} /> : null}
      <Text variant="mono" numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.row}>
        <Numeral
          size={type.numeral.size}
          style={styles.value}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={maxFontScale.numeral}
        >
          {value}
        </Numeral>
        {unit ? (
          <Text variant="label" style={styles.unit} numberOfLines={1}>
            {unit}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { flex: 1, gap: space.xs, paddingVertical: space.xs },
  withDivider: { paddingLeft: 18 },
  divider: {
    position: 'absolute',
    left: 0,
    top: 2,
    bottom: 2,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: color.hairline,
    transform: slant.transform,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  // ExtraBold, as the mock's stat figures; Numeral's Black is for heroes.
  value: { flexShrink: 1, fontFamily: font.display },
  unit: { color: color.text2, flexShrink: 0 },
});
