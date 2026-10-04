/**
 * The proof screens' fetches, against a recording fake of supabase-js.
 *
 * A proof screen may print only what the server sent, so what matters here is
 * every way of not getting an answer — no backend, an error, a malformed
 * reply, a network that never answers — and that each one ends in null (the
 * early variant) rather than a number, a throw or a screen left waiting. And
 * the reverse: that a real answer, in the shape PostgREST actually returns it,
 * reaches `brandProof` and `countryProof` intact, with or without a session.
 *
 * The SQL side — who is counted, the floors, the grants — is held by
 * supabase/tests/onboarding_social_proof.test.sql. These exact statements were
 * also run against the local stack with supabase-js: bigint, int and numeric
 * all arrive as JSON numbers, and withheld counts as JSON null.
 */

// jest.mock calls below are hoisted above these imports by babel-jest.
import {
  brandProof,
  countryProof,
  fetchCountryActivity,
  fetchMakePopularity,
  formatShare,
  PROOF_FETCH_TIMEOUT_MS,
  saveOnboardingAnswers,
  upsertOnboardingAnswers,
} from '../socialProof';
import type { CountryCode } from '@/data/countries';
import type { SupabaseClient } from '@supabase/supabase-js';

type Reply = { data?: unknown; error?: unknown };
type RpcCall = { fn: string; args: unknown; signal?: AbortSignal };
type WriteCall = { table: string; payload: unknown; options: unknown };

const mockRpcCalls: RpcCall[] = [];
const mockWrites: WriteCall[] = [];
let mockRpc: (call: RpcCall) => Reply | Promise<Reply> = () => ({ data: [], error: null });
let mockWrite: (call: WriteCall) => Reply | Promise<Reply> = () => ({ error: null });
let mockUserId: string | null = 'user-1';
let mockHasBackend = true;

const mockClient = {
  rpc(fn: string, args: unknown) {
    const call: RpcCall = { fn, args };
    const b = {
      abortSignal(signal: AbortSignal) {
        call.signal = signal;
        return b;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        mockRpcCalls.push(call);
        return Promise.resolve()
          .then(() => mockRpc(call))
          .then(resolve, reject);
      },
    };
    return b;
  },
  from(table: string) {
    return {
      upsert(payload: unknown, options?: unknown) {
        const call: WriteCall = { table, payload, options };
        return {
          then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
            mockWrites.push(call);
            return Promise.resolve()
              .then(() => mockWrite(call))
              .then(resolve, reject);
          },
        };
      },
    };
  },
};

jest.mock('@/lib/supabase', () => ({
  get supabase() {
    return mockHasBackend ? mockClient : null;
  },
  ensureUserId: jest.fn(async () => mockUserId),
}));

const GB = 'GB' as CountryCode;

/** What PostgREST returns for make_popularity('car'): numbers, ranked. */
const SERVER_ROWS = [
  { make: 'BMW', drivers: 40, rank: 1, share: 25 },
  { make: 'Volkswagen', drivers: 30, rank: 2, share: 18.8 },
  { make: 'Ford', drivers: 25, rank: 3, share: 15.6 },
  { make: 'Audi', drivers: 20, rank: 4, share: 12.5 },
  { make: 'Toyota', drivers: 15, rank: 5, share: 9.4 },
  { make: 'Honda', drivers: 12, rank: 6, share: 7.5 },
];

beforeEach(() => {
  mockRpcCalls.length = 0;
  mockWrites.length = 0;
  mockRpc = () => ({ data: [], error: null });
  mockWrite = () => ({ error: null });
  mockUserId = 'user-1';
  mockHasBackend = true;
});

afterEach(() => {
  jest.useRealTimers();
});

/** A reply that never comes — a request stuck on a dead connection. */
const never = () => new Promise<Reply>(() => undefined);

describe('fetchMakePopularity', () => {
  test('asks make_popularity for the kind, with a signal it can be cancelled by', async () => {
    mockRpc = () => ({ data: SERVER_ROWS, error: null });
    expect(await fetchMakePopularity('motorbike')).toEqual(SERVER_ROWS);
    expect(mockRpcCalls).toHaveLength(1);
    expect(mockRpcCalls[0]).toMatchObject({ fn: 'make_popularity', args: { p_kind: 'motorbike' } });
    expect(mockRpcCalls[0].signal).toBeDefined();
  });

  test('the server’s rows drive the ranked variant, share already a percentage', async () => {
    mockRpc = () => ({ data: SERVER_ROWS, error: null });
    const proof = brandProof(await fetchMakePopularity('car'), 'audi');
    expect(proof).toMatchObject({ kind: 'ranked', count: 20, rank: 4, share: 12.5 });
    if (proof.kind !== 'ranked') throw new Error('expected ranked');
    expect(formatShare(proof.share)).toBe('13');
  });

  test('reachable but nobody yet is an empty list, not null — both are early', async () => {
    const rows = await fetchMakePopularity('car');
    expect(rows).toEqual([]);
    expect(brandProof(rows, 'BMW')).toEqual({ kind: 'early' });
  });

  test('numbers sent as strings are still numbers', async () => {
    mockRpc = () => ({
      data: [{ make: 'BMW', drivers: '40', rank: '1', share: '25.0' }],
      error: null,
    });
    expect(await fetchMakePopularity('car')).toEqual([{ make: 'BMW', drivers: 40, rank: 1, share: 25 }]);
  });

  test.each([
    ['a row without a make', { drivers: 5, rank: 1, share: 10 }],
    ['an empty make', { make: '', drivers: 5, rank: 1, share: 10 }],
    ['a count that is not a number', { make: 'BMW', drivers: 'many', rank: 1, share: 10 }],
    ['a missing share', { make: 'BMW', drivers: 5, rank: 1 }],
    ['a null count', { make: 'BMW', drivers: null, rank: 1, share: 10 }],
    ['a row that is not an object', null],
  ])('%s makes the whole answer null, not a chart with a gap', async (_label, bad) => {
    mockRpc = () => ({ data: [...SERVER_ROWS, bad], error: null });
    expect(await fetchMakePopularity('car')).toBeNull();
  });

  test('a reply that is not a list is null', async () => {
    mockRpc = () => ({ data: { make: 'BMW' }, error: null });
    expect(await fetchMakePopularity('car')).toBeNull();
  });

  test('an error is null', async () => {
    mockRpc = () => ({ data: null, error: { code: 'PGRST202', message: 'function not found' } });
    expect(await fetchMakePopularity('car')).toBeNull();
  });

  test('a throw is null, never a rejection', async () => {
    mockRpc = () => {
      throw new TypeError('Network request failed');
    };
    await expect(fetchMakePopularity('car')).resolves.toBeNull();
  });

  test('no backend: null, and nothing is asked', async () => {
    mockHasBackend = false;
    expect(await fetchMakePopularity('car')).toBeNull();
    expect(mockRpcCalls).toHaveLength(0);
  });

  test('no session: asked anyway, as anon — the server grants it for this screen', async () => {
    // A sign-in refused while the network works (anonymous sign-ins are
    // rate-limited per IP) must not cost real numbers.
    mockUserId = null;
    mockRpc = () => ({ data: SERVER_ROWS, error: null });
    expect(await fetchMakePopularity('car')).toEqual(SERVER_ROWS);
    expect(mockRpcCalls).toHaveLength(1);
  });

  test('offline first launch: no session and no answer, so null', async () => {
    mockUserId = null;
    mockRpc = () => Promise.reject(new TypeError('Network request failed'));
    await expect(fetchMakePopularity('car')).resolves.toBeNull();
  });

  test('a reply that never comes is given up on, and the request cancelled', async () => {
    jest.useFakeTimers();
    mockRpc = never;
    const pending = fetchMakePopularity('car');
    await jest.advanceTimersByTimeAsync(PROOF_FETCH_TIMEOUT_MS - 1);
    expect(mockRpcCalls[0].signal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeNull();
    expect(mockRpcCalls[0].signal?.aborted).toBe(true);
  });

  test('a sign-in that never finishes is given up on too', async () => {
    jest.useFakeTimers();
    const { ensureUserId } = jest.requireMock('@/lib/supabase') as {
      ensureUserId: jest.Mock;
    };
    ensureUserId.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = fetchMakePopularity('car');
    await jest.advanceTimersByTimeAsync(PROOF_FETCH_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();
    expect(mockRpcCalls).toHaveLength(0);
  });
});

describe('fetchCountryActivity', () => {
  test('asks country_activity for the code and renames drove_yesterday', async () => {
    mockRpc = () => ({ data: [{ drivers: 140, drove_yesterday: 23 }], error: null });
    expect(await fetchCountryActivity(GB)).toEqual({ drivers: 140, droveYesterday: 23 });
    expect(mockRpcCalls[0]).toMatchObject({ fn: 'country_activity', args: { p_country: 'GB' } });
    expect(mockRpcCalls[0].signal).toBeDefined();
  });

  test('real counts reach the line the screen prefers', async () => {
    mockRpc = () => ({ data: [{ drivers: 140, drove_yesterday: 23 }], error: null });
    expect(countryProof(await fetchCountryActivity(GB))).toEqual({ kind: 'yesterday', n: 23 });

    mockRpc = () => ({ data: [{ drivers: 140, drove_yesterday: null }], error: null });
    expect(countryProof(await fetchCountryActivity(GB))).toEqual({ kind: 'onBoard', n: 140 });
  });

  test('counts the server withholds (null, under ten) are never printed', async () => {
    mockRpc = () => ({ data: [{ drivers: null, drove_yesterday: null }], error: null });
    const activity = await fetchCountryActivity(GB);
    expect(activity).toEqual({ drivers: 0, droveYesterday: 0 });
    expect(countryProof(activity)).toEqual({ kind: 'early' });
  });

  test('a single object, as PostgREST sends for .single(), is read the same', async () => {
    mockRpc = () => ({ data: { drivers: 12, drove_yesterday: 10 }, error: null });
    expect(await fetchCountryActivity(GB)).toEqual({ drivers: 12, droveYesterday: 10 });
  });

  test.each([
    ['no row', []],
    ['a count that is not a number', [{ drivers: 'lots', drove_yesterday: 3 }]],
    ['a row that is not an object', ['GB']],
    ['nothing at all', null],
  ])('%s is null', async (_label, data) => {
    mockRpc = () => ({ data, error: null });
    expect(await fetchCountryActivity(GB)).toBeNull();
  });

  test('an error, a throw and no backend are all null', async () => {
    mockRpc = () => ({ data: null, error: { message: 'permission denied' } });
    expect(await fetchCountryActivity(GB)).toBeNull();

    mockRpc = () => Promise.reject(new TypeError('Network request failed'));
    await expect(fetchCountryActivity(GB)).resolves.toBeNull();

    mockHasBackend = false;
    mockRpcCalls.length = 0;
    expect(await fetchCountryActivity(GB)).toBeNull();
    expect(mockRpcCalls).toHaveLength(0);
  });

  test('no session: asked anyway, as anon', async () => {
    mockUserId = null;
    mockRpc = () => ({ data: [{ drivers: 140, drove_yesterday: 23 }], error: null });
    expect(await fetchCountryActivity(GB)).toEqual({ drivers: 140, droveYesterday: 23 });
  });

  test('a reply that never comes is given up on, and the request cancelled', async () => {
    jest.useFakeTimers();
    mockRpc = never;
    const pending = fetchCountryActivity(GB);
    await jest.advanceTimersByTimeAsync(PROOF_FETCH_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();
    expect(mockRpcCalls[0].signal?.aborted).toBe(true);
  });
});

describe('saveOnboardingAnswers', () => {
  test('upserts both answers into the caller’s own row', async () => {
    await saveOnboardingAnswers({ focus: 'zeroToSixty', attribution: 'tiktok' });
    expect(mockWrites).toEqual([
      {
        table: 'onboarding_answers',
        payload: { profile_id: 'user-1', focus: 'zeroToSixty', attribution: 'tiktok' },
        options: { onConflict: 'profile_id' },
      },
    ]);
  });

  test('sends only the answers given, so a later save cannot blank an earlier one', async () => {
    await saveOnboardingAnswers({ focus: 'beatFriends', attribution: null });
    await saveOnboardingAnswers({ focus: null, attribution: 'x' });
    expect(mockWrites.map((w) => w.payload)).toEqual([
      { profile_id: 'user-1', focus: 'beatFriends' },
      { profile_id: 'user-1', attribution: 'x' },
    ]);
  });

  test('no answers, no write', async () => {
    await saveOnboardingAnswers({ focus: null, attribution: null });
    expect(mockWrites).toHaveLength(0);
  });

  test('never rejects: not on an error, a throw, no backend or no session', async () => {
    mockWrite = () => ({ error: { code: '42501', message: 'permission denied' } });
    await expect(saveOnboardingAnswers({ focus: 'topSpeed', attribution: null })).resolves.toBeUndefined();

    mockWrite = () => {
      throw new TypeError('Network request failed');
    };
    await expect(saveOnboardingAnswers({ focus: 'topSpeed', attribution: null })).resolves.toBeUndefined();

    mockHasBackend = false;
    await expect(saveOnboardingAnswers({ focus: 'topSpeed', attribution: null })).resolves.toBeUndefined();

    mockHasBackend = true;
    mockUserId = null;
    mockWrites.length = 0;
    await expect(saveOnboardingAnswers({ focus: 'topSpeed', attribution: null })).resolves.toBeUndefined();
    expect(mockWrites).toHaveLength(0);
  });

  test('stops waiting at the deadline, but leaves the write to land', async () => {
    jest.useFakeTimers();
    let land: (r: Reply) => void = () => undefined;
    mockWrite = () => new Promise<Reply>((resolve) => (land = resolve));
    let settled = false;
    const pending = saveOnboardingAnswers({ focus: 'topSpeed', attribution: null }).then(() => {
      settled = true;
    });

    await jest.advanceTimersByTimeAsync(PROOF_FETCH_TIMEOUT_MS);
    await pending;
    expect(settled).toBe(true);
    // The write was not cancelled; it is still out there and may yet succeed.
    expect(mockWrites).toHaveLength(1);
    land({ error: null });
  });
});

describe('upsertOnboardingAnswers', () => {
  const client = mockClient as unknown as SupabaseClient;

  test('resolves whether the server took the answers', async () => {
    expect(await upsertOnboardingAnswers(client, 'user-1', { focus: 'topSpeed', attribution: null })).toBe(true);

    mockWrite = () => ({ error: { message: 'relation "onboarding_answers" does not exist' } });
    expect(await upsertOnboardingAnswers(client, 'user-1', { focus: 'topSpeed', attribution: null })).toBe(false);

    mockWrite = () => Promise.reject(new TypeError('Network request failed'));
    expect(await upsertOnboardingAnswers(client, 'user-1', { focus: 'topSpeed', attribution: null })).toBe(false);
  });

  test('nothing to send counts as saved', async () => {
    expect(await upsertOnboardingAnswers(client, 'user-1', { focus: null, attribution: null })).toBe(true);
    expect(mockWrites).toHaveLength(0);
  });
});
