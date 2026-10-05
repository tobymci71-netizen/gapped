import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge } from '@/components/ProBadge';
import { Text } from '@/components/Text';
import { proLabel } from '@/drive/driveAccess';
import { color, slant, space, type } from '@/theme/tokens';

/**
 * A Stat whose figure is Pro: its label, and the PRO chip where the number
 * would be. Shaped like Stat so it sits in a row beside free figures, and
 * pressable to wherever Pro is sold (useGoPro). VoiceOver hears
 * "<label>, Gapped Pro"; the chip itself is decorative.
 *
 * `divider` is Stat's: the slanted hairline before every stat but a row's
 * first.
 */
export function ProLockedStat({
  label,
  onPress,
  divider,
}: {
  label: string;
  onPress: () => void;
  divider?: boolean;
}) {
  // The pressable is the row's flex item, exactly as Stat's root is, so a
  // locked figure is always as wide as the free one beside it.
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={proLabel(label)}
      style={[styles.stat, divider ? styles.withDivider : null]}
    >
      {divider ? <View style={styles.divider} /> : null}
      {/* Stat's label exactly, so a locked figure's label matches its
          neighbour's. */}
      <Text variant="mono" numberOfLines={2}>
        {label}
      </Text>
      {/* Takes the height the neighbouring figure sets, chip centred in it. */}
      <View style={styles.value}>
        <ProBadge />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, gap: space.xs, paddingVertical: space.xs, minHeight: 44 },
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
  value: { flex: 1, minHeight: type.numeral.lineHeight, justifyContent: 'center' },
});
