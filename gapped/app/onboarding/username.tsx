import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { OnboardingStep } from '@/components/OnboardingStep';
import { Text } from '@/components/Text';
import { SAFETY_ACKNOWLEDGEMENT } from '@/config/flags';
import { haptic } from '@/lib/haptics';
import { isUsernameAvailable } from '@/lib/sync';
import { isValidUsername, normaliseUsername } from '@/lib/username';
import { useProfile } from '@/state/profile';
import { color, font, radius, space, type, textStyle } from '@/theme/tokens';

export default function UsernameStep() {
  const router = useRouter();
  const { username, setUsername, completeOnboarding } = useProfile();
  const [value, setValue] = useState(username ?? '');
  const [checking, setChecking] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const normalized = normaliseUsername(value);
  const valid = isValidUsername(normalized);

  // A taken name used to sail through here; the clash surfaced only later, as
  // a silent server-side failure that dropped the username and country. Ask
  // first. Offline or with no backend the answer is null and the step carries
  // on as before — the You tab's "choose another" card still catches a late
  // clash.
  const onContinue = async () => {
    setChecking(true);
    const free = await isUsernameAvailable(normalized).catch(() => null);
    if (!mounted.current) return;
    setChecking(false);
    if (free === false) {
      haptic.error();
      setTaken(normalized);
      return;
    }
    setUsername(normalized);
    // The acknowledgement is the reversible minimum for putting a
    // public speed board on public roads; SAFETY_ACKNOWLEDGEMENT=false
    // routes straight into the app without deleting anything.
    if (SAFETY_ACKNOWLEDGEMENT) {
      router.navigate('/onboarding/safety');
    } else {
      completeOnboarding();
      router.replace('/(tabs)/drive');
    }
  };

  return (
    <OnboardingStep
      step={6}
      title="Choose your username"
      subtitle="This is how you'll appear on the boards."
      footer={
        <Button
          label={checking ? 'Checking…' : 'Continue'}
          disabled={!valid || checking || taken === normalized}
          onPress={() => void onContinue()}
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
          placeholderTextColor={color.text2}
          value={value}
          onChangeText={setValue}
          editable={!checking}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
      </View>
      {value.length > 0 && !valid ? (
        <Text variant="caption" style={{ color: color.danger }}>
          3–20 characters: lowercase letters, numbers, underscores.
        </Text>
      ) : taken === normalized ? (
        <Text variant="caption" accessibilityLiveRegion="polite" style={{ color: color.danger }}>
          @{taken} is taken. Try another.
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
