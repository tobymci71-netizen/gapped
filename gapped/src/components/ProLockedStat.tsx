import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/Card';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge } from '@/components/ProBadge';
import { Text } from '@/components/Text';
import { proLabel } from '@/drive/driveAccess';
import { space, textStyle, type } from '@/theme/tokens';

/**
 * A Stat whose figure is Pro: its label, and the PRO chip where the number
 * would be. Shaped like Stat so it sits in a grid row beside free figures,
 * and pressable to wherever Pro is sold (useGoPro). VoiceOver hears
 * "<label>, Gapped Pro"; the chip itself is decorative.
 */
export function ProLockedStat({ label, onPress }: { label: string; onPress: () => void }) {
  // The Card is the row's flex item, exactly as in Stat, so a locked figure is
  // always as wide as the free one beside it. Wrapped the other way round (a
  // pressable around the card) it came out narrower in the same row.
  return (
    <Card style={styles.card}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={proLabel(label)}
        style={styles.press}
      >
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
        <View style={styles.value}>
          <ProBadge />
        </View>
      </PressableScale>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  press: { flex: 1, gap: space.xs, minHeight: 44 },
  // Stat's label exactly, so a locked figure's label matches its neighbour's.
  label: { textTransform: 'uppercase', letterSpacing: 0.6, ...textStyle(type.label) },
  // Takes the height the neighbouring figure sets, chip centred in it.
  value: { flex: 1, justifyContent: 'center' },
});
