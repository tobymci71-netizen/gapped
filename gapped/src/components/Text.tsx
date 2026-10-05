import React, { createContext, useContext } from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { color, font, italicOverhang, maxFontScale, type, textStyle } from '@/theme/tokens';

/**
 * True below a raised surface — a Card or a sheet.
 *
 * Under the old palette, the muted grey (text3) failed AA on a raised surface,
 * so `legal` stepped up to text2 there. Nightrun's text3 clears AA on every
 * surface (≥4.97:1), but the step stays: fine print inside a panel reads
 * better a shade lighter, and the surfaces publishing it rather than each
 * call site choosing is what keeps "which background am I on?" from being
 * forgotten if a lighter surface is ever added.
 */
const OnSurfaceContext = createContext(false);

/** Wrap the children of anything that paints a surface1/surface2 background. */
export function OnSurface({ children }: { children?: React.ReactNode }) {
  return <OnSurfaceContext.Provider value>{children}</OnSurfaceContext.Provider>;
}

/**
 * The Nightrun type roles.
 *
 * Wide italic (Archivo at width 125): display, headline, title, cardTitle.
 * Archivo: body, bodyMedium, bodySemibold, callout, caption, legal, label.
 * Martian Mono: mono, monoSmall — times, dates, data, labels over figures.
 */
export type TextVariant =
  | 'display'
  | 'headline'
  | 'cardTitle'
  | 'title'
  | 'body'
  | 'bodyMedium'
  | 'bodySemibold'
  | 'callout'
  | 'caption'
  | 'legal'
  | 'label'
  | 'mono'
  | 'monoSmall';

/** Wide italic faces lean past their advance; pad so the last glyph is not cut. */
const wide = (t: { size: number; lineHeight: number }): TextStyle => ({
  ...textStyle(t),
  paddingRight: italicOverhang(t.size),
});

/*
 * Every variant carries a line height. Three once did not, fell back to the
 * font's own metrics, and clipped anything taller than Latin text — an emoji,
 * a flag, a stacked accent. Spreading textStyle() makes the pairing structural
 * rather than remembered.
 */
const variants: Record<TextVariant, TextStyle> = {
  display: { fontFamily: font.display, ...wide(type.display), color: color.text1 },
  headline: { fontFamily: font.display, ...wide(type.headline), color: color.text1 },
  cardTitle: { fontFamily: font.display, ...wide(type.cardTitle), color: color.text1 },
  title: { fontFamily: font.display, ...wide(type.title), color: color.text1 },
  body: { fontFamily: font.body, ...textStyle(type.body), color: color.text2 },
  bodyMedium: { fontFamily: font.bodyMedium, ...textStyle(type.body), color: color.text1 },
  bodySemibold: { fontFamily: font.bodySemibold, ...textStyle(type.callout), color: color.text1 },
  callout: { fontFamily: font.body, ...textStyle(type.callout), color: color.text2 },
  caption: { fontFamily: font.body, ...textStyle(type.caption), color: color.text2 },
  legal: { fontFamily: font.body, ...textStyle(type.legal), color: color.text3 },
  label: { fontFamily: font.body, ...textStyle(type.label), color: color.text3 },
  mono: { fontFamily: font.mono, ...textStyle(type.mono), color: color.text3 },
  monoSmall: { fontFamily: font.mono, ...textStyle(type.monoSmall), color: color.text3 },
};

/**
 * How far Dynamic Type may grow each wide variant unless the caller says
 * otherwise. The wide face is a quarter wider than body text, so a 30pt
 * headline at the largest accessibility size would not fit a phone; body
 * roles are never capped.
 */
const defaultMaxScale: Partial<Record<TextVariant, number>> = {
  display: maxFontScale.display,
  headline: maxFontScale.headline,
  cardTitle: maxFontScale.title,
  title: maxFontScale.title,
};

const legalOnSurface: TextStyle = { ...variants.legal, color: color.text2 };

export function Text({
  variant = 'body',
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps & { variant?: TextVariant }) {
  const onSurface = useContext(OnSurfaceContext);
  const base = variant === 'legal' && onSurface ? legalOnSurface : variants[variant];
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? defaultMaxScale[variant]}
      style={[base, style]}
    />
  );
}

/**
 * Large numeric readout in the wide italic, with tabular numerals: mandatory
 * anywhere a value updates live, or the figure jitters (spec §3).
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
          // here would clip at large sizes and gap at small ones. 1.15 clears
          // the wide italic's 1.09 em box.
          lineHeight: Math.round(size * 1.15),
          paddingRight: italicOverhang(size),
          color: c,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
    />
  );
}
