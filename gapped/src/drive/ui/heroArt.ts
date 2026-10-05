/**
 * The Driving tab's hero scene, as geometry: Nightrun-Drive's car (or bike)
 * parked under a street light in the drizzle, a hazy skyline on the horizon.
 *
 * Coordinates are the mock's 390-wide artboard, so every path here is the
 * approved artwork's own (docs/DESIGN.md; the source is Nightrun-Drive.dc.html).
 * HeroScene scales the artboard to the screen's width and slides it down so
 * the car always stands between the title and the button, however tall the
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

// ── The vehicle ────────────────────────────────────────────────────────────

/** Where a vehicle's own drawing space (200 wide, ground at 125) stands on the artboard. */
export type Placement = { x: number; y: number; scale: number };

/** Near-black solids: tyres, trim (mirrors, bars, hanger), the bumper. */
export type SolidTone = 'tyre' | 'trim' | 'bumper';
/** Where the street light from above catches an edge, brightest first. */
export type EdgeTone = 'roof' | 'shoulder' | 'flank';

/** One shape of the vehicle, drawn in order, far to near. */
export type VehicleLayer =
  | { kind: 'solid'; d: string; tone: SolidTone }
  /** Painted bodywork, in the body gradient (over `bodyBox`). */
  | { kind: 'body'; d: string }
  /** The rear window, in the glass gradient (over `glassBox`). */
  | { kind: 'glass'; d: string }
  /** The street light's sheen across the glass. */
  | { kind: 'sheen'; d: string }
  | { kind: 'edge'; d: string; tone: EdgeTone; width: number }
  /** The faint red the tail lights throw on the body. */
  | { kind: 'tint'; e: Ellipse }
  | { kind: 'plate'; x: number; y: number; w: number; h: number; r: number }
  /** Diffuser fins. */
  | { kind: 'fins'; d: string }
  | { kind: 'exhaust'; cx: number; cy: number; r: number };

export type VehicleArt = {
  placement: Placement;
  /** The contact shadow, blurred, under everything. */
  shadow: Ellipse;
  /** The body gradient's run (top, bottom), in the vehicle's space. */
  bodyBox: readonly [number, number];
  glassBox?: readonly [number, number];
  layers: readonly VehicleLayer[];
  /** The breathing tail lights, drawn over the vehicle. */
  lights: {
    halos: readonly Ellipse[];
    lenses: readonly string[];
    filaments: readonly string[];
  };
  /** The tail lights' reflections in the wet ground, on the ARTBOARD. */
  reflections: readonly string[];
};

const TAIL_L = 'M8 55 L58 52 L62 56.5 L60 62.5 L34 63.5 L32 59.5 L9 61.5 Z';
const TAIL_R = 'M192 55 L142 52 L138 56.5 L140 62.5 L166 63.5 L168 59.5 L191 61.5 Z';

/** Nightrun-Drive's coupe, from behind: the mock's translate(80 236) scale(1.15). */
export const CAR: VehicleArt = {
  placement: { x: 80, y: 236, scale: 1.15 },
  shadow: { cx: 100, cy: 123.5, rx: 106, ry: 5.5 },
  bodyBox: [9, 104],
  glassBox: [16, 44],
  layers: [
    { kind: 'solid', tone: 'tyre', d: 'M17 86 H40 Q46 86 46 92 V119 Q46 125 40 125 H17 Q11 125 11 119 V92 Q11 86 17 86 Z' },
    { kind: 'solid', tone: 'tyre', d: 'M160 86 H183 Q189 86 189 92 V119 Q189 125 183 125 H160 Q154 125 154 119 V92 Q154 86 160 86 Z' },
    { kind: 'solid', tone: 'trim', d: 'M20 49 L5 44.5 Q2 44 2.5 47.5 L4 51 Z' },
    { kind: 'solid', tone: 'trim', d: 'M180 49 L195 44.5 Q198 44 197.5 47.5 L196 51 Z' },
    {
      kind: 'body',
      d: 'M6 104 C3 92 1 78 2 66 C3 57 8 51 18 49 L42 46 L60 15 C62 11 66 9 72 9 L128 9 C134 9 138 11 140 15 L158 46 L182 49 C192 51 197 57 198 66 C199 78 197 92 194 104 Z',
    },
    { kind: 'glass', d: 'M66 16 L134 16 L152 44 L48 44 Z' },
    { kind: 'sheen', d: 'M86 16 L99 16 L79 44 L64 44 Z' },
    { kind: 'edge', tone: 'roof', width: 1.1, d: 'M60 15 C62 11 66 9 72 9 L128 9 C134 9 138 11 140 15' },
    { kind: 'edge', tone: 'shoulder', width: 1, d: 'M44 47.5 Q100 43.5 156 47.5' },
    { kind: 'edge', tone: 'flank', width: 1, d: 'M3 72 C3 59 9 51 19 49.5 L43 46.6' },
    { kind: 'edge', tone: 'flank', width: 1, d: 'M197 72 C197 59 191 51 181 49.5 L157 46.6' },
    { kind: 'tint', e: { cx: 100, cy: 72, rx: 98, ry: 16 } },
    { kind: 'plate', x: 80, y: 68, w: 40, h: 11, r: 1.5 },
    { kind: 'solid', tone: 'bumper', d: 'M24 92 L176 92 L171 106 L29 106 Z' },
    { kind: 'fins', d: 'M84 93.5 V105 M92 93.5 V105 M108 93.5 V105 M116 93.5 V105' },
    { kind: 'exhaust', cx: 41, cy: 99, r: 4.3 },
    { kind: 'exhaust', cx: 53, cy: 99, r: 4.3 },
    { kind: 'exhaust', cx: 147, cy: 99, r: 4.3 },
    { kind: 'exhaust', cx: 159, cy: 99, r: 4.3 },
  ],
  lights: {
    halos: [
      { cx: 34, cy: 58, rx: 40, ry: 14 },
      { cx: 166, cy: 58, rx: 40, ry: 14 },
    ],
    lenses: [TAIL_L, TAIL_R],
    filaments: [
      'M12 57.6 L56 54.8 L58.5 57.6 L56.8 60.6 L37 61.2',
      'M188 57.6 L144 54.8 L141.5 57.6 L143.2 60.6 L163 61.2',
    ],
  },
  reflections: ['M92 384 L150 384 L142 470 L100 470 Z', 'M240 384 L298 384 L290 470 L248 470 Z'],
};

/**
 * A sports bike from behind, parked upright, lit like the car. Mirrors and
 * clip-ons widest; the fairing an inverted shield behind; the rear tyre, the
 * silencer and the tail unit nearest, with a slim LED tail light under the
 * seat and the plate below it. Drawn larger than the car (it is smaller), so
 * it fills the same stage.
 */
export const BIKE: VehicleArt = {
  placement: { x: 50, y: 198.75, scale: 1.45 },
  shadow: { cx: 100, cy: 123.5, rx: 40, ry: 4.5 },
  bodyBox: [22, 100],
  layers: [
    // Mirrors on the fairing's shoulders, then the clip-ons and grips.
    { kind: 'solid', tone: 'trim', d: 'M80.5 31.5 L73 26.4 L74.4 24.8 L82 29.8 Z' },
    { kind: 'solid', tone: 'trim', d: 'M119.5 31.5 L127 26.4 L125.6 24.8 L118 29.8 Z' },
    { kind: 'solid', tone: 'trim', d: 'M58 25.2 C58 22.4 62 20.6 67 20.6 C72 20.6 76 22.4 76 25.2 C76 28 72 29.4 67 29.4 C62 29.4 58 28 58 25.2 Z' },
    { kind: 'solid', tone: 'trim', d: 'M124 25.2 C124 22.4 128 20.6 133 20.6 C138 20.6 142 22.4 142 25.2 C142 28 138 29.4 133 29.4 C128 29.4 124 28 124 25.2 Z' },
    { kind: 'solid', tone: 'trim', d: 'M84 35.6 L67 38.8 L67 41 L84 38 Z' },
    { kind: 'solid', tone: 'trim', d: 'M116 35.6 L133 38.8 L133 41 L116 38 Z' },
    { kind: 'solid', tone: 'tyre', d: 'M67 38.2 L60 39.4 Q58.6 40.3 60 41.2 L67 41.6 Z' },
    { kind: 'solid', tone: 'tyre', d: 'M133 38.2 L140 39.4 Q141.4 40.3 140 41.2 L133 41.6 Z' },
    // The fairing and tank: widest at the knees, tapering to the belly pan.
    {
      kind: 'body',
      d: 'M100 23 C110 23 117.5 26 121 32 L126 45 C127.6 50.5 126.6 56 123.4 61 L113.6 78 C112 80.6 109.6 82 106.6 82 L93.4 82 C90.4 82 88 80.6 86.4 78 L76.6 61 C73.4 56 72.4 50.5 74 45 L79 32 C82.5 26 90 23 100 23 Z',
    },
    { kind: 'edge', tone: 'flank', width: 1, d: 'M80.2 31 C86 25.6 93 23.9 100 23.9 C107 23.9 114 25.6 119.8 31' },
    { kind: 'edge', tone: 'shoulder', width: 0.8, d: 'M60 23 C62 21.6 64.4 21 67 21 C69.6 21 72 21.6 74 23' },
    { kind: 'edge', tone: 'shoulder', width: 0.8, d: 'M126 23 C128 21.6 130.4 21 133 21 C135.6 21 138 21.6 140 23' },
    // The rear tyre and its hugger, nearest of all at the bottom.
    { kind: 'solid', tone: 'tyre', d: 'M100 60 C106.4 60 110.4 64.4 110.4 70.6 V115.6 C110.4 121.4 106 125 100 125 C94 125 89.6 121.4 89.6 115.6 V70.6 C89.6 64.4 93.6 60 100 60 Z' },
    { kind: 'fins', d: 'M100 68 V120' },
    { kind: 'solid', tone: 'trim', d: 'M87.4 72 C87.4 63.4 93 58.2 100 58.2 C107 58.2 112.6 63.4 112.6 72 L110.4 72 C110.4 65.8 106 61.4 100 61.4 C94 61.4 89.6 65.8 89.6 72 Z' },
    // The silencer, low on the right, end on.
    { kind: 'body', d: 'M119.6 78 C124.2 78 127.6 81.6 127.6 86.2 V93.4 C127.6 98 124.2 101.4 119.6 101.4 C115 101.4 112.4 98 112.4 93.4 V86.2 C112.4 81.6 115 78 119.6 78 Z' },
    { kind: 'exhaust', cx: 120, cy: 93.6, r: 3.8 },
    // The seat and the tail unit, set off from the fairing by a dark gap.
    {
      kind: 'solid',
      tone: 'trim',
      d: 'M100 31.8 C108.8 31.8 114.2 35 115.2 40.6 L118.3 51 C119 54 117 56.2 113.8 56.2 L86.2 56.2 C83 56.2 81 54 81.7 51 L84.8 40.6 C85.8 35 91.2 31.8 100 31.8 Z',
    },
    {
      kind: 'body',
      d: 'M100 33 C108 33 113 36 114 41 L117 51 C117.6 53.5 116 55 113.5 55 L86.5 55 C84 55 82.4 53.5 83 51 L86 41 C87 36 92 33 100 33 Z',
    },
    { kind: 'edge', tone: 'roof', width: 1.1, d: 'M87.5 39 C89.5 35 94 33.6 100 33.6 C106 33.6 110.5 35 112.5 39' },
    { kind: 'edge', tone: 'flank', width: 0.8, d: 'M86.6 41.4 L83.6 51 M113.4 41.4 L116.4 51' },
    { kind: 'tint', e: { cx: 100, cy: 52, rx: 32, ry: 10 } },
    // Plate hanger, indicator pods, the plate.
    { kind: 'solid', tone: 'trim', d: 'M97 55 L103 55 L102.2 60.5 L97.8 60.5 Z' },
    { kind: 'solid', tone: 'trim', d: 'M81.4 62.6 C81.4 61.2 82.6 60.4 84 60.4 C85.4 60.4 86.6 61.2 86.6 62.6 C86.6 64 85.4 64.8 84 64.8 C82.6 64.8 81.4 64 81.4 62.6 Z' },
    { kind: 'solid', tone: 'trim', d: 'M113.4 62.6 C113.4 61.2 114.6 60.4 116 60.4 C117.4 60.4 118.6 61.2 118.6 62.6 C118.6 64 117.4 64.8 116 64.8 C114.6 64.8 113.4 64 113.4 62.6 Z' },
    { kind: 'plate', x: 89, y: 60.5, w: 22, h: 12, r: 1.5 },
  ],
  lights: {
    halos: [{ cx: 100, cy: 51, rx: 26, ry: 10 }],
    lenses: ['M86 48.6 L114 48.6 L112.2 53.2 L87.8 53.2 Z'],
    filaments: ['M89.5 50.9 L110.5 50.9'],
  },
  // Under the tail light: local x 86–114 at scale 1.45 from x 50.
  reflections: ['M176 384 L214 384 L209 470 L181 470 Z'],
};

/**
 * Where the lights layer needs to draw on the artboard: both tail lights'
 * halos at their blur's reach, and their reflections on the ground. Sized
 * to that, not the whole scene, so the layer that breathes is small.
 */
export const LIGHTS_BOX: Box = { x: 30, y: 210, w: 330, h: 274 };
