import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/Card';
import { Numeral, Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
};

export function Stat({ label, value, unit, accent }: Props) {
  return (
    <Card style={styles.card}>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
      <View style={styles.row}>
        {/* Single-line contract. Every stat on every screen renders through
            here, so a two-part duration ("1h 23m") or a five-digit distance
            must shrink to fit rather than wrap or push the unit out of the
            card. The unit never shrinks — it is two characters and losing it
            makes the number meaningless. */}
        <Numeral
          size={28}
          color={accent ? color.accent : color.text1}
          style={styles.value}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {value}
        </Numeral>
        {unit ? (
          <Text variant="caption" style={styles.unit} numberOfLines={1}>
            {unit}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: space.xs },
  label: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12, lineHeight: 15 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  value: { flexShrink: 1 },
  unit: { color: color.text3, flexShrink: 0 },
});
