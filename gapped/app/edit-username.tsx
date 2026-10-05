import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { changeUsername } from '@/lib/sync';
import { USERNAME_SAVE_FAILED } from '@/lib/username';
import { CheckGlyph } from '@/onboarding/identity/glyphs';
import { useUsernameField } from '@/onboarding/identity/useUsernameField';
import { useProfile } from '@/state/profile';
import { color, font, radius, space, textStyle, type } from '@/theme/tokens';

/** The field's border, present in every state so turning orange never shifts the text. */
const FIELD_BORDER = 1.5;

/**
 * Change username, from Settings.
 *
 * The same field as onboarding's username step (useUsernameField): the same
 * rules, the same denylist mirror, the same live availability check. What
 * differs is the save. A rename has a working name to fall back on, so the
 * server is asked first (changeUsername) and the name changes on this phone
 * only once the server has taken it. A refusal — taken in the meantime, or
 * not allowed by the server's longer denylist — lands under the field, and an
 * unanswered save says so and changes nothing.
 */
export default function EditUsernameScreen() {
  const router = useRouter();
  // Reached from Settings; a cold-start deep link has nothing beneath it.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const stored = useProfile((s) => s.username);
  // Set when the server refused the current name (taken, or not allowed).
  const storedRefused = useProfile((s) => s.usernameTaken);

  const { value, setValue, field, settle, refuse } = useUsernameField(stored ?? '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Saving the name already held changes nothing, and saving a name the
  // server already refused would only be refused again.
  const unchanged = field.name === (stored ?? '');
  const canSave = field.canContinue && !unchanged && !saving;

  // The orange caption, spoken as it appears, as on the onboarding step. iOS
  // only: on Android the caption's live region already reads it.
  useEffect(() => {
    if (Platform.OS === 'ios' && field.tone === 'error') {
      AccessibilityInfo.announceForAccessibility(field.caption);
    }
  }, [field.tone, field.caption]);

  const onSave = async () => {
    if (!canSave) return;
    const name = field.name;
    setSaving(true);
    setProblem(null);
    const result = await changeUsername(name);
    setSaving(false);
    switch (result) {
      case 'saved':
        haptic.selection();
        AccessibilityInfo.announceForAccessibility(`Username changed to @${name}`);
        goBack();
        return;
      case 'taken':
      case 'not_allowed':
        haptic.error();
        refuse(name, result);
        return;
      case 'failed':
        haptic.error();
        setProblem(USERNAME_SAVE_FAILED);
        AccessibilityInfo.announceForAccessibility(USERNAME_SAVE_FAILED);
        return;
    }
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label={saving ? 'Saving…' : 'Save'}
            onPress={onSave}
            disabled={!canSave}
          />
          <Button label="Cancel" variant="secondary" onPress={goBack} disabled={saving} />
        </View>
      }
    >
      <Text variant="headline" accessibilityRole="header">
        Change username
      </Text>
      <Text variant="body" style={styles.sub}>
        This is how you appear on the boards and to friends. Your runs and friends stay with you,
        and your old name is freed for anyone to take.
      </Text>

      {storedRefused && stored ? (
        <Card style={styles.refused}>
          <Text variant="body">@{stored} couldn&apos;t be used on the boards. Pick another.</Text>
        </Card>
      ) : null}

      <View
        style={[
          styles.field,
          { borderColor: field.tone === 'error' ? color.warning : color.surface2 },
        ]}
      >
        <Text variant="bodyMedium" style={styles.at}>
          @
        </Text>
        <TextInput
          style={styles.input}
          value={value}
          // Shown as it will be stored, as on the onboarding step.
          onChangeText={(t) => {
            setValue(t.toLowerCase());
            setProblem(null);
          }}
          onBlur={() => settle(value)}
          onSubmitEditing={() => (canSave ? onSave() : settle(value))}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="username"
          placeholderTextColor={color.text3}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          keyboardType="ascii-capable"
          maxLength={20}
          editable={!saving}
          accessibilityLabel="Username"
          accessibilityHint={field.caption}
        />
        {field.checking ? (
          <ActivityIndicator size="small" color={color.text3} accessibilityLabel="Checking" />
        ) : field.tone === 'ok' ? (
          <CheckGlyph size={20} color={color.accent} />
        ) : null}
      </View>

      <Text
        variant="caption"
        accessibilityLiveRegion="polite"
        style={[styles.caption, field.tone === 'error' && styles.captionError]}
      >
        {field.caption}
      </Text>
      {problem ? (
        <Text variant="caption" style={styles.problem}>
          {problem}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: space.sm },
  refused: { marginTop: space.lg },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 56,
    marginTop: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.card,
    borderWidth: FIELD_BORDER,
    backgroundColor: color.surface2,
  },
  at: { color: color.text2 },
  input: {
    flex: 1,
    color: color.text1,
    fontFamily: font.body,
    ...textStyle(type.body),
    paddingVertical: space.md,
  },
  caption: { marginTop: space.sm, color: color.text2 },
  captionError: { color: color.warning },
  problem: { marginTop: space.sm, color: color.danger },
  footer: { gap: space.sm },
});
