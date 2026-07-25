import { aggregateManeuvers, countManeuvers, ManeuverCounts } from '../maneuvers';
import { Fix } from '../types';
import { cleanCruise, M_PER_DEG_LAT, ORIGIN } from './fixtures';

/**
 * The shared fixtures all run due north with heading 0, so manoeuvre traces are
 * authored here: a speed + bearing profile, with position integrated along the
 * bearing so the trace stays physically consistent.
 */
type Sample = { speedMs: number; heading: number | null };

function headedTrace(
  samples: Sample[],
  opts: { dtMs?: number; startT?: number; accuracyM?: number } = {},
): Fix[] {
  const dtMs = opts.dtMs ?? 1000;
  const startT = opts.startT ?? 1_700_000_000_000;
  const accuracyM = opts.accuracyM ?? 6;
  const fixes: Fix[] = [];
  let lat = ORIGIN.lat;
  let lon = ORIGIN.lon;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (i > 0) {
      const prev = samples[i - 1];
      const stepM = ((prev.speedMs + s.speedMs) / 2) * (dtMs / 1000);
      const rad = ((prev.heading ?? 0) * Math.PI) / 180;
      lat += (stepM * Math.cos(rad)) / M_PER_DEG_LAT;
      lon += (stepM * Math.sin(rad)) / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
    }
    fixes.push({
      t: startT + i * dtMs,
      lat,
      lon,
      speedMs: s.speedMs,
      accuracyM,
      altitudeM: 30,
      heading: s.heading,
      accelX: null,
      accelY: null,
      accelZ: null,
      isMock: false,
    });
  }
  return fixes;
}

const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** n samples holding a bearing. */
function hold(n: number, speedMs: number, heading: number | null): Sample[] {
  return Array.from({ length: n }, () => ({ speedMs, heading }));
}

/** n samples turning `perSample` degrees each (positive = right/clockwise). */
function turn(from: number, perSample: number, n: number, speedMs: number): Sample[] {
  return Array.from({ length: n }, (_, i) => ({
    speedMs,
    heading: wrap360(from + perSample * (i + 1)),
  }));
}

/** Bearings held at a constant speed. */
function bearings(list: number[], speedMs: number): Sample[] {
  return list.map((heading) => ({ speedMs, heading }));
}

/** Out-and-back lateral pulse: +6, +2, −4, −4 about the current bearing. */
function laneChangePulse(base: number, speedMs: number): Sample[] {
  return bearings([base + 6, base + 8, base + 4, base].map(wrap360), speedMs);
}

/** Speeds at 1 Hz, bearing held. */
function speedTrace(speeds: number[], heading = 0, dtMs = 1000): Fix[] {
  return headedTrace(
    speeds.map((speedMs) => ({ speedMs, heading })),
    { dtMs },
  );
}

describe('turns', () => {
  test('a clean 90 degree left counts 1 left, 0 right', () => {
    const m = countManeuvers(
      headedTrace([...hold(5, 15, 0), ...turn(0, -15, 6, 15), ...hold(5, 15, 270)]),
    );
    expect(m.leftTurns).toBe(1);
    expect(m.rightTurns).toBe(0);
    expect(m.laneChanges).toBe(0);
  });

  test('the mirrored 90 degree right counts 1 right, 0 left', () => {
    const m = countManeuvers(
      headedTrace([...hold(5, 15, 0), ...turn(0, 15, 6, 15), ...hold(5, 15, 90)]),
    );
    expect(m.rightTurns).toBe(1);
    expect(m.leftTurns).toBe(0);
    expect(m.laneChanges).toBe(0);
  });

  test('a 359 to 1 wrap does not manufacture a turn', () => {
    const jitter = [0, 359, 0, 1, 0, 359, 358, 359, 0, 1, 2, 1, 0, 0, 359, 0];
    const m = countManeuvers(headedTrace(bearings(jitter, 15)));
    // naive subtraction would read 0 → 359 as a −359 degree sweep
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
    expect(m.laneChanges).toBe(0);
    expect(m.turnPreference).toBeNull();
  });

  test('a real sweep across the wrap point is still counted once', () => {
    // 300 → 60 = +120 degrees, crossing north mid-turn
    const m = countManeuvers(
      headedTrace([...hold(4, 15, 300), ...turn(300, 15, 8, 15), ...hold(4, 15, 60)]),
    );
    expect(m.rightTurns).toBe(1);
    expect(m.leftTurns).toBe(0);
  });

  test('a roundabout is one turn, not five', () => {
    // 270 degrees of continuous sweep at 30 deg/s
    const m = countManeuvers(
      headedTrace([...hold(4, 10, 0), ...turn(0, 30, 9, 10), ...hold(4, 10, 270)]),
    );
    expect(m.leftTurns + m.rightTurns).toBe(1);
    expect(m.rightTurns).toBe(1);
  });

  test('stationary heading jitter counts nothing', () => {
    const m = countManeuvers(headedTrace(bearings([0, 90, 210, 15, 300, 120, 0, 250], 0.2)));
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
    expect(m.turnPreference).toBeNull();
  });

  test('a sweep below the 2 m/s moving threshold is not a turn', () => {
    const m = countManeuvers(
      headedTrace([...hold(4, 1, 0), ...turn(0, -15, 6, 1), ...hold(4, 1, 270)]),
    );
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
  });

  test('a 45 degree bend is below the turn threshold', () => {
    const m = countManeuvers(
      headedTrace([...hold(4, 20, 0), ...turn(0, 9, 5, 20), ...hold(4, 20, 45)]),
    );
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
  });

  test('two left turns round a block count twice, not once', () => {
    const m = countManeuvers(
      headedTrace([
        ...hold(4, 12, 0),
        ...turn(0, -15, 6, 12),
        ...hold(6, 12, 270),
        ...turn(270, -15, 6, 12),
        ...hold(4, 12, 180),
      ]),
    );
    expect(m.leftTurns).toBe(2);
    expect(m.rightTurns).toBe(0);
  });

  test('a left then a right counts one of each and no lane change', () => {
    const m = countManeuvers(
      headedTrace([
        ...hold(4, 12, 0),
        ...turn(0, -15, 6, 12),
        ...hold(2, 12, 270),
        ...turn(270, 15, 6, 12),
        ...hold(4, 12, 0),
      ]),
    );
    expect(m.leftTurns).toBe(1);
    expect(m.rightTurns).toBe(1);
    expect(m.laneChanges).toBe(0);
  });

  test('an iOS -1 "no course" sentinel does not manufacture a turn', () => {
    // CLLocation.course is -1 when invalid and expo-location passes it through
    // raw; wrapped into compass space it reads as 359 and looks like a spike.
    const clean = headedTrace(hold(20, 20, 270));
    const glitched = clean.map((f, i) => (i === 10 ? { ...f, heading: -1 } : f));
    expect(countManeuvers(glitched)).toEqual(countManeuvers(clean));
    expect(countManeuvers(glitched).turnPreference).toBeNull();
  });

  test('an Android 0.0 "no bearing" sentinel does not manufacture a turn', () => {
    // Location.getBearing() is 0.0 when hasBearing() is false — indistinguishable
    // from due north by range, so the yaw-rate gate has to reject it.
    const clean = headedTrace(hold(20, 20, 270));
    const glitched = clean.map((f, i) => (i === 10 ? { ...f, heading: 0 } : f));
    const m = countManeuvers(glitched);
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
    expect(m.turnPreference).toBeNull();
  });

  test('a heading above 360 is rejected rather than wrapped', () => {
    const clean = headedTrace(hold(20, 20, 90));
    const glitched = clean.map((f, i) => (i === 8 ? { ...f, heading: 451 } : f));
    expect(countManeuvers(glitched)).toEqual(countManeuvers(clean));
  });

  test('a genuine due-north cruise still reports no turns', () => {
    const m = countManeuvers(headedTrace(hold(20, 20, 0)));
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
    expect(m.turnPreference).toBeNull();
  });

  test('fixes rejected by accuracy gating cannot contribute turns', () => {
    const trace = headedTrace([...hold(5, 15, 0), ...turn(0, -15, 6, 15), ...hold(5, 15, 270)], {
      accuracyM: 500,
    });
    const m = countManeuvers(trace);
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
    expect(m.turnPreference).toBeNull();
  });
});

describe('hard braking and acceleration', () => {
  test('one hard stop is one episode, not one per sample', () => {
    const m = countManeuvers(speedTrace([...Array(10).fill(20), 16, 12, 8, 4, 0, 0, 0, 0, 0]));
    expect(m.hardBraking).toBe(1);
    expect(m.hardAcceleration).toBe(0);
  });

  test('two separated stops count twice', () => {
    const m = countManeuvers(
      speedTrace([
        ...Array(5).fill(20),
        16,
        12,
        8,
        4,
        0,
        0,
        0,
        // gentle 2 m/s² recovery — below the hard threshold
        2,
        4,
        6,
        8,
        10,
        12,
        14,
        16,
        18,
        20,
        20,
        20,
        16,
        12,
        8,
        4,
        0,
        0,
        0,
      ]),
    );
    expect(m.hardBraking).toBe(2);
    expect(m.hardAcceleration).toBe(0);
  });

  test('braking at 2 m/s squared is not hard braking', () => {
    const m = countManeuvers(speedTrace([...Array(5).fill(20), 18, 16, 14, 12, 10, 8, 8, 8]));
    expect(m.hardBraking).toBe(0);
  });

  test('a hard launch is one acceleration episode', () => {
    const m = countManeuvers(speedTrace([0, 0, 0, 4, 8, 12, 16, 20, 24, 24, 24, 24]));
    expect(m.hardAcceleration).toBe(1);
    expect(m.hardBraking).toBe(0);
  });

  test('a sub-second decel burst does not qualify', () => {
    // 10 Hz: 4 m/s² held for only 0.5 s
    const speeds = [...Array(20).fill(20), 19.6, 19.2, 18.8, 18.4, ...Array(10).fill(18)];
    const m = countManeuvers(speedTrace(speeds, 0, 100));
    expect(m.hardBraking).toBe(0);
  });

  test('the same rate held for over a second at 10 Hz does qualify', () => {
    const speeds = [...Array(10).fill(20)];
    for (let i = 1; i <= 15; i++) speeds.push(20 - i * 0.4); // 4 m/s² for 1.5 s
    speeds.push(...Array(10).fill(14));
    const m = countManeuvers(speedTrace(speeds, 0, 100));
    expect(m.hardBraking).toBe(1);
  });

  test('a steady cruise has no hard events', () => {
    const m = countManeuvers(speedTrace(Array(40).fill(20)));
    expect(m.hardBraking).toBe(0);
    expect(m.hardAcceleration).toBe(0);
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
    expect(m.laneChanges).toBe(0);
  });

  test('speed noise inside the threshold is not an event', () => {
    const m = countManeuvers(speedTrace(Array.from({ length: 40 }, (_, i) => 20 + Math.sin(i))));
    expect(m.hardBraking).toBe(0);
    expect(m.hardAcceleration).toBe(0);
  });

  test('the cleanCruise fixture standing start is reported honestly', () => {
    // the fixture steps 0 → 20 m/s in one sample; that IS a hard launch in the
    // data, and we report what the trace says rather than smoothing it away
    const m = countManeuvers(cleanCruise());
    expect(m.hardAcceleration).toBe(1);
    expect(m.hardBraking).toBe(0);
  });
});

describe('lane changes', () => {
  test('an out-and-back pulse at motorway speed is a lane change, not a turn', () => {
    const m = countManeuvers(
      headedTrace([...hold(4, 25, 0), ...laneChangePulse(0, 25), ...hold(5, 25, 0)]),
    );
    expect(m.laneChanges).toBe(1);
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
  });

  test('the same pulse below 40 km/h is not a lane change', () => {
    const m = countManeuvers(
      headedTrace([...hold(4, 8, 0), ...laneChangePulse(0, 8), ...hold(5, 8, 0)]),
    );
    expect(m.laneChanges).toBe(0);
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
  });

  test('an unpaired swerve is not a lane change', () => {
    const m = countManeuvers(
      headedTrace([...hold(4, 25, 0), ...bearings([6, 8], 25), ...hold(6, 25, 8)]),
    );
    expect(m.laneChanges).toBe(0);
  });

  test('two lane changes count twice', () => {
    const m = countManeuvers(
      headedTrace([
        ...hold(4, 28, 0),
        ...laneChangePulse(0, 28),
        ...hold(5, 28, 0),
        ...laneChangePulse(0, 28),
        ...hold(5, 28, 0),
      ]),
    );
    expect(m.laneChanges).toBe(2);
    expect(m.leftTurns + m.rightTurns).toBe(0);
  });

  test('a pulse across the wrap point still pairs', () => {
    const m = countManeuvers(
      headedTrace([...hold(4, 25, 356), ...laneChangePulse(356, 25), ...hold(5, 25, 356)]),
    );
    expect(m.laneChanges).toBe(1);
  });

  test('a drive with no heading data reports no lane changes', () => {
    const m = countManeuvers(cleanCruise().map((f) => ({ ...f, heading: null })));
    expect(m.laneChanges).toBe(0);
  });
});

describe('turn preference — never fabricated', () => {
  test('empty input is all zeros with a null preference', () => {
    const m = countManeuvers([]);
    expect(m).toEqual({
      leftTurns: 0,
      rightTurns: 0,
      hardBraking: 0,
      hardAcceleration: 0,
      laneChanges: 0,
      turnPreference: null,
    });
  });

  test('fixes carrying no heading at all give a null preference, not 50/50', () => {
    const m = countManeuvers(cleanCruise().map((f) => ({ ...f, heading: null })));
    expect(m.turnPreference).toBeNull();
    expect(m.leftTurns).toBe(0);
    expect(m.rightTurns).toBe(0);
  });

  test('headings present but no turns still gives null', () => {
    const m = countManeuvers(headedTrace(hold(20, 20, 90)));
    expect(m.turnPreference).toBeNull();
  });

  test('all-left driving reads 100/0', () => {
    const m = countManeuvers(
      headedTrace([
        ...hold(4, 12, 0),
        ...turn(0, -15, 6, 12),
        ...hold(6, 12, 270),
        ...turn(270, -15, 6, 12),
        ...hold(4, 12, 180),
      ]),
    );
    expect(m.turnPreference).toEqual({ leftPct: 100, rightPct: 0 });
  });

  test('one left and two rights reads 33.3/66.7 and sums to 100', () => {
    const m = countManeuvers(
      headedTrace([
        ...hold(4, 12, 0),
        ...turn(0, -15, 6, 12),
        ...hold(6, 12, 270),
        ...turn(270, 15, 6, 12),
        ...hold(6, 12, 0),
        ...turn(0, 15, 6, 12),
        ...hold(4, 12, 90),
      ]),
    );
    expect(m.leftTurns).toBe(1);
    expect(m.rightTurns).toBe(2);
    expect(m.turnPreference).not.toBeNull();
    expect(m.turnPreference!.leftPct).toBeCloseTo(33.3, 5);
    expect(m.turnPreference!.rightPct).toBeCloseTo(66.7, 5);
    expect(m.turnPreference!.leftPct + m.turnPreference!.rightPct).toBeCloseTo(100, 5);
  });
});

describe('aggregateManeuvers', () => {
  const drive = (over: Partial<ManeuverCounts> = {}): ManeuverCounts => ({
    leftTurns: 0,
    rightTurns: 0,
    hardBraking: 0,
    hardAcceleration: 0,
    laneChanges: 0,
    turnPreference: null,
    ...over,
  });

  test('no drives means all zeros and a null preference', () => {
    expect(aggregateManeuvers([])).toEqual(drive());
  });

  test('counts sum across drives', () => {
    const total = aggregateManeuvers([
      drive({ leftTurns: 3, rightTurns: 1, hardBraking: 2, hardAcceleration: 1, laneChanges: 4 }),
      drive({ leftTurns: 1, rightTurns: 3, hardBraking: 0, hardAcceleration: 5, laneChanges: 2 }),
    ]);
    expect(total.leftTurns).toBe(4);
    expect(total.rightTurns).toBe(4);
    expect(total.hardBraking).toBe(2);
    expect(total.hardAcceleration).toBe(6);
    expect(total.laneChanges).toBe(6);
    expect(total.turnPreference).toEqual({ leftPct: 50, rightPct: 50 });
  });

  test('preference is recomputed from totals, not averaged across drives', () => {
    const total = aggregateManeuvers([
      drive({ leftTurns: 1, rightTurns: 0, turnPreference: { leftPct: 100, rightPct: 0 } }),
      drive({ leftTurns: 0, rightTurns: 3, turnPreference: { leftPct: 0, rightPct: 100 } }),
    ]);
    // averaging the two percentages would say 50/50; the honest figure is 25/75
    expect(total.turnPreference).toEqual({ leftPct: 25, rightPct: 75 });
  });

  test('drives with no turns aggregate to a null preference', () => {
    const total = aggregateManeuvers([
      drive({ hardBraking: 2 }),
      drive({ laneChanges: 1 }),
    ]);
    expect(total.turnPreference).toBeNull();
    expect(total.hardBraking).toBe(2);
    expect(total.laneChanges).toBe(1);
  });

  test('a single drive aggregates to itself', () => {
    const one = drive({ leftTurns: 2, rightTurns: 2, turnPreference: { leftPct: 50, rightPct: 50 } });
    expect(aggregateManeuvers([one])).toEqual(one);
  });
});
