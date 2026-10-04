import {
  checklistProgress,
  displayPercent,
  SETUP_FINISH_MS,
  SETUP_HOLD_PERCENT,
  SETUP_MAX_WAIT_MS,
  SETUP_MIN_MS,
  setupChecklist,
  setupPercent,
} from '../setupTimeline';

/** Samples the curve every frame from 0 to `until`. */
function sample(workDoneAt: number | null, until: number, step = 16): number[] {
  const out: number[] = [];
  for (let t = 0; t <= until; t += step) out.push(setupPercent(t, workDoneAt));
  return out;
}

/** The first sampled time the curve reaches 100, or null. */
function finishTime(workDoneAt: number | null, until = SETUP_MAX_WAIT_MS * 2): number | null {
  for (let t = 0; t <= until; t += 1) if (setupPercent(t, workDoneAt) >= 100) return t;
  return null;
}

describe('setupPercent', () => {
  it('starts at 0', () => {
    expect(setupPercent(0, null)).toBe(0);
    expect(setupPercent(0, 0)).toBe(0);
  });

  it('never decreases, whenever the work lands', () => {
    for (const done of [0, 500, 1500, 2600, 3000, 3200, 4500, SETUP_MAX_WAIT_MS]) {
      const values = sample(done, SETUP_MAX_WAIT_MS + 1000);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
      }
    }
  });

  it('never jumps: no frame moves more than a few percent', () => {
    for (const done of [0, 2000, 2900, 4000]) {
      const values = sample(done, 6000);
      for (let i = 1; i < values.length; i++) expect(values[i] - values[i - 1]).toBeLessThan(4);
    }
  });

  it('takes the minimum when the work is instant (offline, no backend)', () => {
    expect(finishTime(0)).toBe(SETUP_MIN_MS);
  });

  it('never finishes before the minimum, however fast the work', () => {
    expect(finishTime(0)).toBeGreaterThanOrEqual(SETUP_MIN_MS);
    expect(setupPercent(SETUP_MIN_MS - 1, 0)).toBeLessThan(100);
  });

  it('holds short of 100 while the work is still out', () => {
    const values = sample(null, SETUP_MAX_WAIT_MS);
    expect(Math.max(...values)).toBe(SETUP_HOLD_PERCENT);
    expect(setupPercent(SETUP_MAX_WAIT_MS - 1, null)).toBe(SETUP_HOLD_PERCENT);
  });

  it('finishes from the hold in one short step once slow work lands', () => {
    const late = 5000;
    expect(setupPercent(late, late)).toBe(SETUP_HOLD_PERCENT);
    expect(finishTime(late)).toBe(late + SETUP_FINISH_MS);
  });

  it('is unaffected by work that lands before the curve reaches the hold', () => {
    for (let t = 0; t <= SETUP_MIN_MS; t += 100) {
      expect(setupPercent(t, 1000)).toBe(setupPercent(t, 0));
    }
  });

  it('is capped: a call that never returns still finishes at the wait limit', () => {
    expect(finishTime(null)).toBe(SETUP_MAX_WAIT_MS + SETUP_FINISH_MS);
    expect(finishTime(SETUP_MAX_WAIT_MS)).toBe(SETUP_MAX_WAIT_MS + SETUP_FINISH_MS);
  });

  it('ignores an answer that arrives after the cap: the finishing bar never falls back', () => {
    for (const late of [SETUP_MAX_WAIT_MS + 1, SETUP_MAX_WAIT_MS + 200, SETUP_MAX_WAIT_MS * 3]) {
      for (let t = 0; t <= SETUP_MAX_WAIT_MS + SETUP_FINISH_MS + 100; t += 50) {
        expect(setupPercent(t, late)).toBe(setupPercent(t, null));
      }
    }
  });

  it('never decreases when the answer lands mid-finish, sampled as the screen does', () => {
    // The screen re-reads workDoneAt every frame; an answer landing while the
    // capped finish is under way must not restart it.
    const landsAt = SETUP_MAX_WAIT_MS + SETUP_FINISH_MS / 2;
    let last = 0;
    for (let t = 0; t <= SETUP_MAX_WAIT_MS + SETUP_FINISH_MS; t += 16) {
      const p = setupPercent(t, t >= landsAt ? landsAt : null);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    // Still finishing on the cap's schedule, not restarted from the answer.
    expect(setupPercent(SETUP_MAX_WAIT_MS + SETUP_FINISH_MS, landsAt)).toBe(100);
  });
});

describe('displayPercent', () => {
  it('floors, so 100% is only printed once finished', () => {
    expect(displayPercent(99.99)).toBe(99);
    expect(displayPercent(100)).toBe(100);
    expect(displayPercent(-1)).toBe(0);
    expect(displayPercent(140)).toBe(100);
  });
});

describe('setupChecklist', () => {
  it('names the vehicle, and only the vehicle, by kind', () => {
    const car = setupChecklist('car');
    const bike = setupChecklist('bike');
    expect(car[0].label).toBe('Your car');
    expect(bike[0].label).toBe('Your bike');
    expect(car.slice(1)).toEqual(bike.slice(1));
  });

  it('lists the five rows in the documented order, with their captions', () => {
    expect(setupChecklist('car').map((i) => [i.label, i.caption ?? null])).toEqual([
      ['Your car', null],
      ['Your drive preferences', 'Your units. Your country. Your way.'],
      ['Your stats', null],
      ['Your rankings', null],
      ['Your setup', 'Keeping everything ready for your first drive.'],
    ]);
  });

  it('ticks in order, and the last row only at 100', () => {
    const thresholds = setupChecklist('car').map((i) => i.threshold);
    expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds);
    expect(thresholds[thresholds.length - 1]).toBe(100);
    expect(thresholds[0]).toBeGreaterThan(0);
  });
});

describe('checklistProgress', () => {
  const items = setupChecklist('car');

  it('has nothing ticked at 0, with the first row in progress', () => {
    expect(checklistProgress(0, items)).toEqual({ done: 0, active: 0 });
  });

  it('ticks a row exactly as the percent reaches its threshold', () => {
    const t = items[1].threshold;
    expect(checklistProgress(t - 1, items)).toEqual({ done: 1, active: 1 });
    expect(checklistProgress(t, items)).toEqual({ done: 2, active: 2 });
  });

  it('has everything ticked and nothing in progress at 100', () => {
    expect(checklistProgress(100, items)).toEqual({ done: items.length, active: null });
    const last = items.length - 1;
    expect(checklistProgress(99, items)).toEqual({ done: last, active: last });
  });
});
