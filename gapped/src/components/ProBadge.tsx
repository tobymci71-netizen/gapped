import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '@/components/Text';
import { SHOW_PRO } from '@/config/flags';
import { goProRoute } from '@/config/plans';
import { color, glyph, textStyle } from '@/theme/tokens';

/** Chips grow with Dynamic Type, but not without limit: they sit beside content. */
const CHIP_MAX_SCALE = 2;

/**
 * The small "PRO" chip that marks a locked feature, in the same outlined
 * style as the board's SAMPLE and BENCHMARK chips. Decorative to VoiceOver:
 * whatever it sits on says "Gapped Pro" in its own label. It pins itself to
 * the start of its line; pass `style` to place it otherwise in a row.
 *
 * Draws nothing while SHOW_PRO is off: a chip names a plan that cannot be
 * bought yet. Every lock that wears one is off then too (SHOW_PRO is
 * PRO_LIMITS_ENFORCED), so this is the backstop, not the switch.
 */
export function ProBadge({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  if (!SHOW_PRO) return null;
  return (
    <View
      style={[styles.chip, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={styles.chipText} maxFontSizeMultiplier={CHIP_MAX_SCALE}>
        PRO
      </Text>
    </View>
  );
}

/**
 * Where a Pro lock leads: the published Free-vs-Pro matrix today, and the
 * paywall once purchases are wired. Onboarding's garage step locks too, so
 * the destination has to be reachable before onboarding ends: /plans sits
 * outside the onboarded guard (app/_layout.tsx), and the paywall must as well.
 *
 * A no-op while SHOW_PRO is off (goProRoute, src/config/plans.ts): /plans
 * only redirects then, and nothing should lead anywhere it cannot sell.
 */
export function useGoPro(): () => void {
  const router = useRouter();
  return useCallback(() => {
    const to = goProRoute();
    if (to) router.push(to);
  }, [router]);
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  chipText: { color: color.accent, ...textStyle(glyph.xs), letterSpacing: 1 },
});
