/**
 * "Acid" design system — dark canvas, one acid accent.
 * Spec: BUILD-PROMPT.md §3. Values are the contract; do not improvise new colours.
 */

export const color = {
  // Canvas & surfaces
  canvas: '#0A0A0A',
  surface1: '#141416',
  surface2: '#1C1C1E',
  surface3: '#232326',
  hairline: '#2A2A2E',
  disabled: '#3A3A3C',

  // Accent — the brand
  accent: '#CCFF00',
  accentPress: '#B8E600',
  accentDim: '#7A9900',

  // Text
  text1: '#FFFFFF',
  text2: '#9A9A9E',
  text3: '#7A7A7E',

  // Semantic
  verified: '#CCFF00', // reuses accent deliberately
  unverified: '#7A7A7E', // muted, never red — unverified is not an accusation
  rank1: '#F0B429',
  rank2: '#C8CDD4',
  rank3: '#D2803A',
  danger: '#FF3B30',
  success: '#34C759',

  // Text on accent fills — contrast requires black, not white
  onAccent: '#0A0A0A',

  /** 10% acid over black — the tinted glyph tile behind onboarding icons. */
  accentTile: '#1E260A',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Horizontal screen gutter (spec: 24px). */
export const gutter = space.xl;

export const radius = {
  card: 16,
  /** Buttons are full pills: radius = height / 2. */
  pill: 999,
} as const;

/**
 * Type scale (pt). Display face: Archivo 800–900, upright — the acid colour
 * does the work; no italics. Numerals that update live must be tabular.
 */
/**
 * Type scale. Every entry ships a lineHeight with its size, and that pairing is
 * the point.
 *
 * React Native's default line height is derived from the font's own metrics,
 * which are tuned for Latin text. Anything taller — an emoji, a stacked accent,
 * a flag — overflows the line box and is clipped at the top. Three onboarding
 * glyphs shipped clipped for exactly this reason and were each fixed by hand
 * afterwards, one screen at a time. A size that cannot be imported without its
 * line height is a size that cannot be used wrong.
 *
 * Ratios are ~1.2 for display sizes and ~1.4 for body copy: tight enough to
 * hold a headline together, loose enough to read a paragraph.
 */
export const type = {
  heroNumeral: { size: 52, lineHeight: 60 },
  headline: { size: 30, lineHeight: 36 },
  cardTitle: { size: 21, lineHeight: 27 },
  body: { size: 17, lineHeight: 24 },
  caption: { size: 14, lineHeight: 20 },
  legal: { size: 13, lineHeight: 18 },
} as const;

/**
 * Sizes for glyphs rendered as text — chevrons, emoji, icon characters.
 *
 * Separate from `type` because they are not type: they carry no reading rhythm
 * and their line height exists only to stop the glyph being clipped, so it runs
 * looser (~1.2) and is not expected to align to a text baseline.
 */
export const glyph = {
  xs: { size: 9, lineHeight: 12 },
  sm: { size: 11, lineHeight: 15 },
  md: { size: 13, lineHeight: 17 },
  lg: { size: 15, lineHeight: 20 },
  xl: { size: 17, lineHeight: 22 },
  xxl: { size: 20, lineHeight: 24 },
  huge: { size: 26, lineHeight: 32 },
  display: { size: 34, lineHeight: 42 },
  hero: { size: 56, lineHeight: 68 },
} as const;

export const font = {
  display: 'Archivo_800ExtraBold',
  displayBlack: 'Archivo_900Black',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
} as const;

export const button = {
  height: 58,
} as const;

/**
 * Spreads a scale entry into a TextStyle. Exists so a size and its line height
 * cannot be separated at the call site — `fontSize: type.body.size` alone
 * compiles perfectly well and reintroduces the clipping this scale prevents.
 *
 *     text: { ...textStyle(type.body), color: color.text2 }
 */
export const textStyle = (t: { size: number; lineHeight: number }) => ({
  fontSize: t.size,
  lineHeight: t.lineHeight,
});

export const theme = { color, space, gutter, radius, type, glyph, font, button } as const;
export type Theme = typeof theme;
