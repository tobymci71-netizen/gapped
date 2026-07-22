import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
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
  return (
    <Screen footer={footer} scroll={scroll}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
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
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.surface2,
    marginTop: space.sm,
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
