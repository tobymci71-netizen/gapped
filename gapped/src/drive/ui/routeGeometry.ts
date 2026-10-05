/**
 * Route geometry for the Driving tab's drawings: the row thumbnails and the
 * live map's polyline helpers. Pure, so the shapes are tested without a
 * canvas.
 *
 * Every shape here is drawn from the drive's own recorded fixes. Nothing is
 * smoothed into a nicer curve or invented to fill a gap: a thumbnail is the
 * route, shrunk.
 */

export type LatLon = { lat: number; lon: number };
export type Pt = { x: number; y: number };

/**
 * At most `max` points, evenly spaced by index, always keeping the first and
 * the last (the start ring and the finish dot sit on them). A 48pt tile
 * cannot resolve more than a few dozen; the full drive can be thousands.
 */
export function decimate<T>(points: readonly T[], max: number): T[] {
  const cap = Math.max(2, Math.floor(max));
  if (points.length <= cap) return points.slice();
  const out: T[] = [];
  const step = (points.length - 1) / (cap - 1);
  for (let i = 0; i < cap; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/**
 * Fit a route into a `width` × `height` box with `pad` clear on every side,
 * north up, keeping its real proportions.
 *
 * A degree of longitude is only cos(latitude) as long as a degree of
 * latitude — at 52°N, 0.62 of it — so longitudes are scaled by that, about
 * the route's middle latitude, before fitting. Without it a drive in Britain
 * came out 1.6 times as wide as it was. Equirectangular about one latitude is
 * exact to well under a pixel over anything a drive covers.
 *
 * Points must be finite. A route with no extent (one place) lands in the
 * middle of the box.
 */
export function projectRoute(
  points: readonly LatLon[],
  width: number,
  height: number,
  pad: number,
): Pt[] {
  if (points.length === 0) return [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const midLat = (minLat + maxLat) / 2;
  const k = Math.max(0.01, Math.cos((midLat * Math.PI) / 180));
  const spanX = (maxLon - minLon) * k;
  const spanY = maxLat - minLat;
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);
  const fitX = spanX > 0 ? innerW / spanX : Infinity;
  const fitY = spanY > 0 ? innerH / spanY : Infinity;
  const scale = Number.isFinite(Math.min(fitX, fitY)) ? Math.min(fitX, fitY) : 0;
  const ox = (width - spanX * scale) / 2;
  const oy = (height - spanY * scale) / 2;
  return points.map((p) => ({
    x: ox + (p.lon - minLon) * k * scale,
    // Latitude grows north, the screen grows down.
    y: height - (oy + (p.lat - minLat) * scale),
  }));
}

export type RouteThumb = {
  /** SVG path data, in the tile's own points. */
  d: string;
  /** Where the drive began: the white ring. */
  start: Pt;
  /**
   * Where it ended: the white dot. Null when it ended where it began — a
   * loop shows one ring, as the drive summary's "Start · finish" does.
   */
  end: Pt | null;
};

/** Thumbnail options. Defaults are the Driving mock's 48pt tile. */
export type RouteThumbOptions = { pad?: number; maxPoints?: number };

/** An end closer to the start than this share of the tile reads as a loop. */
const LOOP_FRACTION = 0.12;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A drive's route as a `size`-point square thumbnail, or null when there are
 * fewer than two fixes to draw a line between.
 */
export function routeThumb(
  points: readonly LatLon[],
  size: number,
  { pad = 7, maxPoints = 80 }: RouteThumbOptions = {},
): RouteThumb | null {
  const usable = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (usable.length < 2) return null;
  const pts = projectRoute(decimate(usable, maxPoints), size, size, pad);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${round1(p.x)} ${round1(p.y)}`).join(' ');
  const start = pts[0];
  const last = pts[pts.length - 1];
  const apart = Math.hypot(last.x - start.x, last.y - start.y) > size * LOOP_FRACTION;
  return {
    d,
    start: { x: round1(start.x), y: round1(start.y) },
    end: apart ? { x: round1(last.x), y: round1(last.y) } : null,
  };
}
