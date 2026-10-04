import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { color, glyph, textStyle } from '@/theme/tokens';

/** Chips grow with Dynamic Type, but not without limit: they sit beside content. */
const CHIP_MAX_SCALE = 2;

/**
 * The small "PRO" chip that marks a locked feature, in the same outlined
 * style as the board's SAMPLE and BENCHMARK chips. Decorative to VoiceOver:
 * whatever it sits on says "Gapped Pro" in its own label.
 */
export function ProBadge() {
  return (
    <View
      style={styles.chip}
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
 * paywall once purchases are wired.
 */
export function useGoPro(): () => void {
  const router = useRouter();
  return useCallback(() => router.push('/plans'), [router]);
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
