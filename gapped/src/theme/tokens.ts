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
export const type = {
  heroNumeral: 52,
  headline: 30,
  cardTitle: 21,
  body: 17,
  caption: 14,
  legal: 13,
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

export const theme = { color, space, gutter, radius, type, font, button } as const;
export type Theme = typeof theme;
