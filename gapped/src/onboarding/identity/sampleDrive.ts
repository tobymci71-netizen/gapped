/**
 * The drive the paywall's share card is rendered from.
 *
 * docs/ONBOARDING.md asks for the real `<ShareCard>` as the paywall hero,
 * rendered from a sample drive and labelled as one. Real component, invented
 * drive: what the person sees is exactly the card the app will make for them,
 * and nothing on it pretends to be anyone's run. The screen puts a SAMPLE chip
 * on it, and the card itself says "Not server-verified", because it was not.
 *
 * Deterministic: built once from fixed numbers, so the hero never changes
 * between renders and the tests can pin it. The figures are deliberately
 * ordinary — a twenty-minute country drive that touches 60 mph, the UK's
 * single-carriageway limit — because the first picture of a Gapped card should
 * not be a picture of a speeding ticket.
 *
 * The route is a synthetic curve laid on an arbitrary origin, not a real road:
 * a sample that traced somebody's actual street would be a privacy problem in
 * a screenshot, which is the reason ShareCard trims real routes.
 */

import type { DriveSummary, Fix } from '@/drive/types';
import {
  degrees,
  epochMs,
  gForce,
  metres,
  mps,
  MS_PER_MPH,
  seconds,
} from '@/types/units';

/** Fixes along the route. Enough for a smooth line on the sample share card. */
const FIX_COUNT = 150;

/** Friday 12 June 2026, 14:40 in London. Not shown on the card; kept plausible anyway. */
const STARTED_AT = Date.UTC(2026, 5, 12, 13, 40);

/** An arbitrary origin. The card draws the shape, never the place. */
const LAT0 = 52;
const LON0 = -1.5;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** 60 mph exactly, so the card reads "60 mph" or "97 km/h". */
export const SAMPLE_TOP_SPEED_MS = mps(60 * MS_PER_MPH);
/** Slowest point on the route: a village, a junction. */
const SLOW_MS = 9;

/** Easting and northing, in metres, at s ∈ [0, 1] along the route: a lazy S with a few bends. */
function point(s: number): { x: number; y: number } {
  return {
    x: 12_000 * s,
    y: 1_800 * Math.sin(2 * Math.PI * 0.9 * s) + 320 * Math.sin(2 * Math.PI * 3.4 * s + 0.6),
  };
}

/** Speed at s: two fast stretches between slower sections, peaking at the top speed. */
function speedAt(s: number): number {
  const wave = (1 - Math.cos(2 * Math.PI * 2 * s)) / 2;
  return SLOW_MS + (SAMPLE_TOP_SPEED_MS - SLOW_MS) * wave;
}

function build(): { summary: DriveSummary; fixes: Fix[] } {
  const fixes: Fix[] = [];
  let t = STARTED_AT;
  let distance = 0;
  let prev = point(0);

  for (let i = 0; i < FIX_COUNT; i++) {
    const s = i / (FIX_COUNT - 1);
    const p = point(s);
    const step = Math.hypot(p.x - prev.x, p.y - prev.y);
    const v = speedAt(s);
    if (i > 0) {
      // Time to cover this step at this speed, so the speeds derived from the
      // fixes (stats.deriveSpeeds) match the ones recorded on them.
      t += Math.round((step / v) * 1000);
      distance += step;
    }
    fixes.push({
      t: epochMs(t),
      lat: degrees(LAT0 + p.y / M_PER_DEG_LAT),
      lon: degrees(LON0 + p.x / M_PER_DEG_LON),
      speedMs: mps(v),
      accuracyM: metres(4),
    });
    prev = p;
  }

  const durationS = (t - STARTED_AT) / 1000;
  return {
    fixes,
    summary: {
      startedAt: epochMs(STARTED_AT),
      endedAt: epochMs(t),
      distanceM: metres(distance),
      durationS: seconds(durationS),
      maxSpeedMs: SAMPLE_TOP_SPEED_MS,
      avgSpeedMs: mps(distance / durationS),
      maxG: gForce(0.58),
      avgG: gForce(0.31),
      zeroTo60S: seconds(6.4),
      fixCount: fixes.length,
    },
  };
}

/** The sample drive: a summary and the fixes it was summarised from. */
export const SAMPLE_DRIVE = build();
