import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { PLAN_MATRIX } from '@/config/plans';
import { color, space } from '@/theme/tokens';

const included = (yes: boolean) => (yes ? 'included' : 'not included');

/**
 * The published free-vs-Pro matrix — table stakes #13. The rows live in
 * src/config/plans.ts (PLAN_MATRIX), where the onboarding paywall's line about
 * what Pro adds is tested against them; this screen only draws them.
 */
export default function PlansScreen() {
  const router = useRouter();
  // Plans can be the only screen in the stack (opened by a link on a cold
  // start), and back with nothing to go back to is silently dropped.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/drive'));
  return (
    <Screen footer={<Button label="Back" variant="secondary" onPress={goBack} />}>
      <Text variant="headline">Free vs Pro</Text>
      <Text variant="body" style={styles.sub}>
        The whole matrix, published. Recording and viewing your own drives is free forever —
        paying is for competing.
      </Text>

      <Card style={styles.table}>
        {/*
          The column headings are for the eye only. Each row below speaks its
          own columns, so VoiceOver reading "FREE", "PRO" once at the top of a
          thirteen-row table would only be noise.
        */}
        <View
          style={styles.row}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="caption" style={styles.featureCol} />
          <Text variant="caption" style={styles.tierCol}>
            FREE
          </Text>
          <Text variant="caption" style={[styles.tierCol, { color: color.accent }]}>
            PRO
          </Text>
        </View>
        {/*
          One accessible element per row. As three bare Texts, VoiceOver read
          the feature, then "em dash", then "check mark", with nothing saying
          which glyph was Free and which was Pro — the one fact the table is
          here to state.
        */}
        {PLAN_MATRIX.map((r) => (
          <View
            key={r.feature}
            style={styles.row}
            accessible
            accessibilityLabel={`${r.feature}. Free: ${included(r.free)}. Pro: ${included(r.pro)}.`}
          >
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
  tierCol: { minWidth: 48, textAlign: 'center' },
  legal: { marginTop: space.lg },
});
