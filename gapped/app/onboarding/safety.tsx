import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { OnboardingStep } from '@/components/OnboardingStep';
import { Text } from '@/components/Text';
import { useProfile } from '@/state/profile';
import { color, radius, space } from '@/theme/tokens';

const GUIDELINES = [
  'Obey local traffic laws and speed limits. Never drive recklessly.',
  'Start and stop recording only while safely parked.',
  'Use a phone holder, just like with any navigation app.',
  'Never touch your phone while driving. Eyes on the road.',
];

export default function SafetyStep() {
  const router = useRouter();
  const { acceptSafety, completeOnboarding } = useProfile();
  const [checked, setChecked] = useState(false);

  return (
    <OnboardingStep
      step={7}
      title="Before you drive"
      subtitle="Important reminders to stay safe."
      footer={
        <Button
          label="I agree — let's drive"
          disabled={!checked}
          onPress={() => {
            acceptSafety();
            completeOnboarding();
            router.replace('/(tabs)/drive');
          }}
        />
      }
    >
      <Card style={styles.card}>
        {GUIDELINES.map((g) => (
          <Text key={g} variant="body" style={styles.guideline}>
            {'•'} {g}
          </Text>
        ))}
      </Card>

      <Pressable
        onPress={() => setChecked((c) => !c)}
        style={styles.checkboxRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text variant="body" style={styles.checkboxLabel}>
          I acknowledge these guidelines and agree to drive responsibly.
        </Text>
      </Pressable>

      <Text variant="legal">
        You are solely responsible for your driving. Gapped is a tracking tool and does not
        encourage speeding or dangerous driving.
      </Text>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  guideline: { color: color.text1 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: radius.card / 2,
    borderWidth: 2,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { borderColor: color.accent, backgroundColor: color.accent },
  checkmark: { color: color.onAccent, fontWeight: '700' },
  checkboxLabel: { flex: 1 },
});
