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
        <Numeral size={28} color={accent ? color.accent : color.text1}>
          {value}
        </Numeral>
        {unit ? (
          <Text variant="caption" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: space.xs },
  label: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  unit: { color: color.text3 },
});
