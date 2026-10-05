/**
 * Step 0's numbers: the carousel copy and buttons, the welcome mark / page
 * marks handoff, which pages count as on screen, the splash landing, and the
 * cornering demo's one timeline. docs/ONBOARDING.md is what these hold the
 * code to; the welcome scene's own numbers are in heroMath.test.ts.
 */

import {
  arcPosition,
  bodyRollDeg,
  CORNERING_DEMO_LABEL,
  CORNERING_DEMO_MS,
  CORNERING_END_G,
  CORNERING_LEFT_PEAK_G,
  CORNERING_START_G,
  corneringDemoLabel,
  corneringG,
  ctaFor,
  dotEmphasis,
  dotsOpacity,
  formatG,
  GAUGE_LABELS,
  gaugeAngle,
  gHundredths,
  INTRO_PAGE_COUNT,
  INTRO_PAGES,
  isOnScreen,
  landingFor,
  litEnd,
  litStart,
  marksPro,
  nearestPage,
  onScreenMask,
  pageAnnouncement,
  pointOnGauge,
  rightPeakG,
  spokenTitle,
  SPLASH_HOLD_MS,
  SPLASH_START_SCALE,
  WELCOME_LINES,
  wordmarkOpacity,
} from '../introTimeline';
import { SHOW_PRO } from '@/config/flags';
import { PLAN_MATRIX } from '@/config/plans';

/** Timeline progress from 0 to 1 in 1% steps. */
const STEPS = Array.from({ length: 101 }, (_, i) => i / 100);

describe('carousel copy (docs/ONBOARDING.md, "Carousel")', () => {
  test('four pages, in order, with the documented titles and buttons', () => {
    expect(INTRO_PAGE_COUNT).toBe(4);
    expect(INTRO_PAGES.map((p) => [p.title, p.subtitle, p.cta])).toEqual([
      [
        'Every drive. Measured. Verified.',
        'Gapped logs each drive with GPS and checks it on our servers before it counts.',
        'Get started',
      ],
      ['See where you stack up', 'Your drives. Your friends. Your place on the board.', 'Next'],
      ['See more in every drive.', null, 'Next'],
      ['Built by drivers', 'From drivers. For drivers.', 'Set up my car'],
    ]);
  });

  test('house tone: no exclamation marks anywhere', () => {
    for (const p of INTRO_PAGES) {
      expect(`${p.title} ${p.subtitle ?? ''} ${p.cta}`).not.toMatch(/!/);
    }
  });

  test('calm: no page makes a contest of speed on public roads', () => {
    for (const p of INTRO_PAGES) {
      const words = `${p.title} ${p.subtitle ?? ''} ${p.spokenSubtitle ?? ''} ${p.cta}`;
      expect(words).not.toMatch(/fastest|faster|beat|race|win\b|compet|launch|record-breaking/i);
    }
    // The welcome, the first screen anyone sees, names no speed at all: it
    // sells measurement and verification (Nightrun-Welcome), not a figure.
    const welcome = `${INTRO_PAGES[0].title} ${INTRO_PAGES[0].subtitle ?? ''}`;
    expect(welcome).not.toMatch(/speed|mph|km\/h|0–60|fast/i);
  });

  test('the welcome says how a drive is checked, and claims no more than that', () => {
    expect(WELCOME_LINES).toEqual(['Every drive.', 'Measured.', 'Verified.']);
    // The three lines are the page's one title, read as a sentence.
    expect(INTRO_PAGES[0].title).toBe(WELCOME_LINES.join(' '));
    const line = INTRO_PAGES[0].subtitle ?? '';
    expect(line).toMatch(/GPS/);
    expect(line).toMatch(/our servers/);
    // Not "every number you see is real": two pages on, the board card may
    // show sample rows, labelled as such.
    expect(line).not.toMatch(/every number/i);
  });

  test('any "0–60" a page prints has a spoken form, as the focus step gives it', () => {
    for (const p of INTRO_PAGES) {
      if (!p.subtitle?.includes('0–60')) continue;
      expect(p.spokenSubtitle).toContain('zero to sixty');
      expect(p.spokenSubtitle).not.toMatch(/\d/);
    }
  });

  test('the last button names the vehicle; the rest are fixed', () => {
    expect(ctaFor(0, null)).toBe('Get started');
    expect(ctaFor(1, 'motorbike')).toBe('Next');
    expect(ctaFor(3, null)).toBe('Set up my car');
    expect(ctaFor(3, 'car')).toBe('Set up my car');
    expect(ctaFor(3, 'motorbike')).toBe('Set up my bike');
  });

  test('out-of-range pages clamp rather than crash', () => {
    expect(ctaFor(-1, null)).toBe('Get started');
    expect(ctaFor(9, null)).toBe('Set up my car');
  });

  test('a button-driven page change is announced with its title and position', () => {
    expect(pageAnnouncement(1)).toBe('See where you stack up. Page 2 of 4.');
    // The title's own full stop is not doubled, and the Pro page says so
    // while Pro is shown.
    expect(pageAnnouncement(2, true)).toBe('Gapped Pro. See more in every drive. Page 3 of 4.');
    expect(pageAnnouncement(2, false)).toBe('See more in every drive. Page 3 of 4.');
  });
});

describe('carousel and the plans (src/config/plans.ts)', () => {
  const row = (key: string) => PLAN_MATRIX.find((r) => r.key === key);

  test('the cornering demo is marked as the Pro feature it shows', () => {
    const corner = INTRO_PAGES.find((p) => p.key === 'corner');
    expect(corner?.proFeature).toBe('advancedTelemetry');
    // Marked against the matrix: if cornering G ever became Free, the chip
    // would be a false claim, and this fails first.
    expect(row(corner?.proFeature ?? '')).toMatchObject({ free: false, pro: true });
  });

  test('every page marked Pro names a Pro-only row, and only those pages are marked', () => {
    for (const p of INTRO_PAGES) {
      if (p.proFeature) expect(row(p.proFeature)).toMatchObject({ free: false, pro: true });
    }
    expect(INTRO_PAGES.filter((p) => p.proFeature).map((p) => p.key)).toEqual(['corner']);
  });

  test('VoiceOver hears "Gapped Pro" where the chip is only seen, while Pro is shown', () => {
    expect(spokenTitle(INTRO_PAGES[2], true)).toBe('Gapped Pro. See more in every drive.');
    // Unmarked pages read their title as printed.
    expect(spokenTitle(INTRO_PAGES[0], true)).toBe('Every drive. Measured. Verified.');
  });

  test('with Pro hidden, no page wears the chip or says "Gapped Pro"', () => {
    // The corner page still knows which row it demos; it just does not say so.
    for (const p of INTRO_PAGES) {
      expect(marksPro(p, false)).toBe(false);
      expect(spokenTitle(p, false)).toBe(p.title);
    }
    for (let i = 0; i < INTRO_PAGE_COUNT; i++) {
      expect(pageAnnouncement(i, false)).not.toMatch(/\bPro\b/);
    }
    expect(corneringDemoLabel(false)).not.toMatch(/\bPro\b/);
  });

  test('this build marks Pro exactly when SHOW_PRO is on', () => {
    // SHOW_PRO is off until purchases work, so the committed carousel says
    // nothing about Pro: no chip (IntroPage reads marksPro), no spoken plan.
    const corner = INTRO_PAGES[2];
    expect(marksPro(corner)).toBe(SHOW_PRO);
    expect(spokenTitle(corner).startsWith('Gapped Pro')).toBe(SHOW_PRO);
    expect(pageAnnouncement(2).startsWith('Gapped Pro')).toBe(SHOW_PRO);
    expect(CORNERING_DEMO_LABEL.startsWith('Gapped Pro')).toBe(SHOW_PRO);
    expect(CORNERING_DEMO_LABEL).toBe(corneringDemoLabel(SHOW_PRO));
  });

  test('the free pages promise nothing that is Pro', () => {
    // Page 1 used to say "every corner"; cornering G is Pro. What the
    // unmarked pages say every drive gets has to be in Free.
    for (const p of INTRO_PAGES.filter((q) => !q.proFeature)) {
      const words = `${p.title} ${p.subtitle ?? ''} ${p.spokenSubtitle ?? ''}`;
      expect(words).not.toMatch(/corner|\bG\b|telemetry|class|bracket|history|export/i);
    }
    expect(row('coreStats')?.free).toBe(true);
    expect(row('boardPlacement')?.free).toBe(true);
  });
});

describe('header: the G mark on the first page, page marks on the rest', () => {
  test('the mark alone at rest on page 1; page marks alone from page 2', () => {
    expect(wordmarkOpacity(0)).toBe(1);
    expect(dotsOpacity(0)).toBe(0);
    for (const pos of [1, 2, 3]) {
      expect(wordmarkOpacity(pos)).toBe(0);
      expect(dotsOpacity(pos)).toBe(1);
    }
  });

  test('the two never overprint, at any point of the swipe', () => {
    for (let pos = -0.5; pos <= 3.5; pos += 0.01) {
      expect(wordmarkOpacity(pos) * dotsOpacity(pos)).toBe(0);
    }
  });

  test('rubber-banding past the first page keeps the mark', () => {
    expect(wordmarkOpacity(-0.2)).toBe(1);
    expect(dotsOpacity(-0.2)).toBe(0);
  });

  test('the active pill follows the finger between dots', () => {
    expect(dotEmphasis(2, 2)).toBe(1);
    expect(dotEmphasis(2, 1)).toBe(0);
    expect(dotEmphasis(1.5, 1)).toBeCloseTo(0.5);
    expect(dotEmphasis(1.5, 2)).toBeCloseTo(0.5);
    expect(dotEmphasis(1.5, 3)).toBe(0);
  });
});

describe('which page is in view', () => {
  test('nearest page rounds, and clamps over-scroll at both ends', () => {
    expect(nearestPage(0, 4)).toBe(0);
    expect(nearestPage(0.49, 4)).toBe(0);
    expect(nearestPage(0.51, 4)).toBe(1);
    expect(nearestPage(-0.3, 4)).toBe(0);
    expect(nearestPage(3.4, 4)).toBe(3);
  });

  test('a settled page is the only one on screen', () => {
    for (let i = 0; i < 4; i++) {
      expect(onScreenMask(i, 4)).toBe(1 << i);
    }
  });

  test('mid-swipe, both neighbours are on screen', () => {
    const m = onScreenMask(1.5, 4);
    expect(isOnScreen(m, 1)).toBe(true);
    expect(isOnScreen(m, 2)).toBe(true);
    expect(isOnScreen(m, 0)).toBe(false);
    expect(isOnScreen(m, 3)).toBe(false);
  });

  test('a sub-pixel sliver left by paging does not count as on screen', () => {
    // 2.999 pages: page 2 shows a fraction of a point at the left edge.
    expect(isOnScreen(onScreenMask(2.999, 4), 2)).toBe(false);
    expect(isOnScreen(onScreenMask(2.9, 4), 2)).toBe(true);
  });
});

describe('splash landing', () => {
  const splash = { x: 70, y: 400, width: 236, height: 64 };
  const header = { x: 129, y: 59, width: 118, height: 32 };

  test('moves centre to centre and scales by the width ratio', () => {
    const l = landingFor(splash, header);
    expect(l).not.toBeNull();
    expect(l!.dx).toBeCloseTo(0);
    expect(l!.dy).toBeCloseTo(59 + 16 - (400 + 32));
    expect(l!.scale).toBeCloseTo(0.5);
  });

  test('no landing until both are laid out: the caller crossfades', () => {
    expect(landingFor(null, header)).toBeNull();
    expect(landingFor(splash, null)).toBeNull();
    expect(landingFor({ ...splash, width: 0 }, header)).toBeNull();
    expect(landingFor(splash, { ...header, width: NaN })).toBeNull();
  });

  test('timings sit where the reference measured them', () => {
    expect(SPLASH_START_SCALE).toBeCloseTo(0.96);
    expect(SPLASH_HOLD_MS).toBeGreaterThanOrEqual(1500);
    expect(SPLASH_HOLD_MS).toBeLessThanOrEqual(2000);
    expect(CORNERING_DEMO_MS).toBe(2000);
  });

  test('the same mark at the same size lands without scaling: a pure rise', () => {
    const mark = { x: 80, y: 360, width: 230, height: 126 };
    const scene = { x: 80, y: 104, width: 230, height: 126 };
    expect(landingFor(mark, scene)).toEqual({ dx: 0, dy: -256, scale: 1 });
  });
});

describe('cornering demo', () => {
  test('counts 0.12 g → 0.94 g, and holds at the end', () => {
    expect(formatG(gHundredths(corneringG(0)))).toBe('0.12');
    expect(formatG(gHundredths(corneringG(1)))).toBe('0.94');
    expect(corneringG(1.5)).toBe(CORNERING_END_G);
    expect(corneringG(-1)).toBe(CORNERING_START_G);
  });

  test('the count only rises', () => {
    for (let i = 1; i < STEPS.length; i++) {
      expect(corneringG(STEPS[i])).toBeGreaterThanOrEqual(corneringG(STEPS[i - 1]));
    }
  });

  test('number and marker agree at every frame: always right of zero', () => {
    // The reference swung its marker across zero while the number rose.
    for (const p of STEPS) {
      expect(corneringG(p)).toBeGreaterThan(0);
      expect(arcPosition(corneringG(p))).toBeGreaterThan(0.5);
    }
  });

  test('the right peak is the live value; the left peak is an earlier corner', () => {
    for (const p of STEPS) expect(rightPeakG(p)).toBe(corneringG(p));
    expect(formatG(gHundredths(CORNERING_LEFT_PEAK_G))).toBe('0.88');
    // Beaten on the final frame, not before the corner starts.
    expect(CORNERING_LEFT_PEAK_G).toBeGreaterThan(CORNERING_START_G);
    expect(CORNERING_LEFT_PEAK_G).toBeLessThan(CORNERING_END_G);
  });

  test('scale: 0 at the top, ±0.5 g at ±45°, ±1 g at the ends, clamped beyond', () => {
    expect(gaugeAngle(0)).toBe(0);
    expect(gaugeAngle(0.5)).toBeCloseTo(Math.PI / 4);
    expect(gaugeAngle(-1)).toBeCloseTo(-Math.PI / 2);
    expect(gaugeAngle(1.4)).toBeCloseTo(Math.PI / 2);
    expect(GAUGE_LABELS.map((l) => l.text)).toEqual(['1.0', '0.5', '0', '0.5', '1.0']);
  });

  test('positions on the arc path run left end → top → right end', () => {
    expect(arcPosition(-1)).toBe(0);
    expect(arcPosition(0)).toBe(0.5);
    expect(arcPosition(1)).toBe(1);
  });

  test('the lit stretch always runs from zero to the marker', () => {
    for (const g of [-0.8, -0.1, 0, 0.12, 0.94]) {
      expect(litStart(g)).toBeLessThanOrEqual(0.5);
      expect(litEnd(g)).toBeGreaterThanOrEqual(0.5);
      expect([litStart(g), litEnd(g)]).toContain(arcPosition(g));
    }
  });

  test('the body rolls away from the corner, a few degrees', () => {
    // Right-hander: roof tips left, counter-clockwise on screen.
    expect(bodyRollDeg(CORNERING_END_G)).toBeLessThan(0);
    expect(Math.abs(bodyRollDeg(CORNERING_END_G))).toBeGreaterThanOrEqual(2);
    expect(Math.abs(bodyRollDeg(CORNERING_END_G))).toBeLessThanOrEqual(6);
    expect(bodyRollDeg(-0.5)).toBeGreaterThan(0);
  });

  test('scale points: top of the arc at 0, the right end at +1 g', () => {
    const top = pointOnGauge(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    const end = pointOnGauge(100, 100, 50, 1);
    expect(end.x).toBeCloseTo(150);
    expect(end.y).toBeCloseTo(100);
  });

  test('readouts change in hundredths, printed to two places', () => {
    expect(gHundredths(0.124)).toBe(12);
    expect(gHundredths(0.125)).toBe(13);
    expect(formatG(10)).toBe('0.10');
    expect(formatG(94)).toBe('0.94');
  });

  test('VoiceOver hears a demo, with the pose it holds, and the plan while Pro is shown', () => {
    for (const showPro of [true, false]) {
      const label = corneringDemoLabel(showPro);
      expect(label.startsWith(showPro ? 'Gapped Pro demo.' : 'Demo.')).toBe(true);
      expect(label).toContain('0.94 g');
      expect(label).toContain('left 0.88 g');
      expect(label).toContain('right 0.94 g');
    }
  });
});

describe('with SHOW_PRO flipped on, as the purchases build will ship', () => {
  test('the cornering page wears the chip and says "Gapped Pro" again', () => {
    let timeline: typeof import('../introTimeline') | undefined;
    jest.isolateModules(() => {
      jest.doMock('@/config/flags', () => ({
        ...jest.requireActual('@/config/flags'),
        SHOW_PRO: true,
        PRO_LIMITS_ENFORCED: true,
      }));
      timeline = jest.requireActual<typeof import('../introTimeline')>('../introTimeline');
    });
    jest.dontMock('@/config/flags');
    const t = timeline as typeof import('../introTimeline');
    const corner = t.INTRO_PAGES.find((p) => p.key === 'corner');
    expect(corner && t.marksPro(corner)).toBe(true);
    expect(t.pageAnnouncement(2)).toBe('Gapped Pro. See more in every drive. Page 3 of 4.');
    expect(t.CORNERING_DEMO_LABEL.startsWith('Gapped Pro demo.')).toBe(true);
    // Only the corner page: the others never name a plan.
    expect(t.INTRO_PAGES.filter((p) => t.marksPro(p)).map((p) => p.key)).toEqual(['corner']);
  });
});
