import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { PLAN_MATRIX, plansRedirect } from '@/config/plans';
import { useProfile } from '@/state/profile';
import { color, space } from '@/theme/tokens';

const included = (yes: boolean) => (yes ? 'included' : 'not included');

/**
 * Through iOS's largest standard text size (xxxLarge, which React Native
 * reports as a fontScale of 1.353) the matrix is a table: the feature, then a
 * Free and a Pro column under one row of headings. At the accessibility sizes
 * (1.786 and up), worked out from the type scale on a 375pt phone, the
 * columns cannot hold: "FREE" outgrows its 48pt column and slides off the
 * ticks it heads, and the feature column, squeezed between them, breaks
 * nine-letter words ("Cornering", "telemetry") mid-word at the largest sizes.
 * So each row stacks instead: the feature on a line of its own, full width,
 * and its own "Free ✓  Pro ✓" under it, which needs no shared heading.
 *
 * 1.4, not 1.35: xxxLarge is 1.353, and a cut at 1.35 stacked it too.
 */
const TABLE_MAX_SCALE = 1.4;

/**
 * /plans. While SHOW_PRO is off there is no Pro to compare against, so the
 * route redirects (plansRedirect, src/config/plans.ts): to the You tab, or to
 * onboarding for a profile that has not finished it. The screen stays for
 * when Pro ships. A wrapper rather than an early return inside the screen,
 * which would call its hooks conditionally.
 */
export default function PlansRoute() {
  const onboarded = useProfile((s) => s.onboarded);
  const redirect = plansRedirect(onboarded);
  return redirect ? <Redirect href={redirect} /> : <PlansScreen />;
}

/**
 * The published free-vs-Pro matrix — table stakes #13. The rows live in
 * src/config/plans.ts (PLAN_MATRIX), where the onboarding paywall's line about
 * what Pro adds is tested against them; this screen only draws them.
 */
function PlansScreen() {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > TABLE_MAX_SCALE;
  const onboarded = useProfile((s) => s.onboarded);
  // Plans can be the only screen in the stack (opened by a link on a cold
  // start), and back with nothing to go back to is silently dropped. It sits
  // outside the onboarding guard (app/_layout.tsx), so with no profile yet
  // that fallback is onboarding, not the tabs it would be refused.
  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace(onboarded ? '/(tabs)/drive' : '/onboarding');
  return (
    <Screen footer={<Button label="Back" variant="secondary" onPress={goBack} />}>
      <Text variant="headline">Free vs Pro</Text>
      <Text variant="body" style={styles.sub}>
        The whole matrix, published. Recording your drives and placing on the boards is free
        forever — paying is for going deeper.
      </Text>

      <Card style={styles.table}>
        {/*
          The column headings are for the eye only. Each row below speaks its
          own columns, so VoiceOver reading "FREE", "PRO" once at the top of a
          long table would only be noise. Stacked rows label themselves.
        */}
        {stacked ? null : (
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
        )}
        {/*
          One accessible element per row. As three bare Texts, VoiceOver read
          the feature, then "em dash", then "check mark", with nothing saying
          which glyph was Free and which was Pro — the one fact the table is
          here to state.
        */}
        {PLAN_MATRIX.map((r) => (
          <View
            key={r.feature}
            style={stacked ? styles.stackedRow : styles.row}
            accessible
            accessibilityLabel={`${r.feature}. Free: ${included(r.free)}. Pro: ${included(r.pro)}.`}
          >
            <Text
              variant="caption"
              style={[stacked ? undefined : styles.featureCol, { color: color.text1 }]}
            >
              {r.feature}
            </Text>
            {stacked ? (
              <View style={styles.tiers}>
                {/* Spans take the caption variant too, or they fall back to body size. */}
                <Text variant="caption">
                  Free{' '}
                  <Text variant="caption" style={{ color: r.free ? color.success : color.text3 }}>
                    {r.free ? '✓' : '—'}
                  </Text>
                </Text>
                <Text variant="caption" style={{ color: color.accent }}>
                  Pro{' '}
                  <Text variant="caption" style={{ color: r.pro ? color.accent : color.text3 }}>
                    {r.pro ? '✓' : '—'}
                  </Text>
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.tierCol, { color: r.free ? color.success : color.text3 }]}>
                  {r.free ? '✓' : '—'}
                </Text>
                <Text style={[styles.tierCol, { color: r.pro ? color.accent : color.text3 }]}>
                  {r.pro ? '✓' : '—'}
                </Text>
              </>
            )}
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: space.md },
  table: { marginTop: space.xl, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  stackedRow: { gap: space.xs },
  featureCol: { flex: 1 },
  tierCol: { minWidth: 48, textAlign: 'center' },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg },
});
