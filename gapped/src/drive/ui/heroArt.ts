/**
 * The Driving tab's hero scene, as geometry: the street light, its drizzle and
 * its pool on the wet ground, a hazy skyline on the horizon. The person's
 * vehicle is its render (docs/VEHICLE_ART.md), placed by HeroScene.
 *
 * Coordinates are the mock's 390-wide artboard, so every path here is the
 * approved artwork's own (docs/DESIGN.md; the source is Nightrun-Drive.dc.html).
 * HeroScene scales the artboard to the screen's width and slides it down so
 * the vehicle always stands between the title and the button, however tall the
 * title wraps.
 *
 * Geometry only — no colours, no React — so it can be checked outside the app.
 * The scene is illustration, not a map: nothing here stands for a real place.
 */

/** The artboard's width. */
export const ART_WIDTH = 390;
/**
 * The stage on the artboard: from under the title (179) to the top of the
 * Start drive button (400). The car stands in it.
 */
export const STAGE_TOP = 179;
export const STAGE_BOTTOM = 400;
export const STAGE_HEIGHT = STAGE_BOTTOM - STAGE_TOP;

export type Ellipse = { cx: number; cy: number; rx: number; ry: number };
export type Box = { x: number; y: number; w: number; h: number };

// ── Sky and city ───────────────────────────────────────────────────────────

/** The sky runs down to the horizon; above the artboard it stays night. */
export const SKY_BOTTOM = 263;
/** City light on low cloud, centred on the horizon. */
export const CITY_GLOW: Ellipse = { cx: 195, cy: 262, rx: 300, ry: 70 };
/** The far skyline, hazier and bluer. */
export const FAR_CITY =
  'M0 262 V244 H8 V238 H20 V242 H34 V230 H40 V226 H46 V232 H60 V240 H74 V236 H90 V244 H110 V240 H124 V246 H140 V243 H250 V244 H262 V238 H272 V240 H286 V232 H296 V236 H306 V228 H314 V234 H330 V240 H348 V236 H362 V242 H376 V238 H390 V262 Z';
/** A tower crane on the right, drawn in hairlines. */
export const CRANE =
  'M356 228 V178 M326 179.5 H386 M372 179.5 V193 M334 179.5 V184 H344 V179.5 M356 179.5 L366 172 L376 179.5';
/** The near skyline, nearly black. */
export const NEAR_CITY =
  'M0 262 V232 H12 V224 H22 V228 H24 V214 H27 V228 H36 V218 H48 V204 H58 V212 H64 V234 H80 V226 H92 V238 H104 V246 H128 V250 H262 V248 H270 V236 H282 V222 H292 V226 H296 V196 H312 V202 H316 V214 H324 V230 H338 V220 H352 V232 H366 V226 H378 V236 H390 V262 Z';
/** Haze lying over the skyline's foot. */
export const HAZE: Box = { x: 0, y: 190, w: ART_WIDTH, h: 73 };
/** A few lit windows (1.5pt squares). */
export const WINDOWS: readonly (readonly [number, number])[] = [
  [51, 210],
  [51, 218],
  [300, 206],
  [306, 214],
  [342, 226],
];
export const WINDOW_SIZE = 1.5;
/** The mast's red warning light: the one that blinks. */
export const WARNING_LIGHT = { cx: 304, cy: 195, core: 1.1, halo: 4 } as const;
/** The crane jib's tip light: steady. */
export const CRANE_TIP = { cx: 386, cy: 179.5, r: 0.9 } as const;

// ── Ground ─────────────────────────────────────────────────────────────────

/** The wet ground, from the horizon down; fades to night by GROUND_END. */
export const GROUND_TOP = 262;
export const GROUND_END = 520;
/** The street light's cone, from above the frame to the ground. */
export const CONE = 'M150 40 L240 40 L372 390 L18 390 Z';
export const CONE_BOX = { top: 40, bottom: 390 } as const;
/** The pool of light it leaves on the wet ground. */
export const POOL: Ellipse = { cx: 195, cy: 386, rx: 205, ry: 32 };
/** The parking bay's two painted lines, running out of frame. */
export const BAYS: readonly string[] = [
  'M149.1 300 L149.7 300 L-107 520 L-114 520 Z',
  'M240.9 300 L240.3 300 L497 520 L504 520 Z',
];
export const BAY_BOX = { top: 290, bottom: 510 } as const;
/** Where the ground starts to fade into the night under the button. */
export const FADE = { top: 372, bottom: 520 } as const;
/**
 * From the stage's top to where the ground has faded to night: the least
 * the hero may measure below the stage's top, so a short action (one button)
 * never cuts the scene off before it has faded.
 */
export const STAGE_TO_NIGHT = FADE.bottom - STAGE_TOP;

// ── Drizzle ────────────────────────────────────────────────────────────────

/**
 * Rain falls only inside the light's cone, as it would be seen: one 58×44
 * tile of three streaks, repeated, sliding down one tile per cycle.
 */
export const RAIN_TILE = { w: 58, h: 44 } as const;
const RAIN_STREAKS: readonly (readonly [number, number])[] = [
  [8, 3],
  [37, 17],
  [21, 31],
];
/** Each streak: 0.9 left over 8 down (a little wind). */
const STREAK = { dx: -0.9, dy: 8 } as const;
/**
 * The rain's visible band: the cone's width, and from where the mock's fade
 * lets it show (145) to the ground (390), plus room for the blur-free strokes.
 */
export const RAIN_BOX: Box = { x: 18, y: 140, w: 354, h: 252 };
/** The fade inside the cone (the mock's mask): clear, then drizzle, thinning. */
export const RAIN_FADE = {
  stops: [0, 0.3, 0.56, 1],
  opacity: [0, 0, 0.9, 0.15],
} as const;

/**
 * The drizzle as one path. Rows cover RAIN_BOX at every offset from one tile
 * up (−44) to none (0), so the slide never shows an edge.
 */
export function rainPath(): string {
  const parts: string[] = [];
  const firstRow = Math.floor((RAIN_BOX.y - RAIN_TILE.h) / RAIN_TILE.h) * RAIN_TILE.h;
  const lastRow = RAIN_BOX.y + RAIN_BOX.h + RAIN_TILE.h;
  for (let ty = firstRow; ty <= lastRow; ty += RAIN_TILE.h) {
    for (let tx = 0; tx < ART_WIDTH + RAIN_TILE.w; tx += RAIN_TILE.w) {
      for (const [sx, sy] of RAIN_STREAKS) {
        parts.push(`M${tx + sx} ${ty + sy} l${STREAK.dx} ${STREAK.dy}`);
      }
    }
  }
  return parts.join(' ');
}

/**
 * Where the lights layer needs to draw on the artboard: both tail lights'
 * halos at their blur's reach, and their reflections on the ground. Sized
 * to that, not the whole scene, so the layer that breathes is small.
 */
export const LIGHTS_BOX: Box = { x: 30, y: 210, w: 330, h: 274 };
