import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { OnboardingStep } from '@/components/OnboardingStep';
import { Text } from '@/components/Text';
import { SAFETY_ACKNOWLEDGEMENT } from '@/config/flags';
import { useProfile } from '@/state/profile';
import { color, font, radius, space, type, textStyle } from '@/theme/tokens';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function UsernameStep() {
  const router = useRouter();
  const { username, setUsername, completeOnboarding } = useProfile();
  const [value, setValue] = useState(username ?? '');

  const normalized = value.trim().toLowerCase();
  const valid = USERNAME_RE.test(normalized);

  return (
    <OnboardingStep
      step={6}
      title="Choose your username"
      subtitle="This is how you'll appear on the boards."
      footer={
        <Button
          label="Continue"
          disabled={!valid}
          onPress={() => {
            setUsername(normalized);
            // The acknowledgement is the reversible minimum for putting a
            // public speed board on public roads; SAFETY_ACKNOWLEDGEMENT=false
            // routes straight into the app without deleting anything.
            if (SAFETY_ACKNOWLEDGEMENT) {
              router.push('/onboarding/safety');
            } else {
              completeOnboarding();
              router.replace('/(tabs)/drive');
            }
          }}
        />
      }
    >
      <View style={styles.inputRow}>
        <Text variant="bodyMedium" style={styles.at}>
          @
        </Text>
        <TextInput
          style={styles.input}
          placeholder="username"
          placeholderTextColor={color.text3}
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
      </View>
      {value.length > 0 && !valid ? (
        <Text variant="caption" style={{ color: color.danger }}>
          3–20 characters: lowercase letters, numbers, underscores.
        </Text>
      ) : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderRadius: radius.card,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  at: { color: color.text3 },
  input: {
    flex: 1,
    color: color.text1,
    fontFamily: font.body,
    ...textStyle(type.body),
    paddingVertical: space.md,
  },
});
