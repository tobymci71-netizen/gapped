/**
 * The welcome scene's numbers (Nightrun-Welcome): where the scene sits on
 * each phone, the perspective the road lights rush past in, the mock's curves
 * and keyframes, and the still frame Reduce Motion gets.
 */

import {
  alternate,
  approachOpacity,
  approachScale,
  blinkAt,
  carInAt,
  COPY_ROWS,
  COPY_START,
  COPY_TOTAL_MS,
  copyRowAt,
  cubicBezier,
  CURVE,
  driftAt,
  fadeTopFor,
  heroBand,
  heroFit,
  igniteAt,
  INTRO,
  INTRO_END_MS,
  keyframes,
  lockAt,
  loopPhase,
  MARK_BOX,
  markRiseAt,
  MIN_SCENE_SCALE,
  RUNNERS,
  runnerPhase,
  SCENE,
  sceneToScreen,
  segment,
  shimmerAt,
  STILL_MS,
  TRAIL_OVERRUN,
  trailReach,
} from '../hero/heroMath';

/** Phones the scene has to work on: width, height, top and bottom insets. */
const PHONES = {
  se: { width: 375, height: 667, top: 20, bottom: 0 },
  iphone14: { width: 390, height: 844, top: 47, bottom: 34 },
  pro: { width: 393, height: 852, top: 59, bottom: 34 },
  proMax: { width: 430, height: 932, top: 59, bottom: 34 },
};

/** Where the copy starts on each phone at default text size (three 44pt lines and two of body). */
const textTopFor = (p: (typeof PHONES)[keyof typeof PHONES]) =>
  p.height - (Math.max(p.bottom, 16) + 14) - 56 - 12 - (3 * 44 + 12 + 44 + 12);

describe('fitting the scene to the phone', () => {
  test.each(Object.entries(PHONES))(
    '%s: the mark and the car fit between the status bar and the copy',
    (_name, p) => {
      const textTop = textTopFor(p);
      const band = heroBand({ height: p.height, insetTop: p.top, textTop });
      const fit = heroFit({ width: p.width, ...band });
      const top = sceneToScreen(fit, 0, SCENE.top).y;
      const bottom = sceneToScreen(fit, 0, SCENE.bottom).y;
      expect(top).toBeGreaterThanOrEqual(p.top);
      expect(bottom).toBeLessThanOrEqual(textTop + 0.5);
      // Never wider than the phone, and centred on it.
      expect(SCENE.width * fit.s).toBeLessThanOrEqual(p.width + 1e-6);
      expect(sceneToScreen(fit, SCENE.vp.x, 0).x).toBeCloseTo(p.width / 2);
    },
  );

  test('a 390pt phone shows the mock at its own scale', () => {
    const p = PHONES.iphone14;
    const fit = heroFit({
      width: p.width,
      ...heroBand({ height: p.height, insetTop: p.top, textTop: textTopFor(p) }),
    });
    expect(fit.s).toBeCloseTo(1);
  });

  test('a short phone shrinks the scene rather than putting the car under the copy', () => {
    const p = PHONES.se;
    const fit = heroFit({
      width: p.width,
      ...heroBand({ height: p.height, insetTop: p.top, textTop: textTopFor(p) }),
    });
    expect(fit.s).toBeLessThan(p.width / SCENE.width);
    expect(fit.s).toBeGreaterThanOrEqual(MIN_SCENE_SCALE);
  });

  test('copy grown past the room: the scene keeps its top and stops shrinking', () => {
    const fit = heroFit({ width: 375, bandTop: 36, bandBottom: 120 });
    expect(fit.s).toBe(MIN_SCENE_SCALE);
    // The mark stays where it starts; the road runs on under the copy.
    expect(sceneToScreen(fit, 0, SCENE.top).y).toBeCloseTo(36);
  });

  test('before the copy has laid out, the band falls back to a sensible share of the screen', () => {
    const band = heroBand({ height: 844, insetTop: 47, textTop: null });
    expect(band.bandBottom).toBeGreaterThan(844 * 0.45);
    expect(band.bandBottom).toBeLessThan(844);
  });

  test('the night always closes over the road above the first line of copy', () => {
    const fit = heroFit({ width: 390, bandTop: 63, bandBottom: 540 });
    expect(fadeTopFor(fit, 552)).toBeLessThan(552);
    // Copy pushed high by large text pulls the fade up with it.
    expect(fadeTopFor(fit, 300)).toBeLessThanOrEqual(300 - 72);
    expect(fadeTopFor(fit, null)).toBeCloseTo(fit.ty + SCENE.fadeTop * fit.s);
  });

  test.each(Object.entries(PHONES))(
    '%s: the light trails reach just past both edges of the window, and no further',
    (_name, p) => {
      const fit = heroFit({
        width: p.width,
        ...heroBand({ height: p.height, insetTop: p.top, textTop: textTopFor(p) }),
      });
      const k = trailReach(fit, p.width);
      // A trail's far end, at the mock's left edge, carried k times out.
      const leftEnd = sceneToScreen(fit, SCENE.vp.x - SCENE.vp.x * k, 0).x;
      const rightEnd = sceneToScreen(fit, SCENE.vp.x + SCENE.vp.x * k, 0).x;
      expect(leftEnd).toBeLessThanOrEqual(0);
      expect(rightEnd).toBeGreaterThanOrEqual(p.width);
      // Not much further: the burst's tip should cross the screen over the
      // whole burst, not in its first few frames.
      expect(-leftEnd).toBeLessThan(p.width * 0.05);
    },
  );

  test('the scene at the full width is the mock, trails ending at its frame', () => {
    expect(trailReach({ s: 1, tx: 0, ty: 0 }, 390)).toBeCloseTo(TRAIL_OVERRUN);
    // Narrower than the window (a short phone, large text): longer trails.
    const narrow = { s: MIN_SCENE_SCALE, tx: (375 - 390 * MIN_SCENE_SCALE) / 2, ty: 0 };
    expect(trailReach(narrow, 375)).toBeCloseTo((375 / (390 * MIN_SCENE_SCALE)) * TRAIL_OVERRUN);
  });

  test("the mark's box is the mock's", () => {
    expect(MARK_BOX).toEqual({ x: 80, y: 104, width: 230 });
  });
});

describe('the road rushing past', () => {
  test("perspective: the mock's keyframes, from one formula", () => {
    // The mock's table: 20% → 1.235, 40% → 1.613, 55% → 2.094, 75% → 3.478,
    // 95% → 10.26, 100% → 20.
    expect(approachScale(0)).toBe(1);
    expect(approachScale(0.2)).toBeCloseTo(1.235, 2);
    expect(approachScale(0.4)).toBeCloseTo(1.613, 2);
    expect(approachScale(0.55)).toBeCloseTo(2.094, 2);
    expect(approachScale(0.75)).toBeCloseTo(3.478, 2);
    expect(approachScale(0.95)).toBeCloseTo(10.26, 1);
    expect(approachScale(1)).toBeCloseTo(20);
  });

  test('a light only ever comes closer, and faster as it does', () => {
    let before = approachScale(0);
    let step = 0;
    for (let f = 0.01; f <= 1; f += 0.01) {
      const now = approachScale(f);
      expect(now).toBeGreaterThan(before);
      expect(now - before).toBeGreaterThanOrEqual(step - 1e-9);
      step = now - before;
      before = now;
    }
  });

  test('each light fades in as it leaves the haze, then holds', () => {
    expect(approachOpacity(0)).toBe(0);
    expect(approachOpacity(0.04)).toBeCloseTo(0.5);
    expect(approachOpacity(0.08)).toBe(1);
    expect(approachOpacity(0.9)).toBe(1);
  });

  test('a row of lights on one period is spread along the road, not bunched', () => {
    for (const row of [RUNNERS.lamps, RUNNERS.studs, RUNNERS.dashes]) {
      const phases = row.map((r) => runnerPhase(r, 0)).sort((a, b) => a - b);
      const gaps = phases.slice(1).map((p, i) => p - phases[i]);
      for (const g of gaps) expect(g).toBeCloseTo(1 / row.length, 2);
    }
  });

  test('loops wrap: a light that passes the camera starts again at the horizon', () => {
    expect(loopPhase(0, 2200, 0)).toBe(0);
    expect(loopPhase(1100, 2200, 0)).toBeCloseTo(0.5);
    expect(loopPhase(2200, 2200, 0)).toBe(0);
    expect(loopPhase(100, 2200, 2150)).toBeCloseTo(50 / 2200);
  });

  test('red glints run back toward the horizon (the mock reverses them)', () => {
    const glint = RUNNERS.redGlints[0];
    expect(runnerPhase(glint, 100)).toBeLessThan(runnerPhase(glint, 0));
  });
});

describe("the mock's curves and keyframes", () => {
  test('cubic-bezier: pinned at both ends, monotonic, and ease-out where the mock is', () => {
    for (const c of Object.values(CURVE)) {
      expect(cubicBezier(c, 0)).toBe(0);
      expect(cubicBezier(c, 1)).toBe(1);
      let before = 0;
      for (let x = 0.05; x < 1; x += 0.05) {
        const y = cubicBezier(c, x);
        expect(y).toBeGreaterThanOrEqual(before - 1e-6);
        before = y;
      }
    }
    // The burst is front-loaded: most of the way out in the first third.
    expect(cubicBezier(CURVE.burst, 0.33)).toBeGreaterThan(0.75);
    // CSS ease-in-out is symmetric.
    expect(cubicBezier(CURVE.easeInOut, 0.5)).toBeCloseTo(0.5, 3);
  });

  test('keyframes interpolate linearly between stops and hold at the ends', () => {
    const k = [
      [0, 0],
      [0.5, 1],
      [1, 0.5],
    ] as const;
    expect(keyframes(-1, k)).toBe(0);
    expect(keyframes(0.25, k)).toBeCloseTo(0.5);
    expect(keyframes(0.75, k)).toBeCloseTo(0.75);
    expect(keyframes(2, k)).toBe(0.5);
  });

  test('the tail lights catch with a flicker, then stay on', () => {
    expect(igniteAt(0)).toBe(0);
    expect(igniteAt(0.3 * INTRO.ignite.duration)).toBe(0);
    expect(igniteAt(0.42 * INTRO.ignite.duration)).toBeCloseTo(0.9);
    expect(igniteAt(0.45 * INTRO.ignite.duration)).toBeCloseTo(0.2);
    expect(igniteAt(INTRO.ignite.duration)).toBe(1);
    expect(igniteAt(60_000)).toBe(1);
  });

  test('the warning light blinks once a cycle', () => {
    const p = INTRO.blink.period;
    expect(blinkAt(0, p)).toBeCloseTo(0.15);
    expect(blinkAt(0.1 * p, p)).toBe(1);
    expect(blinkAt(0.5 * p, p)).toBeCloseTo(0.15);
    expect(blinkAt(1.1 * p, p)).toBe(1);
  });

  test('alternate loops go out and back', () => {
    expect(alternate(0, 0, 1000)).toBe(0);
    expect(alternate(500, 0, 1000)).toBeCloseTo(0.5);
    expect(alternate(1500, 0, 1000)).toBeCloseTo(0.5);
    expect(alternate(2000, 0, 1000)).toBeCloseTo(0);
    expect(alternate(100, 200, 1000)).toBe(0);
  });

  test('the push-in is slow and slight, and the flare dims but never goes out', () => {
    for (let t = 0; t < 60_000; t += 500) {
      expect(driftAt(t)).toBeGreaterThanOrEqual(1);
      expect(driftAt(t)).toBeLessThanOrEqual(1.045 + 1e-9);
      expect(shimmerAt(t)).toBeGreaterThanOrEqual(0.55 - 1e-9);
      expect(shimmerAt(t)).toBeLessThanOrEqual(1);
    }
  });

  test('segment clamps an animation to its own window', () => {
    expect(segment(0, 100, 200)).toBe(0);
    expect(segment(200, 100, 200)).toBeCloseTo(0.5);
    expect(segment(1000, 100, 200)).toBe(1);
  });
});

describe('the intro', () => {
  test('the car arrives before the reticle locks on, and the copy comes last', () => {
    expect(INTRO.carIn.delay + INTRO.carIn.duration).toBeLessThanOrEqual(INTRO.lock.delay);
    expect(COPY_START.cold).toBeGreaterThan(INTRO.mark.delay);
    // After the splash the mark is already up, so the copy follows it sooner.
    expect(COPY_START.afterSplash).toBeLessThan(COPY_START.cold);
  });

  test('the copy rises a row at a time, the button last', () => {
    const mid = copyRowAt(0.4, COPY_ROWS.title[0]);
    expect(mid).toBeGreaterThan(copyRowAt(0.4, COPY_ROWS.title[2]));
    expect(copyRowAt(0.4, COPY_ROWS.title[2])).toBeGreaterThan(copyRowAt(0.4, COPY_ROWS.button));
    for (const row of [...COPY_ROWS.title, COPY_ROWS.body, COPY_ROWS.button]) {
      expect(copyRowAt(0, row)).toBe(0);
      expect(copyRowAt(1, row)).toBe(1);
    }
    expect(COPY_TOTAL_MS).toBe(COPY_ROWS.button * INTRO.copyStep + INTRO.copyDuration);
  });

  test('Reduce Motion gets a finished frame: everything landed, nothing mid-flight', () => {
    expect(STILL_MS).toBeGreaterThan(INTRO_END_MS);
    expect(carInAt(STILL_MS)).toBe(1);
    expect(lockAt(STILL_MS)).toBe(1);
    expect(igniteAt(STILL_MS)).toBe(1);
    expect(markRiseAt(STILL_MS)).toEqual({ opacity: 1, e: 1 });
  });

  test('the mark rises out of nothing: invisible and small at the start', () => {
    const start = markRiseAt(0);
    expect(start.opacity).toBe(0);
    expect(start.e).toBe(0);
  });
});
