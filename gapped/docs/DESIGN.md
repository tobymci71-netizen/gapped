# Nightrun — Gapped's design system

A car advert shot at night. Every screen sits on the same blue-black night, and
**red appears only where real light would be**: tail lights, the route trail,
the primary button, the active tab's light. Everything else is night neutrals
and white. If you are about to make something red or make it glow, ask whether
it would be a light in that photograph. A lock, a label, a card or a number is
not.

Tokens live in `src/theme/tokens.ts` (colours, type, slant, glow) and
`src/theme/motion.ts` (durations, springs, ambient loops). Use them; no raw
colours or `fontSize` literals (lint warns).

## Palette

| Role | Token | Value |
| --- | --- | --- |
| The night (every screen) | `color.canvas` | `#07070A` |
| Panels, sheets, route tiles | `color.surface1` | `#0B0E16` |
| Raised controls, skeletons | `color.surface2` | `#121A31` |
| Pressed / most raised | `color.surface3` | `#1B2234` |
| Outlines (cards, tags, inputs) | `color.hairline` | `#262C3D` |
| Row separators, tab bar edge | `color.divider` | `#141823` |
| Outlined buttons | `color.outline` | `#3A4156` |
| Sky glow / horizon glow | `color.sky` / `color.horizon` | `#0E1428` / `#3D5598` |
| Text: primary / soft / secondary | `text1` / `text2` / `text3` | `#F7F7F7` / `#C3C7D2` / `#8A90A2` |
| **Racing red — light, not ink** | `color.accent` | `#E8282C` |
| Hot edge of a light; **red text** | `color.accentHot` | `#FF5A5E` |
| White-hot core | `color.accentCore` | `#FFC9CA` |
| **Fill behind white text** (primary button, "You" tag) | `color.accentFill` → `accentFillPress` | `#D02226` → `#B3181C` |
| White text on that fill | `color.onAccent` | `#F7F7F7` |
| Ink on a white fill (light button, selected segment) | `color.onLight` | `#07070A` |
| Destructive (outline/ink only, never a glowing fill) | `color.danger` | `#FF6B77` |
| Fixable input problem | `color.warning` | `#FF9F0A` |
| Verified (white, not a colour claim) | `color.verified` | `#F7F7F7` |

The three red rules the contrast test pins (`src/theme/__tests__/contrast.test.ts`):

- `accent` is too dark to be text on any raised surface. **Red text → `accentHot`.**
- White on `accent` is 4.11:1. **White labels sit on `accentFill`** (4.98:1).
- `onAccent` is white now. Anything that used it as "ink on a white fill" must use `onLight`.

`alpha(token, opacity)` makes washes and halos from a token.

The acid lime (`#CCFF00`) is gone. A test fails if it comes back.

## Type

| Face | Font tokens | Used for |
| --- | --- | --- |
| Archivo **wide italic** (width 125) | `font.display` (800), `font.displayBlack` (900), `font.displayBold` (700) | display, titles, big numbers, button labels |
| Archivo (normal width) | `font.body`, `bodyMedium`, `bodySemibold`, `bodyBold` | body copy, row titles |
| Martian Mono (width 87.5) | `font.mono`, `monoMedium`, `monoBold` | times, dates, labels over figures, data |

Text variants (`<Text variant=…>`): `display` 40, `headline` 30, `cardTitle` 19,
`title` 17 (all wide italic); `body` 17, `bodyMedium` 17, `bodySemibold` 15,
`callout` 15, `caption` 14, `legal` 13, `label` 12; `mono` 11, `monoSmall` 10.
`Numeral` is the wide italic black with tabular digits, at `type.numeral` (24)
in a stat, `type.heroNumeral` (52) for a screen's hero figure, and
`type.position` (76) for the board position "P3" alone. Sizes are in
`type.*`, always spread with `textStyle()`, which pairs each size with its
line height.

- **Italic lean.** The wide italic leans up to 0.09 em past its last glyph, and
  iOS clips text to its view. The wide variants and `Numeral` carry
  `paddingRight: italicOverhang(size)`. If you pad a wide-italic text yourself,
  use `paddingLeft`/`paddingRight`, not `paddingHorizontal` — the variant's own
  `paddingRight` would win.
- **Dynamic Type.** Body roles are never capped. Wide variants default to a cap
  (`maxFontScale`: display 1.3, headline 1.5, titles 1.6); chips 2. Pass
  `maxFontSizeMultiplier` to override.
- **Text fields.** A single-line `TextInput` takes `inputText(type.body)` (size
  only), not `textStyle()`: a line height on a one-line iOS field pushes the
  text down and cut off Archivo's descenders. Every field sets
  `selectionColor={color.text1}`, not the iOS blue caret.
- **No tiny uppercase labels.** Labels are sentence case, in mono or `label`.
- **No raw timestamps as titles.** `driveTitle()` (`src/lib/driveTitle.ts`)
  gives `{ title: 'Monday afternoon', meta: 'Mon 5 Oct · 13:00 · 25 min',
  range: 'Mon 5 Oct · 13:00–13:25', spoken }` from the real start time, in the
  device's zone. Never hard-code a weekday.

Fonts are static cuts of the Google Fonts variable files, built by
`scripts/build-fonts.py` and loaded in `app/_layout.tsx` under their
PostScript names. Licences: `assets/fonts/OFL-*.txt`, printed on the
acknowledgements page.

## The slant

The logo leans about 14°. `slant.transform` (`skewX(-14deg)`) is used for
buttons, tags, the distance plate, stat dividers, the tab light and the board's
selected-tab underline. Skew the **plate**, never the text on it. A hand-drawn
parallelogram overhangs by `height × slant.tan` per side. Inside a scroll
view, which clips at its edges, inset a full-width slanted row by that much or
its outer ends are cut square (`SegmentedControl` does). The logo's streak tip
(`StreakArrow`) is the button arrow and the head of every leaderboard bar.

## Components

| Component | API | Notes |
| --- | --- | --- |
| `Button` | `label, onPress, variant: 'primary' \| 'secondary' \| 'danger' \| 'light', disabled, style, accessibilityLabel, trailing?(ink), arrow?` | Parallelogram plate. Primary: red gradient, streak arrow, soft red spill (the only glowing button). Danger: outline. `arrow` defaults on for primary only. |
| `Card` | `ViewProps` | Night panel, hairline, radius 6. Use for real objects, not for every number. |
| `Stat` | `label, value, unit?, accent?, divider?, spoken?` | Open on the night: mono label, wide-italic figure. `accent` = a red light before the label; `divider` = slanted hairline before it. One VoiceOver sentence ("Top speed, 47 miles per hour"); `spoken` overrides the figure's words. `ProLockedStat` takes `divider` too. |
| `Screen` | `children, scroll?, style?, footer?, backdrop?: 'top' \| 'horizon' \| 'plain'` | Sits on `NightBackdrop` ('top' by default). Scrolling, a scrim fades in over the status bar so content never runs under the clock. |
| `SettingsRow` | `icon: IconName, label, value?, destructive?, onPress?` | Stroke icon, no tile, never an emoji. `value` is data, so mono. `SettingsSection` (wide-italic `SectionHeader` title) is for a screen whose other sections use `SectionHeader` too (the drive summary); Settings itself groups its rows under mono labels. |
| `Icon` (`components/icons.tsx`) | `name: IconName, size?, color?, strokeWidth?, accessibilityLabel?` | 24-grid stroke icons. Decorative unless labelled. |
| `TabIcon` | `name, focused` | White when active, with the red slanted light on the bar's top edge. |
| `brand/GappedMark` | `size?: 'sm' \| 'md' \| 'lg' \| number, glow?, accessibilityLabel?` | The logo. Glow follows the artwork's alpha (iOS). |
| `brand/SlantTag` | `label, variant?: 'red' \| 'white-outline' \| 'dark' \| 'white', size?: 'sm' \| 'md', icon?, decorative?` | Tags and chips: "Verified", "You", "SAMPLE", "PRO". |
| `brand/StreakArrow` | `width?, height?, color?` | The streak tip. `StreakBar` (`width, progress, you?, dim?`) is a leaderboard bar: `you` runs hot to a white-hot tip, `dim` burns lower (rows below the podium). |
| `brand/SectionHeader` | `title, action?: { label, onPress, accessibilityLabel? }` | Wide-italic header (a VoiceOver header) and an optional mono link. |
| `brand/NumberPlate` | `label, value, unit?, led?` | The one hero figure on a screen, on a slanted plate. |
| `brand/NightBackdrop` | `variant?, horizonY?` | Static SVG gradients behind a screen. |
| `brand/FilmGrain` | `opacity?, animated?` | Skia noise over hero scenes. Steps on the UI thread, still under Reduce Motion or when the screen loses focus. |
| `Speedometer` | `value, maxValue, unit, pb?, size?, active?, speedGlow?` | Lit red ticks, white needle. The live drive HUD passes neither `pb` nor the speed glow (`speedGlow={false}`): nothing on a live drive brightens as speed rises. |

## Motion

Ambient loops (`ambient.*` in `motion.ts`: grain, breathe, blink, shimmer,
pulse, road rush, rain) run only on hero scenes, only while the screen is
focused (`useIsFocused`), and never under Reduce Motion, where each scene
shows its finished still frame. Drive Skia from Reanimated shared values on
the UI thread, and size every canvas to its view.

**Skia gotcha (react-native-skia 2.6).** Never give a `<Group>` an `origin`
without a `transform` (or `matrix`, `clip` or `layer`). The recorder always
restores after a group with an `origin` but only saves when the group has one
of those, so the unmatched restore pops the parent's transform, and every
sibling drawn after it lands in raw artboard coordinates. `NightVehicle`
passes an origin only with its roll for this reason.

**Skia gotcha 2.** `<Mask>` drew nothing at all on device: the drive
summary's route, markers and ground vanished inside one. To fade a layer, draw
it in `<Group layer>` and finish with a gradient `Rect` at `blendMode="dstIn"`
(`RouteMap`). And a blurred glow near a canvas's edge stops in a hard square
there: let the canvas bleed past its box (`CarSilhouette`) rather than clip.

## Screens

- **Welcome** (`src/onboarding/intro/hero/`): a night motorway in Skia, the
  burst of light trails sized to just past this phone's edges
  (`heroMath.trailReach`), film grain last. Runs only while page 1 is on
  screen and the step focused.
- **Driving** (`src/drive/ui/`): the parked hero is three canvases, each
  sized to its part: the static scene drawn once, the tail lights breathing
  through view opacity (never redrawn), and the drizzle, the only per-frame
  redraw, clipped to the light's cone minus the vehicle. Loops stop off focus,
  when the hero scrolls out of view, and under Reduce Motion. Route tiles are
  the drive's real fixes on a plain plotting grid, never read during a
  recording. The verified tick shows only on the server's `verified`. The
  status line says "Standby", not "Parked": the app knows the recorder is
  idle, not where the car is.
- **Drive summary** (`src/drive/summary/`): the map's ground is abstract (a
  dot texture and a grid ruled at the scale bar's distance), never invented
  roads; the trail is the gated real fixes, north up, true to scale. Peak g is
  a ring at its size, not a directional dot. The share card is plain SVG so
  view-shot captures it reliably.
- **Ranks** (`src/board/`): `present.ts` (`heroView`, `gapLine`) is where the
  rule "no gap or chase imagery on Top speed or 0–60" lives and is tested; the
  pieces in `src/board/ui/` (BoardHero, RoadAhead, BoardRow, the controls)
  are local to the tab.

## Honesty and safety in the visuals

- Never glorify speed on public roads: no race, beat or faster copy. The welcome
  says "Every drive. Measured. Verified."
- `NO_IN_DRIVE_SPEED_NUDGES` holds: nothing on the live drive screen pulls
  toward speed.
- Gap copy ("4.7 mi behind jayden_r") is for distance and drive counts only,
  never for top speed or 0–60.
- Sample data says SAMPLE (a `SlantTag`), always.
- Routes are drawn from real fixes. A background texture may be abstract, but
  never invented roads or lakes presented as the map.
