/**
 * Keeping a focused field above the keyboard without yanking a field that is
 * already in view.
 */

import { scrollTargetFor } from '../scroll';

const base = { offset: 0, viewport: 300, margin: 16 };

describe('scrollTargetFor', () => {
  it('leaves a field that is already visible alone', () => {
    expect(scrollTargetFor({ ...base, top: 100, bottom: 156 })).toBeNull();
  });

  it('scrolls a field below the window up to just above its bottom edge', () => {
    // The nickname field on a 667pt phone with the keyboard up.
    expect(scrollTargetFor({ ...base, top: 600, bottom: 656 })).toBe(656 + 16 - 300);
  });

  it('scrolls back up to a field above the window', () => {
    expect(scrollTargetFor({ ...base, offset: 400, top: 200, bottom: 256 })).toBe(184);
  });

  it('never asks for a negative offset', () => {
    expect(scrollTargetFor({ ...base, offset: 50, top: 4, bottom: 60 })).toBe(0);
  });

  it('aligns a span taller than the window to its top', () => {
    expect(scrollTargetFor({ ...base, top: 500, bottom: 900 })).toBe(484);
    expect(scrollTargetFor({ ...base, offset: 484, top: 500, bottom: 900 })).toBeNull();
  });

  it('does nothing before the window has been measured', () => {
    expect(scrollTargetFor({ ...base, viewport: 0, top: 600, bottom: 656 })).toBeNull();
  });
});
