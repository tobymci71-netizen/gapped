/**
 * The make-proof screen never waits on the network for longer than it says,
 * and never sees a rejection.
 */

import { PROOF_TIMEOUT_MS, SKELETON_GRACE_MS, withTimeout } from '../proofLoad';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes an answer that arrives in time straight through', async () => {
    const answer = withTimeout(Promise.resolve([1, 2]), 1000, null);
    await expect(answer).resolves.toEqual([1, 2]);
  });

  it('gives the fallback when the answer is late', async () => {
    const never = new Promise<number[]>(() => undefined);
    const answer = withTimeout(never, 1000, null);
    jest.advanceTimersByTime(1000);
    await expect(answer).resolves.toBeNull();
  });

  it('keeps an answer that lands just before the deadline', async () => {
    let resolve: (v: string) => void = () => undefined;
    const slow = new Promise<string>((r) => {
      resolve = r;
    });
    const answer = withTimeout(slow, 1000, 'fallback');
    jest.advanceTimersByTime(999);
    resolve('real');
    await expect(answer).resolves.toBe('real');
  });

  it('turns a rejection into the fallback', async () => {
    const answer = withTimeout(Promise.reject(new Error('offline')), 1000, null);
    await expect(answer).resolves.toBeNull();
  });

  it('leaves no timer behind once answered', async () => {
    await withTimeout(Promise.resolve(1), 1000, 0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('timing constants', () => {
  it('shows a skeleton well before giving up', () => {
    expect(SKELETON_GRACE_MS).toBeGreaterThan(0);
    expect(SKELETON_GRACE_MS).toBeLessThan(PROOF_TIMEOUT_MS / 4);
  });
});
