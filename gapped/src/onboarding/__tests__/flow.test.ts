/**
 * The step list is the contract in docs/ONBOARDING.md, as data. These tests
 * pin its order and numbering, and — the failure the registry exists to stop —
 * check that switching a step off with a flag neither strands the flow nor
 * leaves the progress bar short of full.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ATTRIBUTION_OPTIONS,
  createFlow,
  FOCUS_OPTIONS,
  focusOption,
  nextRoute,
  ONBOARDING_STEPS,
  progressFor,
  TERMS_ROUTE,
  TOTAL_PROGRESS_STEPS,
  vehicleNoun,
  type OnboardingRoute,
} from '../flow';
import { ONBOARDING_PAYWALL, SAFETY_ACKNOWLEDGEMENT } from '@/config/flags';

/** docs/ONBOARDING.md, "Steps", with every flag on. */
const DOCUMENTED: [OnboardingRoute, number | null][] = [
  ['/onboarding', null],
  ['/onboarding/ride', 1],
  ['/onboarding/brand', 2],
  ['/onboarding/garage', 3],
  ['/onboarding/photo', 4],
  ['/onboarding/unit', 5],
  ['/onboarding/country', 6],
  ['/onboarding/location', 7],
  ['/onboarding/focus', 8],
  ['/onboarding/focus-proof', 9],
  ['/onboarding/username', 10],
  ['/onboarding/trust', 11],
  ['/onboarding/attribution', 12],
  ['/onboarding/safety', 13],
  ['/onboarding/setup', null],
  ['/onboarding/paywall', null],
];

/** Follows nextRoute from the start until it says finish. */
function walk(flow: ReturnType<typeof createFlow>): OnboardingRoute[] {
  const seen: OnboardingRoute[] = [];
  let at: OnboardingRoute | null = '/onboarding';
  while (at) {
    seen.push(at);
    if (seen.length > 50) throw new Error('flow does not terminate');
    at = flow.nextRoute(at);
  }
  return seen;
}

describe('createFlow, every step on', () => {
  const flow = createFlow({ safety: true, paywall: true });

  test('matches the documented order and progress positions', () => {
    expect(flow.steps.map((s) => [s.route, s.progress])).toEqual(DOCUMENTED);
  });

  test('the bar is 13 steps long', () => {
    expect(flow.totalProgressSteps).toBe(13);
  });

  test('walking Continue visits every step once and then finishes', () => {
    expect(walk(flow)).toEqual(DOCUMENTED.map(([r]) => r));
  });

  test('progressFor agrees with the table', () => {
    for (const [route, progress] of DOCUMENTED) expect(flow.progressFor(route)).toBe(progress);
  });

  test('the paywall is last and finishes onboarding', () => {
    expect(flow.nextRoute('/onboarding/setup')).toBe('/onboarding/paywall');
    expect(flow.nextRoute('/onboarding/paywall')).toBeNull();
  });
});

describe('createFlow, safety acknowledgement off', () => {
  const flow = createFlow({ safety: false, paywall: true });

  test('the bar shrinks to 12 and still ends full', () => {
    expect(flow.totalProgressSteps).toBe(12);
    const last = flow.steps.filter((s) => s.progress !== null).at(-1);
    expect(last).toEqual({ route: '/onboarding/attribution', progress: 12 });
  });

  test('attribution goes straight to setup', () => {
    expect(flow.nextRoute('/onboarding/attribution')).toBe('/onboarding/setup');
    expect(walk(flow)).not.toContain('/onboarding/safety');
  });

  test('a stale link to the removed step neither shows the bar nor routes anywhere', () => {
    expect(flow.progressFor('/onboarding/safety')).toBeNull();
    expect(flow.nextRoute('/onboarding/safety')).toBeNull();
  });
});

describe('terms acceptance', () => {
  // App Review (1.2, 5.1.1): agreeing to the terms and confirming the minimum
  // age is not optional, so no combination of flags may finish onboarding
  // without passing the step that asks — and none may ask twice.
  test.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])('safety %s, paywall %s: asked on exactly one step the walk visits', (safety, paywall) => {
    const flow = createFlow({ safety, paywall });
    expect(walk(flow)).toContain(flow.termsRoute);
    expect(flow.termsRoute).toBe(safety ? '/onboarding/safety' : '/onboarding/trust');
  });

  test('it comes before setup, which sends the answers', () => {
    for (const safety of [true, false]) {
      const order = walk(createFlow({ safety, paywall: false }));
      expect(order.indexOf(createFlow({ safety, paywall: false }).termsRoute)).toBeLessThan(
        order.indexOf('/onboarding/setup'),
      );
    }
  });

  test('this build asks where its flag says', () => {
    expect(TERMS_ROUTE).toBe(SAFETY_ACKNOWLEDGEMENT ? '/onboarding/safety' : '/onboarding/trust');
  });

  test('both candidate steps record the agreement; trust only when it is the one asking', () => {
    // Either can be the one asking, so each must hold the whole of it. Safety
    // asks whenever it is in the flow; trust asks only when TERMS_ROUTE says.
    const dir = path.join(__dirname, '../../../app/onboarding');
    const read = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
    for (const file of ['safety.tsx', 'trust.tsx']) {
      expect({ file, acceptTerms: read(file).includes('acceptTerms()') }).toEqual({
        file,
        acceptTerms: true,
      });
    }
    expect(read('trust.tsx')).toMatch(/TERMS_ROUTE === '\/onboarding\/trust'/);
  });
});

describe('createFlow, paywall off', () => {
  const flow = createFlow({ safety: true, paywall: false });

  test('setup finishes onboarding', () => {
    expect(flow.nextRoute('/onboarding/setup')).toBeNull();
    expect(walk(flow).at(-1)).toBe('/onboarding/setup');
  });

  test('the paywall never moves the bar', () => {
    expect(flow.totalProgressSteps).toBe(13);
  });
});

describe('the flow this build ships', () => {
  test('is built from the real flags', () => {
    expect(TOTAL_PROGRESS_STEPS).toBe(SAFETY_ACKNOWLEDGEMENT ? 13 : 12);
    expect(ONBOARDING_STEPS.some((s) => s.route === '/onboarding/paywall')).toBe(ONBOARDING_PAYWALL);
  });

  test('starts at the carousel and goes to the ride step', () => {
    expect(ONBOARDING_STEPS[0].route).toBe('/onboarding');
    expect(nextRoute('/onboarding')).toBe('/onboarding/ride');
    expect(progressFor('/onboarding')).toBeNull();
    expect(progressFor('/onboarding/ride')).toBe(1);
  });

  test('the progress positions run 1..TOTAL with no gaps', () => {
    const positions = ONBOARDING_STEPS.map((s) => s.progress).filter((p) => p !== null);
    expect(positions).toEqual(Array.from({ length: TOTAL_PROGRESS_STEPS }, (_, i) => i + 1));
  });

  test('safety, when on, is the last question before setup', () => {
    if (!SAFETY_ACKNOWLEDGEMENT) return;
    expect(nextRoute('/onboarding/safety')).toBe('/onboarding/setup');
  });
});

describe('route files', () => {
  // Every step routes by path, so a step whose file is renamed or deleted
  // would only show up as an unmatched route at runtime, mid-onboarding.
  const dir = path.join(__dirname, '../../../app/onboarding');
  const fileFor = (route: OnboardingRoute) =>
    path.join(dir, route === '/onboarding' ? 'index.tsx' : `${route.slice('/onboarding/'.length)}.tsx`);

  test('every step in the documented flow has a screen', () => {
    for (const [route] of DOCUMENTED) expect([route, fs.existsSync(fileFor(route))]).toEqual([route, true]);
  });

  test('every screen in app/onboarding is a step in the flow', () => {
    const known = new Set(DOCUMENTED.map(([route]) => path.basename(fileFor(route))));
    const stray = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.tsx') && f !== '_layout.tsx' && !known.has(f));
    expect(stray).toEqual([]);
  });

  // The registry only decides where Continue goes if each screen tells it
  // where it is. A step pasted from its neighbour and left saying the
  // neighbour's route would skip a step (or loop on one), and its progress
  // bar would show the neighbour's position — nothing a type can catch, since
  // every route is a valid OnboardingRoute.
  test('every screen advances from, and draws the bar for, its own route', () => {
    for (const [route] of DOCUMENTED) {
      const source = fs.readFileSync(fileFor(route), 'utf8');
      const advancesFrom = [...source.matchAll(/useOnboardingAdvance\('([^']+)'\)/g)].map(
        (m) => m[1],
      );
      const framedAs = [...source.matchAll(/route="([^"]+)"/g)].map((m) => m[1]);
      expect({ route, advancesFrom }).toEqual({ route, advancesFrom: [route] });
      for (const framed of framedAs) expect({ route, framed }).toEqual({ route, framed: route });
    }
  });

  test('no screen names another step itself', () => {
    // Order lives in flow.ts; a hard-coded router call to a step is how a
    // flag that removes a step used to leave the flow stranded.
    for (const [route] of DOCUMENTED) {
      const source = fs.readFileSync(fileFor(route), 'utf8');
      const hardcoded = /router\.(push|navigate|replace)\(\s*['"`]\/onboarding/.test(source);
      expect({ route, hardcoded }).toEqual({ route, hardcoded: false });
    }
  });
});

describe('option lists', () => {
  test('focus covers every key once, in the documented order', () => {
    expect(FOCUS_OPTIONS.map((o) => o.key)).toEqual([
      'topSpeed',
      'zeroToSixty',
      'localRanking',
      'beatFriends',
    ]);
    for (const o of FOCUS_OPTIONS) expect(o.sublabel).toBeTruthy();
    // The key keeps its stored name; the words compare rather than compete.
    expect(focusOption('beatFriends').label).toBe('Friends');
  });

  test('focus measures; it never invites a launch or a race', () => {
    expect(focusOption('zeroToSixty')).toMatchObject({
      label: '0–60',
      sublabel: 'Your acceleration, measured',
      spoken: 'Zero to sixty',
    });
    // Top speed says where it belongs.
    expect(focusOption('topSpeed').sublabel).toMatch(/tracks and closed roads/);
    for (const o of FOCUS_OPTIONS) {
      expect(`${o.label} ${o.sublabel}`).not.toMatch(/launch|race|racing|fastest|faster|beat/i);
    }
  });

  test('attribution covers every key once, in the documented order', () => {
    expect(ATTRIBUTION_OPTIONS.map((o) => o.label)).toEqual([
      'TikTok',
      'App Store',
      'A friend',
      'X / Twitter',
      'Other',
      'Reddit',
      'YouTube',
      'Instagram',
    ]);
    expect(new Set(ATTRIBUTION_OPTIONS.map((o) => o.key)).size).toBe(ATTRIBUTION_OPTIONS.length);
  });
});

describe('vehicleNoun', () => {
  test('bike for a motorbike, car otherwise', () => {
    expect(vehicleNoun('motorbike')).toBe('bike');
    expect(vehicleNoun('car')).toBe('car');
    expect(vehicleNoun(null)).toBe('car');
  });
});
