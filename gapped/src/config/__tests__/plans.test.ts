/**
 * The published plans matrix, the one sentence elsewhere that describes it
 * (the onboarding paywall's "what Pro adds" line must stay true of it), and
 * where the Pro surfaces lead with Pro shown and hidden.
 */

import { ONBOARDING_PAYWALL, PRO_LIMITS_ENFORCED, SHOW_PRO } from '../flags';
import * as plans from '../plans';
import {
  FREE_LIMITS,
  goProRoute,
  PAYWALL_PRO_NOTE,
  paywallRedirect,
  PLAN_MATRIX,
  type PlanFeatureKey,
  plansRedirect,
  PRO_PLANS,
} from '../plans';

const row = (key: string) => PLAN_MATRIX.find((r) => r.key === key);

describe('PLAN_MATRIX', () => {
  it('has one row per feature', () => {
    const keys = PLAN_MATRIX.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    const names = PLAN_MATRIX.map((r) => r.feature);
    expect(new Set(names).size).toBe(names.length);
  });

  it('never offers Free something Pro lacks', () => {
    for (const r of PLAN_MATRIX) if (r.free) expect(r.pro).toBe(true);
  });

  it('lists only what the app does today', () => {
    // It once promised a telemetry overlay on your video, restoring your
    // drives on a new phone and privacy zones nobody could draw. None of them
    // exists; a row comes back when its feature (and, if Pro, its lock) does.
    for (const r of PLAN_MATRIX) {
      expect(r.feature).not.toMatch(/video|overlay|restore|new phone|cloud|sync|backup|zone/i);
    }
    const keys: string[] = PLAN_MATRIX.map((r) => r.key);
    expect(keys).not.toContain('videoOverlay');
    expect(keys).not.toContain('cloudSync');
  });
});

describe('PAYWALL_PRO_NOTE', () => {
  it('only calls free what the matrix gives Free', () => {
    for (const key of PAYWALL_PRO_NOTE.claims.free) expect(row(key)?.free).toBe(true);
  });

  it('only says Pro adds what Free does not have', () => {
    for (const key of PAYWALL_PRO_NOTE.claims.proOnly) {
      expect(row(key)?.pro).toBe(true);
      expect(row(key)?.free).toBe(false);
    }
  });

  it('says what it claims', () => {
    // A tie between the claims and the words, so the sentence cannot be
    // rewritten to say something else while the claims stand still. A claim
    // with no words here fails too: add its words when you add the claim.
    const words: Partial<Record<PlanFeatureKey, RegExp>> = {
      recordDrives: /recording/i,
      boardPlacement: /the boards/i,
      fullHistory: /full (drive )?history/i,
      advancedTelemetry: /cornering G/,
      classBrackets: /class brackets/i,
      cleanShareCards: /clean share cards/i,
    };
    const { free, proOnly } = PAYWALL_PRO_NOTE.claims;
    for (const key of [...free, ...proOnly]) {
      expect(words[key]).toBeDefined();
      expect(PAYWALL_PRO_NOTE.text).toMatch(words[key] as RegExp);
    }
    expect(PAYWALL_PRO_NOTE.text).toMatch(/\bPro adds\b/);
    expect(PAYWALL_PRO_NOTE.text).toMatch(/stay free/i);
  });

  it('sells nothing that is not built', () => {
    expect(PAYWALL_PRO_NOTE.text).not.toMatch(/video|overlay|restore|sync|backup/i);
  });
});

describe('PRO_PLANS', () => {
  it('is monthly then weekly: nothing longer, and no trial', () => {
    expect(PRO_PLANS.map((p) => p.key)).toEqual(['monthly', 'weekly']);
    for (const p of PRO_PLANS) expect(`${p.title} ${p.period}`).not.toMatch(/annual|yearly|trial/i);
  });

  it('carries no pricing promise of its own', () => {
    // The Plans screen's pricing line promised a weekly and a monthly price
    // "after the first release". There is no price, and nothing to promise.
    expect(Object.keys(plans)).not.toContain('PRO_PRICING_NOTE');
  });
});

describe('board placement', () => {
  // Onboarding's proof screens promise that each verified drive is added to
  // the board and count the drivers already on it. Gating placement behind Pro
  // would make those screens untrue for everyone on Free.
  it('is free', () => {
    expect(row('boardPlacement')?.free).toBe(true);
  });
});

describe('Free limits', () => {
  it('are the numbers the matrix prints', () => {
    expect(row('recentHistory')?.feature).toContain(String(FREE_LIMITS.historyDays));
    expect(row('friends')?.feature).toContain(String(FREE_LIMITS.friends));
    expect(row('garage')?.feature).toContain(String(FREE_LIMITS.garageVehicles));
  });

  it('each have a Pro row that lifts them', () => {
    expect(row('fullHistory')).toMatchObject({ free: false, pro: true });
    expect(row('unlimitedFriends')).toMatchObject({ free: false, pro: true });
    expect(row('unlimitedGarage')).toMatchObject({ free: false, pro: true });
  });

  it('never put privacy behind Pro', () => {
    expect(row('privacy')?.free).toBe(true);
  });
});

describe('where the Pro surfaces lead', () => {
  it('shows Pro exactly when its limits can be enforced, which is when it can be bought', () => {
    expect(SHOW_PRO).toBe(PRO_LIMITS_ENFORCED);
  });

  it('a "leads to Pro" tap opens the matrix with Pro shown, and does nothing with it hidden', () => {
    expect(goProRoute(true)).toBe('/plans');
    expect(goProRoute(false)).toBeNull();
    // This build: off until purchases work.
    expect(goProRoute()).toBe(SHOW_PRO ? '/plans' : null);
  });

  it('/plans draws the matrix with Pro shown, and redirects with it hidden', () => {
    expect(plansRedirect(true, true)).toBeNull();
    expect(plansRedirect(false, true)).toBeNull();
    expect(plansRedirect(true, false)).toBe('/(tabs)/you');
    // Outside the onboarded guard: no profile yet, so not the tabs.
    expect(plansRedirect(false, false)).toBe('/onboarding');
    expect(plansRedirect(true) === null).toBe(SHOW_PRO);
  });

  it('the paywall is never switched on while Pro is hidden', () => {
    // It sells Gapped Pro, so it is a Pro surface like the rest. Its redirect
    // reads ONBOARDING_PAYWALL alone; this keeps that flag from turning on in
    // a build where every other mention of Pro is hidden.
    if (ONBOARDING_PAYWALL) expect(SHOW_PRO).toBe(true);
  });

  it('the paywall draws only with ONBOARDING_PAYWALL on; off, a link to it restarts onboarding', () => {
    expect(paywallRedirect(true)).toBeNull();
    expect(paywallRedirect(false)).toBe('/onboarding');
    expect(paywallRedirect() === null).toBe(ONBOARDING_PAYWALL);
  });
});

describe('with the flags flipped on, as the purchases build will ship', () => {
  // The defaults above read the committed flags. This re-loads the module
  // against flags with Pro on, so the build that turns it on is tested now.
  function withFlags(flags: { SHOW_PRO: boolean; ONBOARDING_PAYWALL: boolean }) {
    let loaded: typeof plans | undefined;
    jest.isolateModules(() => {
      jest.doMock('../flags', () => ({
        ...jest.requireActual('../flags'),
        ...flags,
        PRO_LIMITS_ENFORCED: flags.SHOW_PRO,
      }));
      // The real module, whose own import of the flags now gets the mock.
      loaded = jest.requireActual<typeof plans>('../plans');
    });
    jest.dontMock('../flags');
    return loaded as typeof plans;
  }

  it('leads to Pro, draws /plans and draws the paywall', () => {
    const on = withFlags({ SHOW_PRO: true, ONBOARDING_PAYWALL: true });
    expect(on.goProRoute()).toBe('/plans');
    expect(on.plansRedirect(true)).toBeNull();
    expect(on.plansRedirect(false)).toBeNull();
    expect(on.paywallRedirect()).toBeNull();
  });

  it('and off again, leads nowhere and redirects both', () => {
    const off = withFlags({ SHOW_PRO: false, ONBOARDING_PAYWALL: false });
    expect(off.goProRoute()).toBeNull();
    expect(off.plansRedirect(true)).toBe('/(tabs)/you');
    expect(off.paywallRedirect()).toBe('/onboarding');
  });
});
