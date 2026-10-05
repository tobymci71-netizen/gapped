/**
 * What the app shows when a screen throws while rendering.
 *
 * Exported as the root layout's ErrorBoundary (app/_layout.tsx), so expo-router
 * puts it in place of whatever failed instead of the red box in development or
 * a white screen and a closed app in a release build.
 *
 * Calm on purpose. Nothing a person did caused this, and the one thing they
 * most need to know is true: drives are written to the phone's storage as they
 * are recorded (src/drive/wal.ts), so a screen failing loses none of them.
 */

import React, { useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { SUPPORT_URL } from '@/config/links';
import { haptic } from '@/lib/haptics';
import { reportError } from '@/lib/observability';
import { color, glyph, space, textStyle } from '@/theme/tokens';

export function ErrorFallback({ error, retry }: ErrorBoundaryProps) {
  // Reported once per error. A no-op without a crash reporter, which is the
  // App Store build (src/lib/observability.ts).
  useEffect(() => {
    reportError(error);
  }, [error]);

  // Button fires its own press haptic (PressableScale), as on Update Required.
  const tryAgain = () => {
    retry().catch(() => undefined);
  };

  const contact = () => {
    Linking.openURL(SUPPORT_URL).catch(() => haptic.error());
  };

  // Scrolls and centres while it fits, as Update Required does: at the
  // largest text sizes this copy is taller than a small phone.
  return (
    <Screen
      style={styles.fill}
      footer={
        <View style={styles.footer}>
          <Button label="Try again" onPress={tryAgain} />
          <Button label="Contact us" variant="secondary" onPress={contact} />
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={styles.glyph} importantForAccessibility="no" accessibilityElementsHidden>
          🛠️
        </Text>
        <Text variant="headline" style={styles.title} accessibilityRole="header">
          Something went wrong
        </Text>
        <Text variant="body" style={styles.copy}>
          This screen could not be shown. Your drives are saved on this phone as they are recorded,
          so nothing has been lost.
        </Text>
        <Text variant="caption" style={styles.hint}>
          If it keeps happening, contact us and say what you were doing.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  glyph: textStyle(glyph.display),
  title: { textAlign: 'center' },
  copy: { textAlign: 'center', color: color.text2 },
  hint: { textAlign: 'center', color: color.text3, marginTop: space.sm },
  footer: { gap: space.md },
});
