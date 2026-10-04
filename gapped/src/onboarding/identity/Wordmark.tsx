import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { color, font, textStyle, type } from '@/theme/tokens';

/**
 * The small lime GAPPED at the head of setup and the paywall — the splash's
 * wordmark at header size, as the reference carries its own through to the
 * last screens.
 *
 * Capped at twice its size under Dynamic Type: it is a logo, not reading
 * text, and at the largest settings an uncapped one crowded out the heading
 * it sits above.
 */
export function Wordmark() {
  return (
    <Text accessibilityLabel="Gapped" maxFontSizeMultiplier={2} style={styles.mark}>
      GAPPED
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: {
    fontFamily: font.displayBlack,
    ...textStyle(type.cardTitle),
    letterSpacing: 2,
    color: color.accent,
    textAlign: 'center',
  },
});
