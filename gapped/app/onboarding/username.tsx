import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { OnboardingStep } from '@/components/OnboardingStep';
import { Text } from '@/components/Text';
import { useProfile } from '@/state/profile';
import { color, font, radius, space, type } from '@/theme/tokens';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function UsernameStep() {
  const router = useRouter();
  const { username, setUsername } = useProfile();
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
            router.push('/onboarding/safety');
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
    height: 56,
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
    fontSize: type.body,
    height: '100%',
  },
});
