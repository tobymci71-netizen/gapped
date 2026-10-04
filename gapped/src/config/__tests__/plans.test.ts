/**
 * The published plans matrix, and the one sentence elsewhere that describes
 * it: the onboarding paywall's "what Pro adds" line must stay true of it.
 */

import { PAYWALL_PRO_NOTE, PLAN_MATRIX } from '../plans';

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
    expect(PAYWALL_PRO_NOTE.text).toMatch(/share cards stay free/i);
    expect(PAYWALL_PRO_NOTE.text).toMatch(/class brackets/i);
    expect(PAYWALL_PRO_NOTE.text).toMatch(/board placement/i);
    expect(PAYWALL_PRO_NOTE.text).toMatch(/telemetry/i);
  });
});
