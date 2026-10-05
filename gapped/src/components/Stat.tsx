import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Numeral, Text } from '@/components/Text';
import { alpha, color, font, glow, maxFontScale, slant, space, type } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  unit?: string;
  /**
   * The figure the screen is about (a drive's top speed). Marked with a small
   * red light before the label — a light, the one red thing in the row — not
   * by colouring the number, which stays white.
   */
  accent?: boolean;
  /**
   * A slanted hairline at the stat's left edge, separating it from the one
   * before it in a row (the drive summary's "Duration / Average / Top speed").
   * Give it to every stat but the first.
   */
  divider?: boolean;
  /**
   * What VoiceOver says for the figure, when the default (the value and its
   * unit in words, "47 miles per hour") is not right for it.
   */
  spoken?: string;
};

/** Units in words, so VoiceOver says "47 miles per hour", not "47 m p h". */
const SPOKEN_UNIT: Record<string, string> = {
  mph: 'miles per hour',
  'km/h': 'kilometres per hour',
  mi: 'miles',
  km: 'kilometres',
  s: 'seconds',
  min: 'minutes',
  h: 'hours',
};

/** The figure as VoiceOver should say it. A dash is a figure not had yet. */
function spokenFigure(value: string, unit?: string): string {
  if (value === '—' || value === '-') return 'none yet';
  return unit ? `${value} ${SPOKEN_UNIT[unit] ?? unit}` : value;
}

/**
 * One figure, open on the night: a mono label over a wide-italic number and
 * its unit. No box — a row of stats reads as a dashboard readout, not a grid
 * of cards. Flexes to share its row with its siblings.
 *
 * VoiceOver reads it as one sentence, "Top speed, 47 miles per hour", rather
 * than three fragments (the summary's Figure does the same).
 */
export function Stat({ label, value, unit, accent, divider, spoken }: Props) {
  return (
    <View
      style={[styles.stat, divider ? styles.withDivider : null]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${spoken ?? spokenFigure(value, unit)}`}
    >
      {divider ? <View style={styles.divider} /> : null}
      <View style={styles.labelRow}>
        {accent ? <View style={styles.led} /> : null}
        <Text variant="mono" style={styles.label} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <View style={styles.row}>
        {/* Single-line contract. Every stat on every screen renders through
            here, so a two-part duration ("1h 23m") or a five-digit distance
            must shrink to fit rather than wrap or push the unit out of its
            column. The unit never shrinks — it is two characters and losing it
            makes the number meaningless. */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, gap: space.xs, paddingVertical: space.xs },
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
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  led: {
    width: 14,
    height: 3,
    borderRadius: 1,
    backgroundColor: color.accent,
    transform: slant.transform,
    boxShadow: `0 0 ${glow.tight}px 1px ${alpha(color.accent, 0.8)}`,
  },
  label: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  // ExtraBold, as the mockups' stat figures; Numeral's Black is for heroes.
  value: { flexShrink: 1, fontFamily: font.display },
  unit: { color: color.text2, flexShrink: 0 },
});
