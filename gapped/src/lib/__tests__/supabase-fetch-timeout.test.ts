/**
 * The deadline on every request supabase-js makes.
 *
 * React Native's fetch never gives up on its own, and RN's AbortSignal (the
 * abort-controller 3.0 polyfill) has no AbortSignal.timeout — so both paths
 * are pinned: the native one where it exists, and the controller-and-timer
 * fallback the app actually runs on a phone.
 */

// jest.mock below is hoisted above this import by babel-jest.
import {
  FUNCTION_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  timeoutFor,
} from '../supabase';

// No client is created without env, but the module must never build a real
// one in a test (auth would start its refresh timers).
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({})) }));

const realFetch = global.fetch;
const realTimeout = AbortSignal.timeout;

/** A fetch that settles only when its signal aborts — the hung connection. */
function hangingFetch() {
  return jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
}

function setTimeoutSupport(fn: typeof AbortSignal.timeout | undefined) {
  Object.defineProperty(AbortSignal, 'timeout', { value: fn, configurable: true, writable: true });
}

afterEach(() => {
  global.fetch = realFetch;
  setTimeoutSupport(realTimeout);
  jest.useRealTimers();
});

describe('timeoutFor', () => {
  test('PostgREST and auth get the request budget', () => {
    expect(timeoutFor('https://x.supabase.co/rest/v1/drives?id=eq.1')).toBe(REQUEST_TIMEOUT_MS);
    expect(timeoutFor(new URL('https://x.supabase.co/auth/v1/token'))).toBe(REQUEST_TIMEOUT_MS);
    expect(REQUEST_TIMEOUT_MS).toBe(15_000);
  });

  test('edge functions get longer, since verify-drive is retried from the start when cut off', () => {
    expect(timeoutFor('https://x.supabase.co/functions/v1/verify-drive')).toBe(FUNCTION_TIMEOUT_MS);
    expect(timeoutFor({ url: 'https://x.supabase.co/functions/v1/decode-vin' } as Request)).toBe(
      FUNCTION_TIMEOUT_MS,
    );
    expect(FUNCTION_TIMEOUT_MS).toBeGreaterThan(REQUEST_TIMEOUT_MS);
  });
});

describe('fetchWithTimeout', () => {
  test("a caller's own signal is passed through untouched, with no deadline added", async () => {
    const fetchMock = jest.fn(async () => new Response('ok'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const timeout = jest.fn();
    setTimeoutSupport(timeout as unknown as typeof AbortSignal.timeout);
    const own = new AbortController().signal;

    await fetchWithTimeout('https://x.supabase.co/rest/v1/drives', { method: 'GET', signal: own });

    expect(timeout).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('https://x.supabase.co/rest/v1/drives', {
      method: 'GET',
      signal: own,
    });
  });

  test('uses AbortSignal.timeout where the runtime has it', async () => {
    const fetchMock = jest.fn(async () => new Response('ok'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const marker = new AbortController().signal;
    const timeout = jest.fn(() => marker);
    setTimeoutSupport(timeout as unknown as typeof AbortSignal.timeout);

    await fetchWithTimeout('https://x.supabase.co/functions/v1/verify-drive', {
      method: 'POST',
      headers: { a: 'b' },
    });

    expect(timeout).toHaveBeenCalledWith(FUNCTION_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledWith('https://x.supabase.co/functions/v1/verify-drive', {
      method: 'POST',
      headers: { a: 'b' },
      signal: marker,
    });
  });

  describe('without AbortSignal.timeout (React Native)', () => {
    beforeEach(() => {
      setTimeoutSupport(undefined);
      jest.useFakeTimers();
    });

    test('a request that never answers is aborted at the deadline', async () => {
      const fetchMock = hangingFetch();
      global.fetch = fetchMock as unknown as typeof fetch;

      const pending = fetchWithTimeout('https://x.supabase.co/rest/v1/drives');
      const settled = jest.fn();
      pending.catch(settled);

      jest.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1);
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      await expect(pending).rejects.toThrow('aborted');
    });

    test('a request that answers leaves no timer behind', async () => {
      global.fetch = jest.fn(async () => new Response('ok')) as unknown as typeof fetch;

      const res = await fetchWithTimeout('https://x.supabase.co/rest/v1/drives');

      expect(res).toBeInstanceOf(Response);
      expect(jest.getTimerCount()).toBe(0);
    });

    test('a request that fails on its own also clears its timer', async () => {
      global.fetch = jest.fn(async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch;

      await expect(fetchWithTimeout('https://x.supabase.co/rest/v1/drives')).rejects.toThrow(
        'Network request failed',
      );
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
