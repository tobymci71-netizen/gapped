import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { color, space } from '@/theme/tokens';

export const TOTAL_STEPS = 7;

type Props = {
  step: number; // 1-based
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
  /** Pass false when the body hosts its own list (FlashList can't nest in a ScrollView). */
  scroll?: boolean;
};

export function OnboardingStep({ step, title, subtitle, children, footer, scroll }: Props) {
  const router = useRouter();
  return (
    <Screen footer={footer} scroll={scroll}>
      {/* Header row: back chevron left of the linear progress track. */}
      <View style={styles.headerRow}>
        <PressableScale
          onPress={() => {
          haptic.press();
          router.back();
        }}
          silent
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </PressableScale>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
        </View>
      </View>
      <Text variant="headline" style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      <View style={styles.body}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
  },
  back: {
    // 44×44 is Apple's minimum touch target; this was 32×32.
    width: 44,
    height: 44,
    marginLeft: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { color: color.text1, fontSize: 30, lineHeight: 34 },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.surface2,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.accent,
  },
  title: { marginTop: space.xxl },
  subtitle: { marginTop: space.md },
  body: { flex: 1, marginTop: space.xl, gap: space.md },
});
