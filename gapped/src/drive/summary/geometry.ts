/**
 * The drive summary's drawings, as numbers: where a route lands on the map,
 * how long its scale bar is, where its direction chevrons sit, and the speed
 * trace's points, ticks and peak (Nightrun-Summary).
 *
 * Everything here is worked out from the drive's real fixes. Nothing is
 * smoothed into a shape it did not have, and nothing is invented to fill a
 * gap: a route too short to carry a chevron gets none, a trace with no time
 * span is not drawn, and the scale bar measures the projection the route is
 * actually drawn with.
 *
 * Pure: no React, no Skia, no stores, so every figure is tested
 * (__tests__/geometry.test.ts).
 */

import { deriveSpeeds, gateFixes, haversineM } from '@/drive/stats';
import type { Fix } from '@/drive/types';
import { speedForDisplay, type UnitPref } from '@/drive/units';

/** Metres per degree of latitude (and of longitude at the equator). */
const M_PER_DEG = 111_320;

export type Box = { x: number; y: number; width: number; height: number };
export type Pt = { x: number; y: number };

export type RouteProjection = {
  /** The route in drawing order (the order it was driven), in points. */
  points: Pt[];
  /** Points per metre: the same in both directions, so the shape is true. */
  pxPerMetre: number;
  /** The route's extent on the ground, metres (the larger of east–west and north–south). */
  extentM: number;
  /** Centre of the drawn route, for the light it throws on the map. */
  centre: Pt;
};

/**
 * The fixes a picture of the route is drawn from: the accuracy-gated stream
 * the summary itself is computed from, so a fix too poor to count toward the
 * distance cannot put a spike on the map. Falls back to every fix when the
 * gate leaves fewer than two (an old drive without accuracy readings).
 *
 * Only fixes with a real position: two or more of these is exactly what
 * projectRoute needs to draw, so a screen that checks `length > 1` before
 * placing the map (and the plate that overlaps it) is never left with an
 * empty slot.
 */
export function routeFixes(fixes: readonly Fix[]): Fix[] {
  const placed = fixes.filter(hasPosition);
  const gated = gateFixes(placed);
  return gated.length >= 2 ? gated : placed;
}

function hasPosition(f: Fix): boolean {
  return Number.isFinite(f.lat) && Number.isFinite(f.lon) && Math.abs(f.lat) <= 90;
}

/**
 * Fits the route into `box`, north up, with a true scale.
 *
 * An equirectangular projection about the route's middle latitude: longitude
 * is shortened by cos(latitude), so a square mile is square on the screen.
 * (Plotting raw degrees, as the old route tile did, stretched every route
 * east–west — by 1.6× at the UK's latitude — and no scale bar could be true.)
 *
 * A route smaller than `minSpanM` is drawn at that span rather than blown up
 * to fill the box. Consecutive points closer than `minStepPx` are merged: a
 * long drive is thousands of fixes, and a point per half-pixel is all a
 * screen can show.
 */
export function projectRoute(
  fixes: readonly Fix[],
  box: Box,
  { minSpanM = 100, minStepPx = 0.75 }: { minSpanM?: number; minStepPx?: number } = {},
): RouteProjection | null {
  const usable = fixes.filter(hasPosition);
  if (usable.length < 2 || box.width <= 0 || box.height <= 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const f of usable) {
    minLat = Math.min(minLat, f.lat);
    maxLat = Math.max(maxLat, f.lat);
    minLon = Math.min(minLon, f.lon);
    maxLon = Math.max(maxLon, f.lon);
  }
  const lat0 = (minLat + maxLat) / 2;
  const lon0 = (minLon + maxLon) / 2;
  const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const ky = M_PER_DEG;
  const widthM = (maxLon - minLon) * kx;
  const heightM = (maxLat - minLat) * ky;
  const pxPerMetre = Math.min(
    box.width / Math.max(widthM, minSpanM),
    box.height / Math.max(heightM, minSpanM),
  );
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const points: Pt[] = [];
  for (let i = 0; i < usable.length; i++) {
    const f = usable[i];
    const p = {
      x: cx + (f.lon - lon0) * kx * pxPerMetre,
      // Latitude grows north, the screen grows down.
      y: cy - (f.lat - lat0) * ky * pxPerMetre,
    };
    const last = points[points.length - 1];
    const isEnd = i === usable.length - 1;
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minStepPx) {
      points.push(p);
    } else if (isEnd) {
      // Always end where the drive ended.
      points[points.length - 1] = p;
    }
  }
  if (points.length < 2) points.push({ ...points[0] });

  return {
    points,
    pxPerMetre,
    extentM: Math.max(widthM, heightM),
    centre: { x: cx, y: cy },
  };
}

/** Cumulative length along a polyline: lengths[i] is the distance to points[i]. */
export function cumulativeLengths(points: readonly Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return out;
}

/**
 * The point `fraction` of the way along the polyline, and the direction of
 * travel there in degrees (0 = east, 90 = south, as the screen's y runs).
 * Fractions are of length, as Skia's path trim is, so a chevron placed here
 * sits exactly where the drawn trail passes that fraction.
 */
export function pointAlong(
  points: readonly Pt[],
  fraction: number,
  lengths: readonly number[] = cumulativeLengths(points),
): { x: number; y: number; angle: number } {
  const total = lengths[lengths.length - 1];
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let i = 1;
  while (i < points.length - 1 && lengths[i] < target) i++;
  const a = points[i - 1];
  const b = points[i];
  const seg = lengths[i] - lengths[i - 1];
  const t = seg > 0 ? (target - lengths[i - 1]) / seg : 0;
  // The direction over a short window around the point, so one jittery fix
  // does not point the chevron sideways.
  const back = points[Math.max(0, i - 3)];
  const ahead = points[Math.min(points.length - 1, i + 2)];
  const angle = (Math.atan2(ahead.y - back.y, ahead.x - back.x) * 180) / Math.PI;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle };
}

/**
 * Where the direction chevrons go, as fractions of the route's length: none
 * on a route too short to show one without crowding the start marker, two on
 * an ordinary drive (the mock's), three on a long one.
 */
export function chevronFractions(lengthPx: number): number[] {
  if (lengthPx < 80) return [];
  if (lengthPx < 180) return [0.5];
  if (lengthPx < 700) return [0.34, 0.67];
  return [0.25, 0.5, 0.75];
}

/**
 * Whether the drive ended where it began, so one marker reads
 * "Start · finish". Within 150 m, or 5% of the route's extent for a long one:
 * a loop that parks a street away from where it set off is still a loop.
 */
export function endsWhereItStarted(fixes: readonly Fix[], extentM: number): boolean {
  if (fixes.length < 2) return false;
  const a = fixes[0];
  const b = fixes[fixes.length - 1];
  return haversineM(a.lat, a.lon, b.lat, b.lon) <= Math.max(150, extentM * 0.05);
}

export type LabelPlacement = {
  /** Which side of its marker the label sits. */
  side: 'left' | 'right';
  /** Nudge from the marker's centre line, points (negative is up). */
  dy: number;
};

/**
 * Where the markers' labels go. Each on the side of its marker with room
 * (left of anything past `leftOf`, else right). When the start and finish
 * are near each other but not near enough to share a marker, both labels
 * take the side their midpoint would, and part vertically — the upper
 * marker's label up, the lower's down — so "Start" and "Finish" never print
 * over each other.
 */
export function markerLabels(
  start: Pt,
  /** Null for a loop: one marker, one label. */
  finish: Pt | null,
  { leftOf = 120, near = { dx: 140, dy: 18 }, part = 8 } = {},
): { start: LabelPlacement; finish: LabelPlacement } {
  const sideOf = (x: number): LabelPlacement['side'] => (x > leftOf ? 'left' : 'right');
  if (!finish) {
    const alone = { side: sideOf(start.x), dy: 0 };
    return { start: alone, finish: alone };
  }
  const dx = finish.x - start.x;
  const dy = finish.y - start.y;
  if (Math.abs(dx) < near.dx && Math.abs(dy) < near.dy) {
    const side = sideOf((start.x + finish.x) / 2);
    const finishLower = dy >= 0;
    return {
      start: { side, dy: finishLower ? -part : part },
      finish: { side, dy: finishLower ? part : -part },
    };
  }
  return { start: { side: sideOf(start.x), dy: 0 }, finish: { side: sideOf(finish.x), dy: 0 } };
}

export type ScaleBar = {
  /** Length on screen, points. */
  px: number;
  /** "2 mi", "500 ft", "200 m", "1 km". */
  label: string;
  /** What VoiceOver says: "2 miles". */
  spoken: string;
  /** The distance the bar stands for, metres. */
  metres: number;
};

type ScaleStep = { metres: number; label: string; spoken: string };

const MI = 1609.344;
const FT = 0.3048;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const IMPERIAL_STEPS: ScaleStep[] = [
  ...[50, 100, 200, 500].map((ft) => ({
    metres: ft * FT,
    label: `${ft} ft`,
    spoken: plural(ft, 'foot', 'feet'),
  })),
  ...[0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].map((mi) => ({
    metres: mi * MI,
    label: `${mi} mi`,
    spoken: plural(mi, 'mile', 'miles'),
  })),
];

const METRIC_STEPS: ScaleStep[] = [
  ...[10, 20, 50, 100, 200, 500].map((m) => ({
    metres: m,
    label: `${m} m`,
    spoken: plural(m, 'metre', 'metres'),
  })),
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500].map((km) => ({
    metres: km * 1000,
    label: `${km} km`,
    spoken: plural(km, 'kilometre', 'kilometres'),
  })),
];

/**
 * A scale bar for a map drawn at `pxPerMetre`: a round distance in the
 * person's units (1, 2 or 5 of something) whose bar is as near `targetPx`
 * long as the steps allow and never longer than `maxPx`. Measured from the
 * projection the route is drawn with, so it is true of that route.
 */
export function scaleBar(
  pxPerMetre: number,
  pref: UnitPref,
  { targetPx = 56, maxPx = 84 }: { targetPx?: number; maxPx?: number } = {},
): ScaleBar | null {
  if (!Number.isFinite(pxPerMetre) || pxPerMetre <= 0) return null;
  const steps = pref === 'imperial' ? IMPERIAL_STEPS : METRIC_STEPS;
  let best: ScaleStep | null = null;
  let bestErr = Infinity;
  for (const step of steps) {
    const px = step.metres * pxPerMetre;
    if (px > maxPx) continue;
    const err = Math.abs(Math.log(px / targetPx));
    if (err < bestErr) {
      best = step;
      bestErr = err;
    }
  }
  best = best ?? steps[0];
  return {
    px: best.metres * pxPerMetre,
    label: best.label,
    spoken: best.spoken,
    metres: best.metres,
  };
}

// ---------------------------------------------------------------------------
// The speed trace

export type SpeedTrace = {
  /** The trace in display units, x as a fraction of the drive's time (0–1). */
  points: { f: number; v: number }[];
  /** The fastest moment: when (fraction) and how fast (display units). */
  peak: { f: number; v: number; t: number };
  /** First and last fix, epoch ms: the time axis. */
  t0: number;
  t1: number;
  /** The value at the top of the plot (display units). */
  yMax: number;
  /** Horizontal rules, display units ("30", "60"). */
  ticks: number[];
};

const SPEED_STEPS = [5, 10, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 250];

/**
 * The rule spacing for a trace that peaks at `peak`: the smallest round step
 * that puts no more than two and a half steps under the peak, so a trace
 * gets two rules (the mock's 30 and 60 under a 65 mph peak).
 */
export function speedTickStep(peak: number): number {
  for (const step of SPEED_STEPS) if (peak / step <= 2.5) return step;
  return SPEED_STEPS[SPEED_STEPS.length - 1];
}

/**
 * Speed over the drive, from the same gated, smoothed stream the summary's
 * top and average speed come from (stats.summarize), so the trace's peak is
 * the top speed shown above it.
 *
 * `columns` caps the points: each column keeps its slowest and fastest
 * sample, in the order they happened, so thinning a long drive can never
 * shave the peak or fill in a stop.
 */
export function speedTrace(
  fixes: readonly Fix[],
  pref: UnitPref,
  columns = 320,
): SpeedTrace | null {
  const gated = gateFixes([...fixes]);
  if (gated.length < 2) return null;
  const t0 = gated[0].t;
  const t1 = gated[gated.length - 1].t;
  const span = t1 - t0;
  if (!(span > 0)) return null;

  const speeds = deriveSpeeds(gated).map((ms) => speedForDisplay(ms, pref).value as number);
  let peakIdx = 0;
  for (let i = 1; i < speeds.length; i++) if (speeds[i] > speeds[peakIdx]) peakIdx = i;
  const peakV = speeds[peakIdx];

  const n = Math.max(1, Math.floor(columns));
  const points: { f: number; v: number }[] = [];
  if (gated.length <= n * 2) {
    for (let i = 0; i < gated.length; i++) points.push({ f: (gated[i].t - t0) / span, v: speeds[i] });
  } else {
    let col = -1;
    let lo = -1;
    let hi = -1;
    const flush = () => {
      if (lo < 0) return;
      const pair = lo === hi ? [lo] : lo < hi ? [lo, hi] : [hi, lo];
      for (const i of pair) points.push({ f: (gated[i].t - t0) / span, v: speeds[i] });
    };
    for (let i = 0; i < gated.length; i++) {
      const c = Math.min(n - 1, Math.floor(((gated[i].t - t0) / span) * n));
      if (c !== col) {
        flush();
        col = c;
        lo = i;
        hi = i;
      } else {
        if (speeds[i] < speeds[lo]) lo = i;
        if (speeds[i] > speeds[hi]) hi = i;
      }
    }
    flush();
  }

  const step = speedTickStep(peakV);
  const ticks: number[] = [];
  for (let v = step; v <= peakV + 1e-9; v += step) ticks.push(v);
  const yMax = Math.max(peakV * 1.15, (ticks[ticks.length - 1] ?? step) * 1.1, 1);

  return {
    points,
    peak: { f: (gated[peakIdx].t - t0) / span, v: peakV, t: gated[peakIdx].t },
    t0,
    t1,
    yMax,
    ticks,
  };
}

/** Minutes between time-axis ticks, smallest first. */
const TICK_MINUTES = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360];

/**
 * The time axis's inner ticks: round local times (":05", ":10", or whole
 * hours on a long drive) strictly between the first and last fix, no more
 * than `maxInner` of them. `offsetMs` gives the local zone's offset from UTC
 * at a moment (default: the device's), so ticks land on the clock the person
 * reads, half-hour zones included.
 */
export function timeTicks(
  t0: number,
  t1: number,
  {
    maxInner = 4,
    offsetMs = (t: number) => -new Date(t).getTimezoneOffset() * 60_000,
  }: { maxInner?: number; offsetMs?: (t: number) => number } = {},
): number[] {
  const span = t1 - t0;
  if (!(span > 0)) return [];
  const offset = offsetMs(t0);
  for (const minutes of TICK_MINUTES) {
    const step = minutes * 60_000;
    const out: number[] = [];
    let t = Math.ceil((t0 + offset) / step) * step - offset;
    if (t <= t0) t += step;
    for (; t < t1; t += step) out.push(t);
    if (out.length <= maxInner) return out;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Peak g-force

export type GRing = {
  /** The outer ring's value, g: the scale the peak is drawn against. */
  outer: number;
  /** The peak as a fraction of the outer ring's radius (0–1). */
  fraction: number;
};

const G_RINGS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

/**
 * The g-circle's scale: the smallest round ring at or above the peak. The
 * peak is drawn as a ring at its own radius, not a dot at an angle — the
 * summary knows how hard the car pulled, not which way the phone's axes
 * pointed in it, and a friction-circle dot would claim a direction.
 */
export function gRing(peakG: number): GRing {
  const g = Number.isFinite(peakG) && peakG > 0 ? peakG : 0;
  const outer = G_RINGS.find((r) => r >= g) ?? Math.ceil(g);
  return { outer, fraction: outer > 0 ? Math.min(1, g / outer) : 0 };
}
