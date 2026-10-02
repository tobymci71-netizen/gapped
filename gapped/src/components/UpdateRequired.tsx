/**
 * The blocking update screen.
 *
 * Shown instead of the app when the running build is below the server's
 * minimum. It has no dismiss and no back: a build that is blocked is blocked
 * because running it is worse than not running it, and an escape hatch would
 * make the whole mechanism advisory.
 *
 * It deliberately does NOT link to the App Store. A deep link needs an App
 * Store ID that does not exist yet, and a dead button is worse than no button —
 * see TODO(toby) below.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

const DEFAULT_MESSAGE =
  'This version of Gapped is no longer supported. Update to the latest build to keep recording drives.';

export function UpdateRequired({ message }: { message: string | null }) {
  // Scrolls, and is centred only while it fits. This screen is the whole app
  // and has no way out, and at accessibility text sizes its copy is far taller
  // than a small phone: fixed and centred, the headline and the instruction
  // overflowed off both edges with nothing to bring them back.
  return (
    <Screen style={styles.fill}>
      <View style={styles.body}>
        <Text style={styles.glyph}>⚠️</Text>
        <Text variant="headline" style={styles.title}>
          Update required
        </Text>
        <Text variant="body" style={styles.copy}>
          {message ?? DEFAULT_MESSAGE}
        </Text>
        {/*
          TODO(toby): once the app has an App Store ID, add a button opening
          itms-apps://apps.apple.com/app/id<ID>. Until then there is nothing to
          link to, and a button that does nothing teaches users the screen is
          broken rather than that they need to act.
        */}
        <Text variant="caption" style={styles.hint}>
          Open TestFlight or the App Store to get the latest version.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // On the scroll content container: fill the viewport when the copy is short.
  fill: { flexGrow: 1 },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  glyph: { fontSize: 44, lineHeight: 52 },
  title: { textAlign: 'center' },
  copy: { textAlign: 'center', color: color.text2 },
  hint: { textAlign: 'center', color: color.text3, marginTop: space.sm },
});
