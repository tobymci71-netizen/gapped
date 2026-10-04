import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { color, font, glyph, textStyle } from '@/theme/tokens';

/**
 * Dynamic Type cap for the wordmark. It is a logo, not copy: uncapped it
 * breaks mid-word at the largest accessibility sizes. Both sizes share the
 * cap, so the splash-to-header ratio holds at every text size (the move
 * measures both anyway).
 */
const WORDMARK_MAX_SCALE = 1.3;

/**
 * GAPPED, in lime. Two sizes of one style: the splash's, and the carousel
 * header's that the splash shrinks into. Exactly half, letter spacing
 * included, so the moving splash mark lands as the header mark's double and
 * the swap at the end of the move cannot be seen.
 */
export function Wordmark({ size }: { size: 'splash' | 'header' }) {
  return (
    <Text
      accessibilityLabel="Gapped"
      maxFontSizeMultiplier={WORDMARK_MAX_SCALE}
      numberOfLines={1}
      style={[styles.base, size === 'splash' ? styles.splash : styles.header]}
    >
      GAPPED
    </Text>
  );
}

/** Splash size ÷ header size. */
const SPLASH_RATIO = 2;
const HEADER_TRACKING = 1;

const styles = StyleSheet.create({
  base: { fontFamily: font.displayBlack, color: color.accent, textAlign: 'center' },
  header: { ...textStyle(glyph.huge), letterSpacing: HEADER_TRACKING },
  // The header style doubled, line height included. Pairing the splash with
  // its own scale entry (heroNumeral, 52/60) would put the glyph a point
  // higher in its box than the shrunken copy sits in the header's, and that
  // point would jump at the swap.
  splash: {
    ...textStyle({
      size: glyph.huge.size * SPLASH_RATIO,
      lineHeight: glyph.huge.lineHeight * SPLASH_RATIO,
    }),
    letterSpacing: HEADER_TRACKING * SPLASH_RATIO,
  },
});
