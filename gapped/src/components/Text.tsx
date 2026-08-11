import React from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { color, font, type, textStyle } from '@/theme/tokens';

type Variant = 'headline' | 'cardTitle' | 'body' | 'bodyMedium' | 'caption' | 'legal';

/*
 * Every variant now carries a line height, because three of them did not.
 * headline, body and legal had one; cardTitle, bodyMedium and caption fell back
 * to the font's own metrics, which are sized for Latin text and clip anything
 * taller — an emoji, a flag, a stacked accent. That is the bug that shipped
 * three times in onboarding and was patched three times at the call site.
 * Spreading textStyle() makes the pairing structural rather than remembered.
 */
const variants: Record<Variant, TextStyle> = {
  headline: { fontFamily: font.display, ...textStyle(type.headline), color: color.text1 },
  cardTitle: { fontFamily: font.bodySemibold, ...textStyle(type.cardTitle), color: color.text1 },
  body: { fontFamily: font.body, ...textStyle(type.body), color: color.text2 },
  bodyMedium: { fontFamily: font.bodyMedium, ...textStyle(type.body), color: color.text1 },
  caption: { fontFamily: font.body, ...textStyle(type.caption), color: color.text2 },
  legal: { fontFamily: font.body, ...textStyle(type.legal), color: color.text3 },
};

export function Text({
  variant = 'body',
  style,
  ...rest
}: TextProps & { variant?: Variant }) {
  return <RNText {...rest} style={[variants[variant], style]} />;
}

/**
 * Large numeric readout. Tabular numerals are mandatory anywhere a value
 * updates live, or the speedometer jitters (spec §3).
 */
export function Numeral({
  size = type.heroNumeral.size,
  color: c = color.text1,
  style,
  ...rest
}: TextProps & { size?: number; color?: string }) {
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: font.displayBlack,
          fontSize: size,
          // Scales with whatever size the caller passed. Callers override the
          // size freely (the speedometer, share cards), so a fixed line height
          // here would clip at large sizes and gap at small ones.
          lineHeight: Math.round(size * 1.15),
          color: c,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
    />
  );
}
