/**
 * The published plans matrix, and the one sentence elsewhere that describes
 * it: the onboarding paywall's "what Pro adds" line must stay true of it.
 */

import {
  FREE_LIMITS,
  PAYWALL_PRO_NOTE,
  PLAN_MATRIX,
  PRO_PLANS,
  PRO_PRICING_NOTE,
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
    // A light tie between the claims and the words, so the sentence cannot
    // be rewritten to say something else while the claims stand still.
    expect(PAYWALL_PRO_NOTE.text).toMatch(/the boards stay free/i);
    expect(PAYWALL_PRO_NOTE.text).toMatch(/full history/i);
    expect(PAYWALL_PRO_NOTE.text).toMatch(/cornering G/i);
    expect(PAYWALL_PRO_NOTE.text).toMatch(/class brackets/i);
    expect(PAYWALL_PRO_NOTE.text).toMatch(/clean share cards/i);
  });
});

describe('board placement', () => {
  // Onboarding's proof screens promise that every verified run lands on the
  // board and count the drivers already on it. Gating placement behind Pro
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

describe('PRO_PRICING_NOTE', () => {
  it('names every plan the paywall sells', () => {
    for (const p of PRO_PLANS) expect(PRO_PRICING_NOTE).toMatch(new RegExp(p.period, 'i'));
  });

  it('promises nothing the paywall does not offer', () => {
    // It once promised an annual price, a 3-day trial and a paywall that only
    // appeared after a first drive; the paywall has none of them.
    expect(PRO_PRICING_NOTE).not.toMatch(/annual|yearly|trial|first recorded drive/i);
    expect(PRO_PLANS.map((p) => p.key)).toEqual(['monthly', 'weekly']);
  });
});
