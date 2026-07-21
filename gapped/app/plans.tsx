import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

/**
 * The published free-vs-Pro matrix — table stakes #13. Neither incumbent
 * publishes one anywhere and both get punished for it in reviews. This screen
 * ships before the paywall exists, and its contents are a product promise:
 * nothing moves from Free to Pro after launch.
 */
const MATRIX: { feature: string; free: boolean; pro: boolean }[] = [
  { feature: 'Record unlimited drives', free: true, pro: true },
  { feature: 'View your own trip history', free: true, pro: true },
  { feature: 'All your own stats (speed, G, 0–60)', free: true, pro: true },
  { feature: 'GPX / CSV export', free: true, pro: true },
  { feature: 'Share cards', free: true, pro: true },
  { feature: 'Friends & friends board', free: true, pro: true },
  { feature: 'Privacy zones & route trimming', free: true, pro: true },
  { feature: 'Global & country leaderboard placement', free: false, pro: true },
  { feature: 'Vehicle-class brackets', free: false, pro: true },
  { feature: 'Advanced telemetry breakdowns', free: false, pro: true },
  { feature: 'Telemetry overlay on your video', free: false, pro: true },
  { feature: 'Unlimited garage vehicles', free: false, pro: true },
  { feature: 'Cloud sync across devices', free: false, pro: true },
];

export default function PlansScreen() {
  const router = useRouter();
  return (
    <Screen footer={<Button label="Back" variant="secondary" onPress={() => router.back()} />}>
      <Text variant="headline">Free vs Pro</Text>
      <Text variant="body" style={styles.sub}>
        The whole matrix, published. Recording and viewing your own drives is free forever —
        paying is for competing.
      </Text>

      <Card style={styles.table}>
        <View style={styles.row}>
          <Text variant="caption" style={styles.featureCol} />
          <Text variant="caption" style={styles.tierCol}>
            FREE
          </Text>
          <Text variant="caption" style={[styles.tierCol, { color: color.accent }]}>
            PRO
          </Text>
        </View>
        {MATRIX.map((r) => (
          <View key={r.feature} style={styles.row}>
            <Text variant="caption" style={[styles.featureCol, { color: color.text1 }]}>
              {r.feature}
            </Text>
            <Text style={[styles.tierCol, { color: r.free ? color.success : color.text3 }]}>
              {r.free ? '✓' : '—'}
            </Text>
            <Text style={[styles.tierCol, { color: r.pro ? color.accent : color.text3 }]}>
              {r.pro ? '✓' : '—'}
            </Text>
          </View>
        ))}
      </Card>

      <Text variant="legal" style={styles.legal}>
        Pro pricing lands after the first release: one monthly and one annual price, 3-day free
        trial, no discount wheels, no one-time offers. The paywall only ever appears after your
        first recorded drive.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: space.md },
  table: { marginTop: space.xl, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  featureCol: { flex: 1 },
  tierCol: { width: 48, textAlign: 'center' },
  legal: { marginTop: space.lg },
});
