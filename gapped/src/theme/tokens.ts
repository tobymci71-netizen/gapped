/**
 * "Nightrun" design system: a car advert shot at night (docs/DESIGN.md).
 *
 * Every screen sits on the same blue-black night, and red appears only where
 * real light would be: tail lights, the route trail, the primary button, the
 * active tab's light. Everything else is night neutrals and white.
 *
 * Values are the contract; do not improvise new colours. Every text/background
 * pairing the components rely on is held to WCAG AA in
 * src/theme/__tests__/contrast.test.ts.
 */

export const color = {
  // ── Night ────────────────────────────────────────────────────────────────
  /** The night itself. Every screen's base. */
  canvas: '#07070A',
  /** Panels: cards, sheets, thumbnails, the drive row's route tile. */
  surface1: '#0B0E16',
  /** Raised controls: inputs, unselected options, skeletons. Night blue. */
  surface2: '#121A31',
  /** Pressed / most raised. */
  surface3: '#1B2234',
  /** Outlines of controls and panels (cards, tags, segments, inputs). */
  hairline: '#262C3D',
  /** Row separators and the tab bar's top edge: quieter than a hairline. */
  divider: '#141823',
  /** Outlined buttons: a step brighter than a hairline, so the shape reads. */
  outline: '#3A4156',
  /** Disabled fills. text3 on it still measures 4.85:1. */
  disabled: '#1F2433',
  /** The horizon glow: city light on low cloud, behind every hero scene. */
  horizon: '#3D5598',
  /** The sky's faint glow at the top of every screen (NightBackdrop 'top'). */
  sky: '#0E1428',

  // ── Light (red) ──────────────────────────────────────────────────────────
  /**
   * Racing red, the logo's red: LIGHT. Tail lights, the route trail, glows,
   * the active tab's light, progress. Not ink: it measures 4.57:1 on the
   * canvas and under 4.5 on every surface, so red *text* uses accentHot, and
   * white text never sits on it (4.11:1) — that is what accentFill is for.
   */
  accent: '#E8282C',
  /** The pressed/lit-up step of accent (a light at full brightness). */
  accentPress: '#FF3B3F',
  /**
   * A muted red for secondary marks and small labels that should read as
   * "accent, but quiet". Unlike accent it is safe as text on the canvas,
   * surface1 and surface2 (≥4.59:1).
   */
  accentDim: '#C7676C',
  /** Hot tint: the bright edge of a light, and red text (≥5.19:1 everywhere). */
  accentHot: '#FF5A5E',
  /** The white-hot core of a light (tail-light filament, the "you" bar's tip). */
  accentCore: '#FFC9CA',
  /** Deep red FILL behind white text: the primary button, the "You" tag. */
  accentFill: '#D02226',
  /** accentFill's lower stop and pressed state. */
  accentFillPress: '#B3181C',
  /** 12% red over the night: the tile behind onboarding glyphs. */
  accentTile: '#231019',

  // ── Text ─────────────────────────────────────────────────────────────────
  text1: '#F7F7F7',
  /** Soft text: body copy, values, secondary controls. */
  text2: '#C3C7D2',
  /** Secondary text: labels, metadata, inactive tabs. ≥4.97:1 on every surface. */
  text3: '#8A90A2',

  // ── Semantic ─────────────────────────────────────────────────────────────
  /** Verified is white (the mock's outlined white chip), not a colour claim. */
  verified: '#F7F7F7',
  unverified: '#8A90A2', // muted, never red — unverified is not an accusation
  rank1: '#E8C468', // champagne gold
  rank2: '#C8CDD4', // cool silver
  rank3: '#C98A55', // bronze
  /**
   * Destructive actions and failures. A pinker red than the brand light, and
   * always drawn as an outline or ink (never a glowing fill), so "delete"
   * cannot be mistaken for the primary action.
   */
  danger: '#FF6B77',
  success: '#34C759',
  /**
   * A fixable input problem — a username that is taken or malformed. Orange,
   * not danger red: nothing has failed or been lost, the person just has to
   * change what they typed (docs/ONBOARDING.md, "Look and motion").
   */
  warning: '#FF9F0A',

  /** Text on accentFill (and on accentFillPress): white, 4.98:1 / 6.40:1. */
  onAccent: '#F7F7F7',
  /** Text on a white (text1) fill — the light button, a selected segment. */
  onLight: '#07070A',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Horizontal screen gutter (24pt; list rows run full-bleed at 20). */
export const gutter = space.xl;

export const radius = {
  /** Panels: small and sharp. Nightrun is not bubbly. */
  card: 6,
  /** Buttons, plates and the drive-row route tile. */
  sm: 3,
  /** Tags, segments, the slanted lights. */
  xs: 2,
  /** Circles and true pills (dots, toggles, progress tracks). */
  pill: 999,
} as const;

/**
 * The logo's slant, reused for buttons, tags, the distance plate, dividers
 * and the active tab's light. Lean right like the mark: skewX(-14deg).
 *
 *     transform: slant.transform
 *     // a parallelogram drawn by hand overhangs by height × slant.tan per side
 */
export const slant = {
  deg: -14,
  transform: [{ skewX: '-14deg' }] as const,
  /** tan(14°): horizontal shift per point of height. */
  tan: Math.tan((14 * Math.PI) / 180),
} as const;

/**
 * Glow radii (pt) for lights only — never for things that are not lights.
 * `tight` is a lit edge (the tab light), `soft` a lamp's halo, `wide` the
 * spill under the primary button.
 */
export const glow = {
  tight: 8,
  soft: 18,
  wide: 36,
} as const;

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
 * Faces (see `font`): the wide italic (Archivo at width 125) sets display,
 * titles, big numbers and button labels at ≥1.1× — its ascender plus
 * descender is 1.09 em. Archivo at normal width sets body copy at ~1.4×.
 * Martian Mono sets times, dates, labels and data at ~1.35× (its box is
 * 1.2 em).
 */
export const type = {
  // Wide italic
  /** The welcome statement, the car's name. */
  display: { size: 40, lineHeight: 44 },
  /** Hero figures: the distance plate, the share card's top speed. */
  heroNumeral: { size: 52, lineHeight: 58 },
  /**
   * The board position, "P3" (Nightrun-Ranks): the one figure set larger than
   * a hero numeral. Numeral derives its own line height (×1.15, 87 here);
   * this one sizes the skeleton that stands in for it.
   */
  position: { size: 76, lineHeight: 84 },
  /** Screen titles. */
  headline: { size: 30, lineHeight: 34 },
  /** A figure in a stat row ("25 min", "47 mph"). */
  numeral: { size: 24, lineHeight: 28 },
  /** Card and sheet titles. */
  cardTitle: { size: 19, lineHeight: 24 },
  /** Section headers ("Recent drives"), button labels. */
  title: { size: 17, lineHeight: 22 },

  // Archivo, normal width
  body: { size: 17, lineHeight: 24 },
  /** The mockups' paragraph size: descriptions under a title, row titles. */
  callout: { size: 15, lineHeight: 22 },
  caption: { size: 14, lineHeight: 20 },
  legal: { size: 13, lineHeight: 18 },
  /**
   * The small label over a figure (Stat, its Pro-locked twin, the You tab's
   * tiles) and the speed distribution's band labels. A step under legal.
   */
  label: { size: 12, lineHeight: 15 },
  /** Tab bar labels, a tag's text. */
  small: { size: 11, lineHeight: 14 },
  /** The small tag ("You" beside a name). */
  tiny: { size: 10, lineHeight: 13 },

  // Martian Mono
  /** Data lines: "Mon 5 Oct · 13:00 · 25 min", "GPS ready". */
  mono: { size: 11, lineHeight: 15 },
  /** Small data: "top 65 mph", chart axes, a tag's figure. */
  monoSmall: { size: 10, lineHeight: 14 },
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

/**
 * Font families, by the name app/_layout.tsx loads each under.
 *
 * The wide italic faces are static instances cut from Archivo's variable font
 * at width 125 (scripts/build-fonts.py): React Native cannot set a variable
 * font's width, so each weight is its own file, loaded under its PostScript
 * name. Martian Mono likewise, at width 87.5.
 */
export const font = {
  /** Wide italic 800: titles, headlines, button labels. */
  display: 'ArchivoExpanded-ExtraBoldItalic',
  /** Wide italic 900: hero figures, the board position. */
  displayBlack: 'ArchivoExpanded-BlackItalic',
  /** Wide italic 700: small wide italic (a tag's figure, a row's position). */
  displayBold: 'ArchivoExpanded-BoldItalic',
  body: 'Archivo_400Regular',
  bodyMedium: 'Archivo_500Medium',
  bodySemibold: 'Archivo_600SemiBold',
  bodyBold: 'Archivo_700Bold',
  mono: 'MartianMono-Regular',
  monoMedium: 'MartianMono-Medium',
  monoBold: 'MartianMono-Bold',
} as const;

/**
 * How far Dynamic Type may grow each kind of text. Body copy is never capped.
 * The wide face is ~25% wider than body text at the same size, so display
 * sizes stop growing sooner than they did upright, and chips sit beside
 * content so they cannot grow without limit either.
 */
export const maxFontScale = {
  display: 1.3,
  headline: 1.5,
  title: 1.6,
  numeral: 1.5,
  /** Button labels: they wrap inside the plate rather than overflow it. */
  button: 2,
  chip: 2,
} as const;

/**
 * Right padding a wide-italic line needs so its last glyph's lean is not
 * clipped. The italic's overhang past its advance reaches 0.093 em ('f'), and
 * iOS draws text inside the text view's bounds, so without this a title
 * ending in "f", "W" or "7" loses a sliver of its top-right corner.
 */
export const italicOverhang = (size: number): number => Math.ceil(size * 0.1);

export const button = {
  height: 56,
} as const;

/**
 * A token colour at an opacity, for washes and halos that a solid token cannot
 * express (`alpha(color.text1, 0.07)` is the outlined tag's fill).
 */
export const alpha = (hex: string, opacity: number): string => {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
};

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

/**
 * Text size for a single-line TextInput: no line height. On iOS a line height
 * on a one-line field pushes the text down, and Archivo's descenders ("g",
 * "q", "_") were cut off at the field's bottom edge.
 */
export const inputText = (t: { size: number }) => ({ fontSize: t.size });

/**
 * Ready-made text styles for the three faces, for code that styles an RN
 * <Text> directly rather than through the Text component.
 *
 *     value: { ...typeface.numeral, color: color.text1 }
 */
export const typeface = {
  /** Mono data line, secondary grey. */
  mono: { fontFamily: font.mono, ...textStyle(type.mono), color: color.text3 },
  /** Mono label over a figure. */
  label: { fontFamily: font.mono, ...textStyle(type.monoSmall), color: color.text3 },
  /** A wide-italic figure with tabular digits. */
  numeral: {
    fontFamily: font.display,
    ...textStyle(type.numeral),
    color: color.text1,
    fontVariant: ['tabular-nums'] as 'tabular-nums'[],
    paddingRight: italicOverhang(type.numeral.size),
  },
  /** A wide-italic title. */
  title: {
    fontFamily: font.display,
    ...textStyle(type.title),
    color: color.text1,
    paddingRight: italicOverhang(type.title.size),
  },
} as const;

export const theme = {
  color,
  space,
  gutter,
  radius,
  slant,
  glow,
  type,
  glyph,
  font,
  maxFontScale,
  button,
  typeface,
} as const;
export type Theme = typeof theme;
