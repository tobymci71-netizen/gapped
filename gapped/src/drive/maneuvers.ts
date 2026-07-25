/**
 * Manoeuvre counting over a recorded fix stream (spec §3.9).
 *
 * Every figure here is derived from data we actually record: the GPS bearing
 * carried on each fix and the same smoothed speed series stats.ts summarises
 * from. Nothing is modelled, estimated or padded. Where the trace cannot
 * support a figure the function reports zero events, and turnPreference goes
 * null rather than inventing a 50/50 split.
 *
 * Runs through gateFixes/deriveSpeeds so manoeuvres and the drive summary
 * always describe the same filtered stream.
 */

import { Fix } from './types';
import { sanitiseHeading } from './heading';
import { deriveSpeeds, gateFixes } from './stats';
import { MS_PER_KMH } from './units';

export type ManeuverCounts = {
  leftTurns: number;
  rightTurns: number;
  hardBraking: number;
  hardAcceleration: number;
  laneChanges: number;
  /** null when no fix carried a heading — the UI shows an em dash rather than a zero. */
  turnPreference: { leftPct: number; rightPct: number } | null;
};

/** Bearing is only trustworthy under way; below this it is stationary GPS noise. */
const MOVING_MS = 2;
/** Longest interval that can be bridged between usable samples, ms. */
const MAX_GAP_MS = 3000;

/**
 * Lateral acceleration ceiling for the yaw-rate sanity gate, m/s². A road
 * vehicle on public roads cannot exceed ~1.2 g laterally, and yaw rate is
 * bound by a = v·ω, so a heading change beyond this for the recorded speed is
 * a bearing glitch rather than a manoeuvre. This is what catches Android's
 * "no bearing" 0.0, which range checking cannot distinguish from due north.
 */
const MAX_LATERAL_MS2 = 12;
/** Absolute yaw ceiling, deg/s — the lateral bound goes slack at walking pace. */
const MAX_YAW_RATE_DEG_S = 180;

/** Fastest yaw the vehicle could physically sustain at this speed, deg/s. */
function maxYawRateDegS(speedMs: number): number {
  return Math.min(MAX_YAW_RATE_DEG_S, ((MAX_LATERAL_MS2 / speedMs) * 180) / Math.PI);
}

/** Total sweep that makes a heading run a turn rather than a bend, degrees. */
const MIN_TURN_DEG = 60;
/** Counter-rotation tolerated inside a run before it counts as a reversal. */
const TURN_HYSTERESIS_DEG = 10;
/** Yaw rate below which the vehicle is tracking straight, deg/s. */
const STRAIGHT_RATE_DEG_S = 3;
/** Straight running that ends a run, seconds — two same-direction turns must not merge. */
const STRAIGHT_BREAK_S = 2.5;

/** Longitudinal threshold for a hard event, m/s². */
const HARD_ACCEL_MS2 = 3;
/** An episode must hold the threshold this long to count, seconds. */
const MIN_EPISODE_S = 1;

/** Heading changes below this are bearing jitter, not a manoeuvre. */
const PULSE_NOISE_DEG = 0.5;
/** Smallest excursion that can be half of a lane change, degrees. */
const MIN_PULSE_DEG = 3;
/** An excursion beyond this is a turn, not a lane change. */
const MAX_PULSE_DEG = 25;
/** Peak yaw rate a lane-change pulse must reach, deg/s. */
const MIN_PULSE_RATE_DEG_S = 2;
/** Net heading change across the pair — beyond this the vehicle changed direction. */
const MAX_NET_PAIR_DEG = 10;
const PAIR_MIN_MS = 1000;
const PAIR_MAX_MS = 3000;
/** Lane changes are a motorway signature: 40 km/h floor. */
const LANE_CHANGE_MIN_MS = 40 * MS_PER_KMH;

const EMPTY: ManeuverCounts = {
  leftTurns: 0,
  rightTurns: 0,
  hardBraking: 0,
  hardAcceleration: 0,
  laneChanges: 0,
  turnPreference: null,
};

/**
 * Heading is a compass bearing that wraps at 360: 359° → 1° is +2°, not −358°.
 * Normalised into (−180, 180]. Compass degrees increase clockwise, so a
 * positive sweep is a right turn and a negative sweep is a left turn.
 */
function normaliseDelta(deg: number): number {
  let d = deg % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

type HeadingDelta = {
  /** Signed heading change into this sample, degrees, wrapped into (−180, 180]. */
  deg: number;
  dtS: number;
  /** Midpoint of the interval — where the yaw-rate peak sits. */
  midT: number;
  minSpeedMs: number;
  /** Bumped whenever continuity is lost, so runs never span a dropout. */
  segment: number;
};

/** Signed heading changes between consecutive moving, bearing-carrying fixes. */
function headingDeltas(fixes: Fix[], speeds: number[]): HeadingDelta[] {
  const out: HeadingDelta[] = [];
  let segment = 0;
  let prev: { t: number; heading: number; v: number } | null = null;

  for (let i = 0; i < fixes.length; i++) {
    // A rejected bearing is skipped, not bridged over blindly: `prev` is kept,
    // so the next usable fix is still gated by MAX_GAP_MS.
    const h = sanitiseHeading(fixes[i].heading);
    const v = speeds[i];
    if (h == null || v <= MOVING_MS) continue;
    const cur = { t: fixes[i].t, heading: h, v };
    if (prev != null) {
      const dtMs = cur.t - prev.t;
      const dtS = dtMs / 1000;
      const deg = normaliseDelta(cur.heading - prev.heading);
      const minSpeedMs = Math.min(prev.v, cur.v);
      if (dtMs <= 0 || dtMs > MAX_GAP_MS) {
        segment++;
      } else if (Math.abs(deg) / dtS > maxYawRateDegS(minSpeedMs)) {
        // Impossible for the recorded speed — break continuity so a run cannot
        // bridge the glitch and read it as a turn.
        segment++;
      } else {
        out.push({ deg, dtS, midT: prev.t + dtMs / 2, minSpeedMs, segment });
      }
    }
    prev = cur;
  }
  return out;
}

/**
 * Integrate signed heading change. Consecutive same-sign deltas accumulate into
 * one run; a run survives a small counter-rotation (hysteresis) so that road
 * camber and lane positioning inside a bend do not split it — a roundabout is
 * one long sweep, hence one turn. A run ends on a genuine reversal, on a
 * stretch of straight running, or on loss of continuity, and counts as a turn
 * if the accumulated sweep reached 60°.
 */
function turnSweeps(deltas: HeadingDelta[]): number[] {
  const closed: number[] = [];
  let sign = 0;
  let sweep = 0;
  let pending = 0;
  let straightS = 0;
  let segment = -1;

  for (const d of deltas) {
    if (d.segment !== segment) {
      if (sign !== 0) closed.push(sweep + pending);
      sign = 0;
      sweep = 0;
      pending = 0;
      straightS = 0;
      segment = d.segment;
    }

    if (sign === 0) {
      if (d.deg !== 0) {
        sign = Math.sign(d.deg);
        sweep = d.deg;
        straightS = 0;
      }
      continue;
    }

    if (Math.sign(d.deg) === sign || d.deg === 0) {
      // A wobble that never grew past the hysteresis band belongs to the sweep.
      sweep += d.deg + pending;
      pending = 0;
    } else {
      pending += d.deg;
      if (Math.abs(pending) > TURN_HYSTERESIS_DEG) {
        closed.push(sweep);
        sign = Math.sign(pending);
        sweep = pending; // the reversal that broke the run opens the next one
        pending = 0;
        straightS = 0;
      }
    }

    straightS = Math.abs(d.deg) / d.dtS < STRAIGHT_RATE_DEG_S ? straightS + d.dtS : 0;
    if (straightS >= STRAIGHT_BREAK_S) {
      closed.push(sweep + pending);
      sign = 0;
      sweep = 0;
      pending = 0;
      straightS = 0;
    }
  }
  if (sign !== 0) closed.push(sweep + pending);
  return closed;
}

function countTurns(deltas: HeadingDelta[]): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const sweep of turnSweeps(deltas)) {
    if (Math.abs(sweep) < MIN_TURN_DEG) continue;
    if (sweep < 0) left++;
    else right++;
  }
  return { left, right };
}

type Pulse = {
  sweep: number;
  /** Time of peak yaw rate — the lateral acceleration peak the pair is measured between. */
  peakT: number;
  peakRateDegS: number;
  minSpeedMs: number;
  segment: number;
};

/** Same-sign excursions, split on every sign change. No hysteresis: a lane
 *  change is a small excursion and must not be absorbed into its neighbour. */
function pulses(deltas: HeadingDelta[]): Pulse[] {
  const runs: HeadingDelta[][] = [];
  let cur: HeadingDelta[] = [];
  for (const d of deltas) {
    if (Math.abs(d.deg) < PULSE_NOISE_DEG) continue;
    const last = cur[cur.length - 1];
    if (last != null && (d.segment !== last.segment || Math.sign(d.deg) !== Math.sign(last.deg))) {
      runs.push(cur);
      cur = [];
    }
    cur.push(d);
  }
  if (cur.length > 0) runs.push(cur);

  return runs.map((run) => {
    let sweep = 0;
    let peakT = run[0].midT;
    let peakRateDegS = -1;
    let minSpeedMs = Infinity;
    for (const d of run) {
      sweep += d.deg;
      minSpeedMs = Math.min(minSpeedMs, d.minSpeedMs);
      const rate = Math.abs(d.deg) / d.dtS;
      if (rate > peakRateDegS) {
        peakRateDegS = rate;
        peakT = d.midT;
      }
    }
    return { sweep, peakT, peakRateDegS, minSpeedMs, segment: run[0].segment };
  });
}

/**
 * A lane change is a paired lateral pulse: heading swings one way then back,
 * peaks 1–3 s apart, net heading change under 10°, above 40 km/h. The net
 * check and the per-pulse cap are what stop a genuine turn (or a left turn
 * followed by a right) from being read as a lane change; an unpaired swerve
 * has nothing to pair with and is not counted.
 */
function countLaneChanges(deltas: HeadingDelta[]): number {
  const runs = pulses(deltas);
  let count = 0;
  for (let i = 0; i + 1 < runs.length; i++) {
    const a = runs[i];
    const b = runs[i + 1];
    if (a.segment !== b.segment) continue;
    if (Math.sign(a.sweep) === Math.sign(b.sweep)) continue;
    const magA = Math.abs(a.sweep);
    const magB = Math.abs(b.sweep);
    if (magA < MIN_PULSE_DEG || magB < MIN_PULSE_DEG) continue;
    if (magA > MAX_PULSE_DEG || magB > MAX_PULSE_DEG) continue;
    if (a.peakRateDegS < MIN_PULSE_RATE_DEG_S || b.peakRateDegS < MIN_PULSE_RATE_DEG_S) continue;
    if (Math.abs(a.sweep + b.sweep) >= MAX_NET_PAIR_DEG) continue;
    const gapMs = b.peakT - a.peakT;
    if (gapMs < PAIR_MIN_MS || gapMs > PAIR_MAX_MS) continue;
    if (Math.min(a.minSpeedMs, b.minSpeedMs) < LANE_CHANGE_MIN_MS) continue;
    count++;
    i++; // an excursion belongs to at most one lane change
  }
  return count;
}

/**
 * Contiguous intervals beyond the longitudinal threshold, counted once each.
 * The count fires the moment an episode reaches its minimum duration, so a
 * five-second stop is one episode and not one per sample; the run must fall
 * back inside the threshold before another can start.
 */
function countEpisodes(fixes: Fix[], speeds: number[], direction: 1 | -1): number {
  let count = 0;
  let heldS = 0;
  for (let i = 1; i < fixes.length; i++) {
    const dtMs = fixes[i].t - fixes[i - 1].t;
    if (dtMs <= 0 || dtMs > MAX_GAP_MS) {
      heldS = 0;
      continue;
    }
    const dtS = dtMs / 1000;
    const accel = ((speeds[i] - speeds[i - 1]) / dtS) * direction;
    if (accel >= HARD_ACCEL_MS2) {
      const before = heldS;
      heldS += dtS;
      if (heldS >= MIN_EPISODE_S - 1e-9 && before < MIN_EPISODE_S - 1e-9) count++;
    } else {
      heldS = 0;
    }
  }
  return count;
}

/** Percentages sum to exactly 100. Null when there is nothing to express a preference over. */
function preference(left: number, right: number): { leftPct: number; rightPct: number } | null {
  const total = left + right;
  if (total === 0) return null;
  const leftPct = Math.round((left / total) * 1000) / 10;
  return { leftPct, rightPct: Math.round((100 - leftPct) * 10) / 10 };
}

export function countManeuvers(fixes: Fix[]): ManeuverCounts {
  const gated = gateFixes(fixes);
  if (gated.length < 2) return { ...EMPTY };

  const speeds = deriveSpeeds(gated);
  const deltas = headingDeltas(gated, speeds);
  const { left, right } = countTurns(deltas);

  return {
    leftTurns: left,
    rightTurns: right,
    hardBraking: countEpisodes(gated, speeds, -1),
    hardAcceleration: countEpisodes(gated, speeds, 1),
    laneChanges: countLaneChanges(deltas),
    turnPreference: preference(left, right),
  };
}

/**
 * Roll several drives into one card. Preference is recomputed from the summed
 * turn counts — averaging percentages would weight a two-turn drive the same
 * as a two-hundred-turn one.
 */
export function aggregateManeuvers(perDrive: ManeuverCounts[]): ManeuverCounts {
  const total = perDrive.reduce<ManeuverCounts>(
    (acc, m) => ({
      leftTurns: acc.leftTurns + m.leftTurns,
      rightTurns: acc.rightTurns + m.rightTurns,
      hardBraking: acc.hardBraking + m.hardBraking,
      hardAcceleration: acc.hardAcceleration + m.hardAcceleration,
      laneChanges: acc.laneChanges + m.laneChanges,
      turnPreference: null,
    }),
    { ...EMPTY },
  );
  return { ...total, turnPreference: preference(total.leftTurns, total.rightTurns) };
}
