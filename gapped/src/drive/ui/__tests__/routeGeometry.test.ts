/**
 * The Driving tab's route thumbnails are the drive's own fixes, shrunk: the
 * shape must survive (true proportions, north up), the ends must be where the
 * drive began and ended, and nothing is drawn from fewer than two fixes.
 */

import { decimate, projectRoute, routeThumb } from '../routeGeometry';

describe('decimate', () => {
  it('keeps short routes whole', () => {
    expect(decimate([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('caps long routes and always keeps both ends', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => i);
    const out = decimate(pts, 50);
    expect(out).toHaveLength(50);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(999);
    // Evenly spread, in order.
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });
});

describe('projectRoute', () => {
  it('draws north up: a drive due north goes up the screen', () => {
    const [a, b] = projectRoute(
      [
        { lat: 51.5, lon: -0.1 },
        { lat: 51.6, lon: -0.1 },
      ],
      48,
      48,
      7,
    );
    expect(b.y).toBeLessThan(a.y);
    expect(b.x).toBeCloseTo(a.x, 6);
  });

  it('keeps true proportions at high latitude (a degree of longitude is shorter)', () => {
    // A square on the ground at 52°N: 1 km east, 1 km north.
    const lat = 52;
    const dLat = 1 / 111.32;
    const dLon = 1 / (111.32 * Math.cos((lat * Math.PI) / 180));
    const pts = projectRoute(
      [
        { lat, lon: 0 },
        { lat, lon: dLon },
        { lat: lat + dLat, lon: dLon },
      ],
      100,
      100,
      0,
    );
    const width = Math.abs(pts[1].x - pts[0].x);
    const height = Math.abs(pts[2].y - pts[1].y);
    expect(width / height).toBeCloseTo(1, 2);
  });

  it('fits inside the padding and centres the short side', () => {
    const pts = projectRoute(
      [
        { lat: 0, lon: 0 },
        { lat: 0, lon: 1 },
      ],
      48,
      48,
      7,
    );
    expect(pts[0].x).toBeCloseTo(7, 6);
    expect(pts[1].x).toBeCloseTo(41, 6);
    expect(pts[0].y).toBeCloseTo(24, 6);
  });

  it('puts a route with no extent in the middle rather than dividing by zero', () => {
    const pts = projectRoute(
      [
        { lat: 10, lon: 10 },
        { lat: 10, lon: 10 },
      ],
      48,
      48,
      7,
    );
    expect(pts).toEqual([
      { x: 24, y: 24 },
      { x: 24, y: 24 },
    ]);
  });
});

describe('routeThumb', () => {
  it('draws nothing from fewer than two usable fixes', () => {
    expect(routeThumb([], 48)).toBeNull();
    expect(routeThumb([{ lat: 1, lon: 1 }], 48)).toBeNull();
    expect(
      routeThumb(
        [
          { lat: 1, lon: 1 },
          { lat: NaN, lon: 1 },
        ],
        48,
      ),
    ).toBeNull();
  });

  it('marks the start, and the end when the drive did not come back', () => {
    const t = routeThumb(
      [
        { lat: 0, lon: 0 },
        { lat: 0.01, lon: 0.005 },
        { lat: 0.02, lon: 0.02 },
      ],
      48,
    );
    expect(t).not.toBeNull();
    expect(t!.d.startsWith('M')).toBe(true);
    expect(t!.d.split('L')).toHaveLength(3);
    expect(t!.end).not.toBeNull();
    // South-west start, north-east finish.
    expect(t!.start.x).toBeLessThan(t!.end!.x);
    expect(t!.start.y).toBeGreaterThan(t!.end!.y);
  });

  it('shows a loop with one ring', () => {
    const loop = [
      { lat: 0, lon: 0 },
      { lat: 0.01, lon: 0 },
      { lat: 0.01, lon: 0.01 },
      { lat: 0, lon: 0.01 },
      { lat: 0.0001, lon: 0.0001 },
    ];
    expect(routeThumb(loop, 48)!.end).toBeNull();
  });

  it('caps the points it draws for a long drive', () => {
    const long = Array.from({ length: 5000 }, (_, i) => ({
      lat: i * 1e-5,
      lon: Math.sin(i / 50) * 1e-3,
    }));
    const t = routeThumb(long, 48, { maxPoints: 60 })!;
    expect(t.d.split('L')).toHaveLength(60);
  });
});
