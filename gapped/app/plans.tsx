import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { PLAN_MATRIX, plansRedirect } from '@/config/plans';
import { useProfile } from '@/state/profile';
import { color, space } from '@/theme/tokens';

const included = (yes: boolean) => (yes ? 'included' : 'not included');

/**
 * A tick or a dash for one plan's cell: a stroke check in white when the row
 * is included, a grey dash when not. Nothing on this screen is red: a tick
 * and a plan's name are marks, not lights (the PRO chip is white for the same
 * reason). Decorative; each row's own label says it in words.
 */
function Mark({ yes }: { yes: boolean }) {
  return yes ? (
    <Icon name="check" size={18} color={color.text1} strokeWidth={2} />
  ) : (
    <View style={styles.dash} />
  );
}

/**
 * Through iOS's largest standard text size (xxxLarge, which React Native
 * reports as a fontScale of 1.353) the matrix is a table: the feature, then a
 * Free and a Pro column under one row of headings. At the accessibility sizes
 * (1.786 and up), worked out from the type scale on a 375pt phone, the
 * columns cannot hold: "Free" outgrows its 48pt column and slides off the
 * ticks it heads, and the feature column, squeezed between them, breaks
 * nine-letter words ("Cornering", "telemetry") mid-word at the largest sizes.
 * So each row stacks instead: the feature on a line of its own, full width,
 * and its own labelled Free and Pro marks under it, which need no shared
 * heading.
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
      <Text variant="headline" accessibilityRole="header">
        Free vs Pro
      </Text>
      <Text variant="callout" style={styles.sub}>
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
            <Text variant="mono" style={styles.featureCol} />
            <Text variant="mono" style={styles.tierHead}>
              Free
            </Text>
            <Text variant="mono" style={[styles.tierHead, styles.proHead]}>
              Pro
            </Text>
          </View>
        )}
        {/*
          One accessible element per row. As three bare Texts, VoiceOver read
          the feature, then "em dash", then "check mark", with nothing saying
          which glyph was Free and which was Pro — the one fact the table is
          here to state.
        */}
        {PLAN_MATRIX.map((r, i) => (
          <View
            key={r.feature}
            // A rule between rows, and under the heading row when there is one.
            style={[
              stacked ? styles.stackedRow : styles.row,
              !stacked || i > 0 ? styles.ruled : null,
            ]}
            accessible
            accessibilityLabel={`${r.feature}. Free: ${included(r.free)}. Pro: ${included(r.pro)}.`}
          >
            <Text
              variant="bodySemibold"
              style={[stacked ? undefined : styles.featureCol, { color: color.text1 }]}
            >
              {r.feature}
            </Text>
            {stacked ? (
              <View style={styles.tiers}>
                <View style={styles.tier}>
                  <Text variant="mono">Free</Text>
                  <Mark yes={r.free} />
                </View>
                <View style={styles.tier}>
                  <Text variant="mono" style={styles.proHead}>
                    Pro
                  </Text>
                  <Mark yes={r.pro} />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.tierCol}>
                  <Mark yes={r.free} />
                </View>
                <View style={styles.tierCol}>
                  <Mark yes={r.pro} />
                </View>
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
  // Rows own their padding, so their rules run the panel's full width.
  table: { marginTop: space.xl, padding: 0, paddingBottom: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  stackedRow: { gap: space.xs, paddingHorizontal: space.lg, paddingVertical: space.md },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color.divider },
  featureCol: { flex: 1 },
  tierHead: { minWidth: 48, textAlign: 'center', color: color.text2 },
  // Pro's heading a step brighter than Free's, in white rather than red.
  proHead: { color: color.text1 },
  tierCol: { minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, rowGap: space.xs },
  tier: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dash: { width: 12, height: StyleSheet.hairlineWidth * 2, backgroundColor: color.text3 },
});
