/**
 * The welcome hero (Nightrun-Welcome) as numbers: where the scene sits on a
 * given phone, the one clock every moving part reads, and the curves and
 * keyframes the approved mock animates with.
 *
 * Pure: no React, no Skia, no Reanimated, so the tests run without a device.
 * Everything the UI thread calls per frame is a worklet and allocates nothing.
 *
 * Coordinates are the mock's: a 390-wide scene with the vanishing point at
 * (195, 300). The component scales and centres that scene to the phone
 * (heroFit) and draws every road light as a ray from the vanishing point, so a
 * wider phone sees the same road carried on to its edges rather than a gap.
 */

// ─── The scene ───────────────────────────────────────────────────────────────

export const SCENE = {
  /** The mock's width; the scene's x runs 0 → 390 across it. */
  width: 390,
  /** The vanishing point: where the motorway meets the horizon. */
  vp: { x: 195, y: 300 },
  /**
   * The band that has to be on screen: from just above the G mark (its top
   * is 104) to under the "GPS lock" caption beneath the car (its baseline is
   * 500). The sky above and the road below may run off either edge.
   */
  top: 92,
  bottom: 508,
  /** Where the road starts to fade into the night under the copy (the mock's fade). */
  fadeTop: 440,
} as const;

/** The G mark's box in scene coordinates (the mock's left 80, top 104, width 230). */
export const MARK_BOX = { x: 80, y: 104, width: 230 } as const;

/** The scene placed on a phone: scale, then offset, in points. */
export type HeroFit = { s: number; tx: number; ty: number };

/** The scene never shrinks below this, however tall the copy grows. */
export const MIN_SCENE_SCALE = 0.55;

/**
 * Fits the scene's essential band (G mark to car) into the room above the
 * copy: as large as the phone's width allows, but no taller than the room,
 * centred in it.
 *
 * `bandTop` is just under the status bar; `bandBottom` just over the first
 * line of copy. When the room is too short even at the minimum scale (the
 * largest text sizes), the scene keeps its top in place and runs on under the
 * copy, where the fade darkens it: the mark stays whole, the road gives way.
 */
export function heroFit({
  width,
  bandTop,
  bandBottom,
}: {
  width: number;
  bandTop: number;
  bandBottom: number;
}): HeroFit {
  const span = SCENE.bottom - SCENE.top;
  const room = Math.max(0, bandBottom - bandTop);
  const s = Math.max(MIN_SCENE_SCALE, Math.min(width / SCENE.width, room / span));
  const tx = (width - SCENE.width * s) / 2;
  const ty = bandTop + Math.max(0, (room - span * s) / 2) - SCENE.top * s;
  return { s, tx, ty };
}

/** A scene point on screen. */
export function sceneToScreen(fit: HeroFit, x: number, y: number): { x: number; y: number } {
  return { x: fit.tx + x * fit.s, y: fit.ty + y * fit.s };
}

/**
 * How many times its length each light trail must run, out from the
 * vanishing point, to meet this phone's edges: 1 where the scene spans the
 * window (the mock's own trails, which end at its frame), more where the
 * scene is narrower than the window (a short phone at a large text size).
 *
 * The trails burst out by scaling about the vanishing point, so this is
 * also what makes the burst read as one: a trail drawn longer than it needs
 * would cross the screen in the first sliver of the burst and spend the rest
 * of it off screen. A hair past the edge, so a blurred trail's soft end is
 * never seen.
 */
export function trailReach(fit: HeroFit, width: number): number {
  const half = SCENE.width / 2;
  const left = -fit.tx / fit.s;
  const right = (width - fit.tx) / fit.s;
  const need = Math.max(half - left, right - half) / half;
  return Math.max(1, need) * TRAIL_OVERRUN;
}

/** How far past the window's edge a trail ends (4%). */
export const TRAIL_OVERRUN = 1.04;

/**
 * The room the hero gets on a phone: from under the status bar to over the
 * copy, but never less than the top 45% of the screen. Past that the copy
 * (at the largest text sizes) runs over the road, which the fade darkens.
 */
export function heroBand({
  height,
  insetTop,
  textTop,
}: {
  height: number;
  insetTop: number;
  /** Window y of the first line of copy; null before it has laid out. */
  textTop: number | null;
}): { bandTop: number; bandBottom: number } {
  const bandTop = insetTop + 16;
  const fallback = height * 0.62;
  const bandBottom = Math.max((textTop ?? fallback) - 12, height * 0.45);
  return { bandTop, bandBottom };
}

/**
 * Where the night closes over the road, in window points. The mock's own
 * fade, moved up when large text pushes the copy higher, so there is always
 * dark under the first line.
 */
export function fadeTopFor(fit: HeroFit, textTop: number | null): number {
  const fromScene = fit.ty + SCENE.fadeTop * fit.s;
  return textTop == null ? fromScene : Math.min(fromScene, textTop - 72);
}

// ─── Curves ──────────────────────────────────────────────────────────────────

export type Curve = readonly [number, number, number, number];

/** The mock's cubic-bezier() curves, by what they move. */
export const CURVE = {
  /** The light trails bursting out of the vanishing point. */
  burst: [0.16, 0.84, 0.24, 1],
  /** Things settling into place: the car, the reticle, each line of copy. */
  settle: [0.2, 0.7, 0.2, 1],
  /** The G mark rising out of the vanishing point. */
  emerge: [0.2, 0.75, 0.15, 1],
  /** CSS ease-in-out: the slow loops (the camera's drift, the flare's shimmer). */
  easeInOut: [0.42, 0, 0.58, 1],
} as const satisfies Record<string, Curve>;

/**
 * CSS cubic-bezier(x1, y1, x2, y2) at progress `x` (0–1). Solved by bisection
 * on the curve's x, which is monotonic for any CSS timing curve: 24 halvings
 * put t within 1e-7, and nothing here is iterated more than a few times a
 * frame.
 */
export function cubicBezier(c: Curve, x: number): number {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = c;
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    const u = 1 - t;
    const xt = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
    if (xt < x) lo = t;
    else hi = t;
  }
  const u = 1 - t;
  return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
}

export function clamp01(x: number): number {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** How far through an animation that starts `delay` ms in and lasts `duration`. */
export function segment(t: number, delay: number, duration: number): number {
  'worklet';
  return clamp01((t - delay) / duration);
}

/** A CSS keyframe list, linear between stops: [[at, value], …], `at` ascending 0 → 1. */
export type Keyframes = readonly (readonly [number, number])[];

export function keyframes(p: number, stops: Keyframes): number {
  'worklet';
  if (p <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [at, v] = stops[i];
    if (p <= at) {
      const [at0, v0] = stops[i - 1];
      return at === at0 ? v : v0 + ((v - v0) * (p - at0)) / (at - at0);
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * An `alternate infinite` CSS loop's progress: 0 → 1 over `period`, then back,
 * starting `delay` ms in (0 until then).
 */
export function alternate(t: number, delay: number, period: number): number {
  'worklet';
  if (t <= delay) return 0;
  const k = (t - delay) / period;
  const cycle = Math.floor(k);
  const f = k - cycle;
  return cycle % 2 === 0 ? f : 1 - f;
}

// ─── The road rushing past ───────────────────────────────────────────────────

/**
 * How far along its run a looping road light is, 0 → 1: `lead` ms is how far
 * ahead it started (the mock's negative animation-delay), so a row of lights
 * on one period is spread along the road rather than bunched.
 */
export function loopPhase(t: number, period: number, lead: number): number {
  'worklet';
  const k = (t + lead) % period;
  return (k < 0 ? k + period : k) / period;
}

/**
 * The scale about the vanishing point of something travelling toward the
 * camera at a constant speed: 1 at the horizon, 20× as it passes. Perspective
 * makes that 1 / (1 − 0.95f), which is exactly the mock's twelve-keyframe
 * table (20% → 1.235, 55% → 2.094, 95% → 10.26).
 */
export function approachScale(f: number): number {
  'worklet';
  return 1 / (1 - 0.95 * clamp01(f));
}

/** Fades in over the first 8% of the run, as each light leaves the haze. */
export function approachOpacity(f: number): number {
  'worklet';
  return clamp01(f / 0.08);
}

/** One looping road light: its period and how far ahead it starts (ms). */
export type Runner = { period: number; lead: number; reverse?: boolean };

const spread = (period: number, count: number): Runner[] =>
  Array.from({ length: count }, (_, i) => ({ period, lead: Math.round((period * i) / count) }));

/** The mock's road lights, timed as it times them. */
export const RUNNERS = {
  /** Lamp posts on the hard shoulder, one every 0.7 s. */
  lamps: spread(2800, 4),
  /** Red studs along the edge line. */
  studs: spread(2200, 6),
  /** Lane dashes, both lanes, one every 0.44 s. */
  dashes: spread(2200, 5),
  /** White glints running out along the oncoming trails. */
  whiteGlints: [
    { period: 1900, lead: 300 },
    { period: 1900, lead: 1200 },
    { period: 1900, lead: 800 },
  ],
  /** Red glints running back into the tail-light trails (animation-direction: reverse). */
  redGlints: [600, 2100, 2900, 1500, 200, 1100].map((lead) => ({
    period: 3400,
    lead,
    reverse: true,
  })),
} as const satisfies Record<string, readonly Runner[]>;

/** A runner's progress along the road at clock `t`. */
export function runnerPhase(r: Runner, t: number): number {
  'worklet';
  const p = loopPhase(t, r.period, r.lead);
  return r.reverse ? 1 - p : p;
}

// ─── The intro, on one clock ─────────────────────────────────────────────────

/**
 * Every beat of the mock's entrance, in ms from the start of the intro. One
 * clock drives them all, so the scene can pause (screen not focused, page
 * swiped away) and pick up exactly where it was.
 */
export const INTRO = {
  /** The trails burst out of the vanishing point. */
  burst: { delay: 150, duration: 1700 },
  /** The car rolls up into frame. */
  carIn: { delay: 200, duration: 1200 },
  /** The tail lights catch, flicker and hold. */
  ignite: { delay: 0, duration: 2600 },
  /** The reticle locks onto the car. */
  lock: { delay: 2000, duration: 700 },
  /** The G mark rises out of the vanishing point (no splash to bring it). */
  mark: { delay: 850, duration: 1500 },
  /** The red glow behind the mark swells and settles. */
  flare: { delay: 800, duration: 2200 },
  /** The camera's slow push-in, out and back. */
  drift: { delay: 2600, period: 14000 },
  /** The horizon flare dimming and back. */
  shimmer: { delay: 2200, period: 4800 },
  /** The mast's warning light. */
  blink: { period: 2600 },
  /** The GPS caption's dot. */
  gpsBlink: { delay: 2700, period: 1600 },
  /** A tail light's slow breathe, one way. */
  breathe: { delay: 2600, period: 3600 },
  /** Each line of copy rises this long after the one before it. */
  copyStep: 150,
  copyDuration: 900,
} as const;

/**
 * When the copy starts to rise. Without a splash (the intro remounted) the
 * mock's own 1.25 s, after the mark has risen. After the splash the mark is
 * already up, and the copy follows it at once rather than waiting out a rise
 * that has already happened.
 */
export const COPY_START = { afterSplash: 450, cold: 1250 } as const;

/** The copy's rows in order: three title lines, the line under them, the button. */
export const COPY_ROWS = { title: [0, 1, 2], body: 3, button: 4 } as const;

/** Everything has landed by now; the loops carry on alone. */
export const INTRO_END_MS =
  COPY_START.cold + COPY_ROWS.button * INTRO.copyStep + INTRO.copyDuration;

/**
 * The still frame Reduce Motion gets: the clock stopped well after every
 * entrance has landed, the road lights where that moment left them.
 */
export const STILL_MS = 4200;

/** The tail lights catching: dark, a flicker, a stutter, then on. */
export const IGNITE: Keyframes = [
  [0, 0],
  [0.38, 0],
  [0.42, 0.9],
  [0.45, 0.2],
  [0.5, 1],
  [1, 1],
];

/** A warning light's blink: dim, a long flash, dim. */
export const BLINK: Keyframes = [
  [0, 0.15],
  [0.06, 1],
  [0.2, 1],
  [0.28, 0.15],
  [1, 0.15],
];

/** The flare behind the mark: up to full, settling at 62%. */
export const FLARE: Keyframes = [
  [0, 0],
  [0.45, 1],
  [1, 0.62],
];

export function igniteAt(t: number): number {
  'worklet';
  return keyframes(segment(t, INTRO.ignite.delay, INTRO.ignite.duration), IGNITE);
}

export function carInAt(t: number): number {
  'worklet';
  return cubicBezier(CURVE.settle, segment(t, INTRO.carIn.delay, INTRO.carIn.duration));
}

export function lockAt(t: number): number {
  'worklet';
  return cubicBezier(CURVE.settle, segment(t, INTRO.lock.delay, INTRO.lock.duration));
}

export function flareAt(t: number): number {
  'worklet';
  return keyframes(segment(t, INTRO.flare.delay, INTRO.flare.duration), FLARE);
}

/** The mark's rise: opacity, and the eased progress its scale and lift follow. */
export function markRiseAt(t: number): { opacity: number; e: number } {
  'worklet';
  const p = segment(t, INTRO.mark.delay, INTRO.mark.duration);
  return { opacity: cubicBezier(CURVE.emerge, clamp01(p / 0.55)), e: cubicBezier(CURVE.emerge, p) };
}

/** The whole copy cascade, from the first row starting to the last landing (ms). */
export const COPY_TOTAL_MS = COPY_ROWS.button * INTRO.copyStep + INTRO.copyDuration;

/**
 * A row of copy rising into place, 0 → 1, from how far the cascade has run
 * (0 → 1 over COPY_TOTAL_MS): each row starts copyStep after the one above.
 */
export function copyRowAt(cascade: number, row: number): number {
  'worklet';
  return cubicBezier(
    CURVE.settle,
    segment(cascade * COPY_TOTAL_MS, row * INTRO.copyStep, INTRO.copyDuration),
  );
}

/** The camera's push-in, as a scale about the vanishing point (1 → 1.045). */
export function driftAt(t: number): number {
  'worklet';
  return (
    1 + 0.045 * cubicBezier(CURVE.easeInOut, alternate(t, INTRO.drift.delay, INTRO.drift.period))
  );
}

/** The horizon flare's opacity (1 → 0.55 and back). */
export function shimmerAt(t: number): number {
  'worklet';
  return (
    1 - 0.45 * cubicBezier(CURVE.easeInOut, alternate(t, INTRO.shimmer.delay, INTRO.shimmer.period))
  );
}

/** The tail lights' halo breathing (1 → 0.82 and back), once they are on. */
export function breatheAt(t: number): number {
  'worklet';
  return (
    1 - 0.18 * cubicBezier(CURVE.easeInOut, alternate(t, INTRO.breathe.delay, INTRO.breathe.period))
  );
}

export function blinkAt(t: number, period: number, delay = 0): number {
  'worklet';
  if (t < delay) return BLINK[0][1];
  return keyframes(loopPhase(t - delay, period, 0), BLINK);
}
