import React from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { color, font, type } from '@/theme/tokens';

type Variant = 'headline' | 'cardTitle' | 'body' | 'bodyMedium' | 'caption' | 'legal';

const variants: Record<Variant, TextStyle> = {
  headline: { fontFamily: font.display, fontSize: type.headline, color: color.text1, lineHeight: 36 },
  cardTitle: { fontFamily: font.bodySemibold, fontSize: type.cardTitle, color: color.text1 },
  body: { fontFamily: font.body, fontSize: type.body, color: color.text2, lineHeight: 24 },
  bodyMedium: { fontFamily: font.bodyMedium, fontSize: type.body, color: color.text1 },
  caption: { fontFamily: font.body, fontSize: type.caption, color: color.text2 },
  legal: { fontFamily: font.body, fontSize: type.legal, color: color.text3, lineHeight: 18 },
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
  size = type.heroNumeral,
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
          color: c,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
    />
  );
}
