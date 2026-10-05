/**
 * The blocking update screen.
 *
 * Shown instead of the app when the running build is below the server's
 * minimum. It has no dismiss and no back: a build that is blocked is blocked
 * because running it is worse than not running it, and an escape hatch would
 * make the whole mechanism advisory.
 *
 * Its one button opens Gapped's App Store page (APP_STORE_URL), where the
 * update is.
 */

import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { APP_STORE_URL } from '@/config/links';
import { haptic } from '@/lib/haptics';
import { color, glyph, space, textStyle } from '@/theme/tokens';

const DEFAULT_MESSAGE =
  'This version of Gapped is no longer supported. Update to the latest version to keep recording drives.';

function openStore(): void {
  // A device that cannot open the store (no App Store app, a restricted
  // profile) is told so by the hint under the button.
  Linking.openURL(APP_STORE_URL).catch(() => haptic.error());
}

export function UpdateRequired({ message }: { message: string | null }) {
  // Scrolls, and is centred only while it fits. This screen is the whole app
  // and has no way out, and at accessibility text sizes its copy is far taller
  // than a small phone: fixed and centred, the headline and the instruction
  // overflowed off both edges with nothing to bring them back. The button is
  // pinned below the scroll area, so it is never the part that scrolls away.
  return (
    <Screen style={styles.fill} footer={<Button label="Update" onPress={openStore} />}>
      <View style={styles.body}>
        <Text style={styles.glyph} importantForAccessibility="no" accessibilityElementsHidden>
          ⚠️
        </Text>
        <Text variant="headline" style={styles.title} accessibilityRole="header">
          Update required
        </Text>
        <Text variant="body" style={styles.copy}>
          {message ?? DEFAULT_MESSAGE}
        </Text>
        <Text variant="caption" style={styles.hint}>
          Update opens Gapped in the App Store. You can also update from the App Store app.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // On the scroll content container: fill the viewport when the copy is short.
  fill: { flexGrow: 1 },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  glyph: textStyle(glyph.display),
  title: { textAlign: 'center' },
  copy: { textAlign: 'center', color: color.text2 },
  hint: { textAlign: 'center', color: color.text3, marginTop: space.sm },
});
