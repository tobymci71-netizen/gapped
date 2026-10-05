/**
 * The drive summary's drawings are measurements: the route keeps its true
 * shape, the scale bar is true of the projection the route is drawn with, the
 * speed trace peaks at the summary's own top speed, and the time axis lands
 * on the clock the driver reads.
 */

import { summarize } from '@/drive/stats';
import type { Fix } from '@/drive/types';
import { msToKmh, msToMph } from '@/drive/units';
import { degrees, epochMs, metres, mps } from '@/types/units';
import { traceFromSpeeds } from '@/drive/__tests__/fixtures';
import {
  chevronFractions,
  cumulativeLengths,
  endsWhereItStarted,
  gRing,
  markerLabels,
  pointAlong,
  projectRoute,
  routeFixes,
  scaleBar,
  speedTickStep,
  speedTrace,
  timeTicks,
} from '../geometry';

const LAT = 51.5;
const M_PER_DEG = 111_320;
const KX = M_PER_DEG * Math.cos((LAT * Math.PI) / 180);

/** A fix at (east, north) metres from a fixed origin. */
function fixAt(eastM: number, northM: number, t: number, accuracyM = 5): Fix {
  return {
    t: epochMs(t),
    lat: degrees(LAT + northM / M_PER_DEG),
    lon: degrees(-0.12 + eastM / KX),
    speedMs: mps(15),
    accuracyM: metres(accuracyM),
  };
}

/** A square loop, `side` metres a side, driven anticlockwise from its south-west corner. */
function squareLoop(side: number, perSide = 20): Fix[] {
  const corners = [
    [0, 0],
    [side, 0],
    [side, side],
    [0, side],
    [0, 0],
  ];
  const out: Fix[] = [];
  let t = 1_700_000_000_000;
  for (let c = 0; c < 4; c++) {
    const [ax, ay] = corners[c];
    const [bx, by] = corners[c + 1];
    for (let i = 0; i < perSide; i++) {
      const f = i / perSide;
      out.push(fixAt(ax + (bx - ax) * f, ay + (by - ay) * f, t));
      t += 1000;
    }
  }
  out.push(fixAt(0, 0, t));
  return out;
}

const BOX = { x: 0, y: 0, width: 300, height: 150 };

describe('projectRoute', () => {
  test('keeps a square square: one scale for east–west and north–south', () => {
    const p = projectRoute(squareLoop(2000), BOX)!;
    const xs = p.points.map((q) => q.x);
    const ys = p.points.map((q) => q.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    // Raw degrees would stretch it 1.6× east–west at this latitude.
    expect(w / h).toBeCloseTo(1, 2);
    expect(w).toBeCloseTo(2000 * p.pxPerMetre, 0);
    expect(p.extentM).toBeCloseTo(2000, -1);
  });

  test('north is up and the route is drawn in the order it was driven', () => {
    const fixes = [fixAt(0, 0, 0), fixAt(0, 500, 1000), fixAt(0, 1000, 2000)];
    const p = projectRoute(fixes, BOX)!;
    expect(p.points[0].y).toBeGreaterThan(p.points[p.points.length - 1].y);
  });

  test('fits inside its box, centred', () => {
    const p = projectRoute(squareLoop(5000), { x: 34, y: 46, width: 322, height: 148 })!;
    for (const q of p.points) {
      expect(q.x).toBeGreaterThanOrEqual(34 - 1e-6);
      expect(q.x).toBeLessThanOrEqual(356 + 1e-6);
      expect(q.y).toBeGreaterThanOrEqual(46 - 1e-6);
      expect(q.y).toBeLessThanOrEqual(194 + 1e-6);
    }
  });

  test('a tiny route is not blown up to fill the box', () => {
    const p = projectRoute([fixAt(0, 0, 0), fixAt(5, 0, 1000)], BOX)!;
    expect(p.pxPerMetre).toBeCloseTo(150 / 100, 5);
  });

  test('merges points closer than a pixel, keeping the last', () => {
    const fixes = Array.from({ length: 1000 }, (_, i) => fixAt(i, 0, i * 1000));
    const p = projectRoute(fixes, BOX)!;
    expect(p.points.length).toBeLessThan(500);
    const last = p.points[p.points.length - 1];
    expect(last.x).toBeCloseTo(150 + (999 / 2) * p.pxPerMetre, 3);
  });

  test('nothing to draw from fewer than two fixes', () => {
    expect(projectRoute([fixAt(0, 0, 0)], BOX)).toBeNull();
  });
});

describe('routeFixes', () => {
  test('drops fixes too poor to count toward the distance', () => {
    const fixes = [fixAt(0, 0, 0), fixAt(5000, 5000, 1000, 400), fixAt(10, 0, 2000)];
    expect(routeFixes(fixes)).toHaveLength(2);
  });

  test('falls back to every fix when the gate would leave nothing to draw', () => {
    const fixes = [fixAt(0, 0, 0, 400), fixAt(10, 0, 1000, 400)];
    expect(routeFixes(fixes)).toHaveLength(2);
  });

  test('keeps only fixes with a position, so two of them always draw', () => {
    // The screen places the map, and the distance plate over it, when
    // routeFixes returns two or more: projectRoute must then draw.
    const broken = { ...fixAt(0, 0, 500), lat: degrees(Number.NaN) };
    const fixes = [fixAt(0, 0, 0, 400), broken, fixAt(10, 0, 1000, 400)];
    const drawn = routeFixes(fixes);
    expect(drawn).toHaveLength(2);
    expect(projectRoute(drawn, BOX)).not.toBeNull();
    expect(routeFixes([fixAt(0, 0, 0), broken])).toHaveLength(1);
  });
});

describe('scaleBar', () => {
  test('is measured from the projection it labels', () => {
    // 10 km across 300 pt: 0.03 pt per metre.
    const bar = scaleBar(0.03, 'metric')!;
    expect(bar.label).toBe('2 km');
    expect(bar.px).toBeCloseTo(60, 6);
    expect(bar.px).toBeCloseTo(bar.metres * 0.03, 6);
  });

  test('in miles for imperial, and never longer than its limit', () => {
    const bar = scaleBar(0.03, 'imperial')!;
    // 2 mi would be 97 pt, past the 84 pt limit.
    expect(bar.label).toBe('1 mi');
    expect(bar.spoken).toBe('1 mile');
    expect(bar.px).toBeCloseTo(1609.344 * 0.03, 6);
  });

  test('feet and metres for a short drive', () => {
    // Half a point per metre: 500 ft is 76 pt, nearer 56 than 200 ft's 30.
    expect(scaleBar(0.5, 'imperial')!.label).toBe('500 ft');
    expect(scaleBar(0.5, 'metric')!.label).toBe('100 m');
  });

  test('a square loop drawn at its own scale gets a bar of its own measure', () => {
    const p = projectRoute(squareLoop(2000), BOX)!;
    const bar = scaleBar(p.pxPerMetre, 'metric')!;
    // The square is 150 pt tall, so 2000 m is 150 pt; the bar is 1 km = 75 pt.
    expect(bar.label).toBe('1 km');
    expect(bar.px).toBeCloseTo(75, 1);
  });
});

describe('direction and markers', () => {
  test('chevrons only where the route has room for them', () => {
    expect(chevronFractions(40)).toEqual([]);
    expect(chevronFractions(120)).toEqual([0.5]);
    expect(chevronFractions(400)).toHaveLength(2);
    expect(chevronFractions(900)).toHaveLength(3);
  });

  test('point the way the drive went', () => {
    const east = [{ x: 0, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 }];
    expect(pointAlong(east, 0.5).angle).toBeCloseTo(0, 6);
    const north = [{ x: 50, y: 100 }, { x: 50, y: 50 }, { x: 50, y: 0 }];
    expect(pointAlong(north, 0.5).angle).toBeCloseTo(-90, 6);
    // Fractions are of length, as Skia trims a path.
    const p = pointAlong(east, 0.25, cumulativeLengths(east));
    expect(p.x).toBeCloseTo(25, 6);
  });

  test('labels sit on the side with room, and part when the markers are close', () => {
    // Apart: each on its own side.
    expect(markerLabels({ x: 300, y: 100 }, { x: 60, y: 160 })).toEqual({
      start: { side: 'left', dy: 0 },
      finish: { side: 'right', dy: 0 },
    });
    // A street apart: one side, the upper label up and the lower one down.
    const close = markerLabels({ x: 280, y: 120 }, { x: 270, y: 126 });
    expect(close.start.side).toBe(close.finish.side);
    expect(close.start.dy).toBeLessThan(0);
    expect(close.finish.dy).toBeGreaterThan(0);
    expect(close.finish.dy - close.start.dy + 6).toBeGreaterThanOrEqual(14);
    // A loop: one marker, one label on its line.
    expect(markerLabels({ x: 60, y: 100 }, null).start).toEqual({ side: 'right', dy: 0 });
  });

  test('a loop ends where it started; a run across town does not', () => {
    expect(endsWhereItStarted(squareLoop(2000), 2000)).toBe(true);
    const across = [fixAt(0, 0, 0), fixAt(4000, 0, 1000)];
    expect(endsWhereItStarted(across, 4000)).toBe(false);
  });
});

describe('speedTrace', () => {
  // Accelerate to 29 m/s (~65 mph), cruise, slow for a junction, cruise, stop.
  const speeds = [
    ...Array.from({ length: 30 }, (_, i) => i),
    ...Array.from({ length: 200 }, () => 25),
    ...Array.from({ length: 40 }, (_, i) => 25 - i * 0.5),
    ...Array.from({ length: 300 }, (_, i) => 5 + Math.min(24, i * 0.5)),
    ...Array.from({ length: 30 }, (_, i) => Math.max(0, 29 - i)),
  ];
  const fixes = traceFromSpeeds(speeds, { accuracyM: 5 });

  test('peaks at the summary’s own top speed', () => {
    const summary = summarize(fixes);
    const trace = speedTrace(fixes, 'imperial')!;
    expect(trace.peak.v).toBeCloseTo(msToMph(summary.maxSpeedMs), 6);
    expect(speedTrace(fixes, 'metric')!.peak.v).toBeCloseTo(msToKmh(summary.maxSpeedMs), 6);
  });

  test('thinning a long drive keeps its peak and its slowest moments', () => {
    const full = speedTrace(fixes, 'imperial', 10_000)!;
    const thin = speedTrace(fixes, 'imperial', 40)!;
    expect(thin.points.length).toBeLessThanOrEqual(80);
    expect(Math.max(...thin.points.map((p) => p.v))).toBeCloseTo(full.peak.v, 6);
    expect(Math.min(...thin.points.map((p) => p.v))).toBeCloseTo(
      Math.min(...full.points.map((p) => p.v)),
      6,
    );
    // Still in time order.
    for (let i = 1; i < thin.points.length; i++) {
      expect(thin.points[i].f).toBeGreaterThanOrEqual(thin.points[i - 1].f);
    }
  });

  test('rules at round speeds under the peak, with room above it', () => {
    const trace = speedTrace(fixes, 'imperial')!;
    expect(trace.ticks).toEqual([30, 60]);
    expect(trace.yMax).toBeGreaterThan(trace.peak.v);
  });

  test('no trace without a time span', () => {
    expect(speedTrace([fixAt(0, 0, 0)], 'imperial')).toBeNull();
  });

  test.each([
    [65, 30],
    [105, 50],
    [60, 25],
    [20, 10],
    [8, 5],
  ])('a %s peak is ruled every %s', (peak, step) => {
    expect(speedTickStep(peak)).toBe(step);
  });
});

describe('timeTicks', () => {
  const at = (iso: string) => Date.parse(iso);
  const utc = { offsetMs: () => 0 };

  test('five-minute marks inside a 25-minute drive', () => {
    const ticks = timeTicks(at('2026-10-05T13:00:00Z'), at('2026-10-05T13:25:00Z'), utc);
    expect(ticks.map((t) => new Date(t).toISOString().slice(11, 16))).toEqual([
      '13:05',
      '13:10',
      '13:15',
      '13:20',
    ]);
  });

  test('on the local clock in a half-hour zone', () => {
    // 3 hours from 08:00 UTC, in UTC+5:30: 13:30 to 16:30 local.
    const india = { offsetMs: () => 5.5 * 3_600_000 };
    const ticks = timeTicks(at('2026-10-05T08:00:00Z'), at('2026-10-05T11:00:00Z'), india);
    const local = ticks.map((t) => new Date(t + 5.5 * 3_600_000).toISOString().slice(11, 16));
    expect(local).toEqual(['14:00', '15:00', '16:00']);
  });

  test('never more than asked for', () => {
    const ticks = timeTicks(at('2026-10-05T06:00:00Z'), at('2026-10-05T18:00:00Z'), utc);
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(ticks.length).toBeGreaterThan(0);
  });
});

describe('gRing', () => {
  test('the smallest round ring at or above the peak', () => {
    expect(gRing(0.47)).toEqual({ outer: 0.5, fraction: 0.94 });
    expect(gRing(1.2).outer).toBe(1.5);
    expect(gRing(0)).toEqual({ outer: 0.25, fraction: 0 });
  });
});
