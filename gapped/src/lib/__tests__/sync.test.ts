/**
 * The upload path, against a recording fake of supabase-js.
 *
 * What these pin down are failures that were invisible from the app, because
 * supabase-js returns errors instead of throwing and nothing read them:
 *
 *   - the profile and vehicle reached the server only when a drive was being
 *     uploaded, so a new user could not decode a VIN or be found as a friend;
 *   - the vehicles write was a merging upsert, which needs UPDATE on columns
 *     0009 never grants, so Postgres refused it every time;
 *   - a taken username rolled back the country sent in the same UPDATE;
 *   - a drive whose upload stopped half way could never be retried, because
 *     the retry re-inserted the same primary key and gave up.
 *
 * This file asserts what the client sends. What Postgres does with it was
 * checked by hand against the local stack: the old merging vehicles upsert is
 * refused with 42501, the DO NOTHING upserts on vehicles, drives and
 * drive_fixes succeed under the client grants (repeatedly, and with
 * overlapping fix batches), and a second driver's identical username is
 * refused with 23505. scripts/verify-roundtrip.mjs still uploads with plain
 * inserts, so it does not cover these statements.
 */

import { epochMs, gForce, metres, mps, seconds } from '@/types/units';
import type { Fix } from '@/drive/types';
import type { LocalDrive } from '@/drive/wal';
import { useProfile } from '@/state/profile';
// jest.mock calls below are hoisted above these imports by babel-jest.
import {
  __resetSyncStateForTests,
  haltSync,
  isUsernameAvailable,
  syncFinalizedDrives,
  syncIdentity,
  verifyFailureIsTransient,
} from '../sync';

type Err = { code?: string; message: string; context?: { status?: number } } | null;
type Call = {
  table: string;
  op: 'update' | 'upsert' | 'insert' | 'select';
  payload: unknown;
  options: Record<string, unknown> | undefined;
  filters: [string, unknown][];
};

const mockCalls: Call[] = [];
let mockRespond: (call: Call) => { error: Err; data?: unknown } = () => ({ error: null });
let mockVerify: () => { error: Err } = () => ({ error: null });

function mockBuilder(table: string) {
  const call: Call = { table, op: 'select', payload: undefined, options: undefined, filters: [] };
  const b = {
    update(payload: unknown) {
      call.op = 'update';
      call.payload = payload;
      return b;
    },
    upsert(payload: unknown, options?: Record<string, unknown>) {
      call.op = 'upsert';
      call.payload = payload;
      call.options = options;
      return b;
    },
    insert(payload: unknown) {
      call.op = 'insert';
      call.payload = payload;
      return b;
    },
    select() {
      return b;
    },
    eq(col: string, val: unknown) {
      call.filters.push([col, val]);
      return b;
    },
    limit() {
      return b;
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      mockCalls.push(call);
      return Promise.resolve(mockRespond(call)).then(resolve, reject);
    },
  };
  return b;
}

const mockInvoke = jest.fn(async () => mockVerify());

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => mockBuilder(table),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...(args as [])) },
  },
  ensureUserId: jest.fn(async () => 'user-1'),
}));

jest.mock('../attestation', () => ({ attestationFor: jest.fn(async () => null) }));

const mockUnsynced: LocalDrive[] = [];
const mockSynced = new Set<string>();
jest.mock('@/drive/wal', () => ({
  listUnsynced: () => mockUnsynced.filter((d) => !mockSynced.has(d.id)),
  readFixes: () => mockFixes,
  markSynced: (id: string) => mockSynced.add(id),
}));

let mockFixes: Fix[] = [];

function fixesN(n: number): Fix[] {
  return Array.from({ length: n }, (_, i) => ({
    t: epochMs(1_700_000_000_000 + i * 1000),
    lat: 51.5 as Fix['lat'],
    lon: -0.1 as Fix['lon'],
    speedMs: mps(20),
    accuracyM: metres(5),
  }));
}

function finalizedDrive(id: string): LocalDrive {
  return {
    id,
    vehicleId: 'veh-1',
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_600_000,
    status: 'finalized',
    summary: {
      startedAt: epochMs(1_700_000_000_000),
      endedAt: epochMs(1_700_000_600_000),
      distanceM: metres(10_000),
      durationS: seconds(600),
      maxSpeedMs: mps(30),
      avgSpeedMs: mps(16),
      maxG: gForce(0.4),
      avgG: gForce(0.2),
      zeroTo60S: null,
      fixCount: 600,
    },
  };
}

function onboard() {
  useProfile.setState({
    onboarded: true,
    username: 'toby',
    usernameTaken: false,
    country: 'GB' as never,
    unitPref: 'imperial',
    vehicleKind: 'car',
    vehicleMake: 'Honda',
    vehicleModel: 'Accord',
    vehicleId: 'veh-1',
  });
}

const of = (table: string, op: Call['op']) =>
  mockCalls.filter((c) => c.table === table && c.op === op);

beforeEach(() => {
  mockCalls.length = 0;
  mockUnsynced.length = 0;
  mockSynced.clear();
  mockFixes = fixesN(10);
  mockRespond = () => ({ error: null });
  mockVerify = () => ({ error: null });
  mockInvoke.mockClear();
  useProfile.getState().reset();
  __resetSyncStateForTests();
});

describe('identity', () => {
  test('is pushed even when no drive is waiting', async () => {
    onboard();
    await syncFinalizedDrives();

    expect(of('profiles', 'update').map((c) => c.payload)).toEqual([
      { country: 'GB', unit_pref: 'imperial' },
      { username: 'toby' },
    ]);
    expect(of('vehicles', 'upsert')).toHaveLength(1);
  });

  test('the vehicle is created with DO NOTHING, never a merge that needs UPDATE grants', async () => {
    onboard();
    await syncIdentity();

    const [v] = of('vehicles', 'upsert');
    expect(v.options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect(v.payload).toMatchObject({ id: 'veh-1', profile_id: 'user-1', kind: 'car' });
  });

  test('a taken username flags the profile and does not cost the country', async () => {
    onboard();
    mockRespond = (c) =>
      c.table === 'profiles' && (c.payload as { username?: string }).username
        ? { error: { code: '23505', message: 'duplicate key value' } }
        : { error: null };

    expect(await syncIdentity()).toBe(true);

    // Country went in its own statement, so the clash could not roll it back.
    expect(of('profiles', 'update')[0].payload).toEqual({ country: 'GB', unit_pref: 'imperial' });
    expect(useProfile.getState().usernameTaken).toBe(true);
    // The vehicle still goes up: drives need it, and the name is not a key.
    expect(of('vehicles', 'upsert')).toHaveLength(1);
  });

  test('a clash on a name the user has since replaced is not flagged', async () => {
    onboard();
    mockRespond = (c) => {
      if (c.table === 'profiles' && (c.payload as { username?: string }).username) {
        // The user picks a new name while this request is in flight.
        useProfile.getState().setUsername('toby_2');
        return { error: { code: '23505', message: 'duplicate key value' } };
      }
      return { error: null };
    };
    await syncIdentity();
    expect(useProfile.getState().usernameTaken).toBe(false);
  });

  test('choosing a new name clears the flag', () => {
    useProfile.getState().setUsernameTaken(true);
    useProfile.getState().setUsername('toby_2');
    expect(useProfile.getState().usernameTaken).toBe(false);
  });

  test('a name refused before and accepted now is no longer reported as taken', async () => {
    onboard();
    // Persisted from an earlier launch, when someone else still held it.
    useProfile.getState().setUsernameTaken(true);

    expect(await syncIdentity()).toBe(true);
    expect(useProfile.getState().usernameTaken).toBe(false);
  });

  test('a failed profile write is reported, not swallowed, and holds back the drives', async () => {
    onboard();
    mockUnsynced.push(finalizedDrive('d1'));
    mockRespond = (c) =>
      c.table === 'profiles' ? { error: { code: '42501', message: 'permission denied' } } : { error: null };

    expect(await syncIdentity()).toBe(false);
    __resetSyncStateForTests();
    expect(await syncFinalizedDrives()).toEqual({ uploaded: 0, failed: 1 });
    expect(of('drives', 'upsert')).toHaveLength(0);
  });

  test('an unchanged identity is not re-sent, a changed one is', async () => {
    onboard();
    await syncIdentity();
    const first = mockCalls.length;
    await syncIdentity();
    expect(mockCalls.length).toBe(first);

    useProfile.getState().setUnitPref('metric');
    await syncIdentity();
    expect(of('profiles', 'update').length).toBeGreaterThan(2);
  });
});

describe('drive upload', () => {
  test('every write is idempotent', async () => {
    onboard();
    mockUnsynced.push(finalizedDrive('d1'));
    await syncFinalizedDrives();

    expect(of('drives', 'upsert')[0].options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect(of('drive_fixes', 'upsert')[0].options).toEqual({
      onConflict: 'drive_id,t',
      ignoreDuplicates: true,
    });
    expect(of('drives', 'insert')).toHaveLength(0);
    expect(of('drive_fixes', 'insert')).toHaveLength(0);
    expect(mockSynced.has('d1')).toBe(true);
  });

  test('an upload interrupted between fix batches completes on the next attempt', async () => {
    onboard();
    mockFixes = fixesN(1200); // three batches of 500
    mockUnsynced.push(finalizedDrive('d1'));

    let batches = 0;
    mockRespond = (c) => {
      if (c.table === 'drive_fixes' && ++batches === 2) {
        return { error: { message: 'TypeError: Network request failed' } };
      }
      return { error: null };
    };
    expect(await syncFinalizedDrives()).toEqual({ uploaded: 0, failed: 1 });
    expect(mockSynced.has('d1')).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();

    // The drives row is on the server now. A plain insert would 23505 here and
    // never reach the missing fixes; DO NOTHING lets the retry carry on.
    mockRespond = () => ({ error: null });
    expect(await syncFinalizedDrives()).toEqual({ uploaded: 1, failed: 0 });
    expect(of('drive_fixes', 'upsert').length).toBe(2 + 3);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockSynced.has('d1')).toBe(true);
  });

  test('a verify call that never got an answer leaves the drive for next time', async () => {
    onboard();
    mockUnsynced.push(finalizedDrive('d1'));
    mockVerify = () => ({ error: { message: 'Failed to send a request to the Edge Function' } });

    expect(await syncFinalizedDrives()).toEqual({ uploaded: 0, failed: 1 });
    expect(mockSynced.has('d1')).toBe(false);
  });

  test('a definitive verify answer is not retried forever', async () => {
    onboard();
    mockUnsynced.push(finalizedDrive('d1'));
    mockVerify = () => ({ error: { message: 'drive not found', context: { status: 404 } } });

    expect(await syncFinalizedDrives()).toEqual({ uploaded: 1, failed: 0 });
    expect(mockSynced.has('d1')).toBe(true);
  });

  test('a refused caller is a session problem: the drive waits for the next attempt', async () => {
    onboard();
    mockUnsynced.push(finalizedDrive('d1'));
    mockVerify = () => ({ error: { message: 'forbidden', context: { status: 403 } } });

    expect(await syncFinalizedDrives()).toEqual({ uploaded: 0, failed: 1 });
    expect(mockSynced.has('d1')).toBe(false);
  });

  test('a call that lands mid-pass gets its own pass, not a share of a stale one', async () => {
    onboard();
    mockUnsynced.push(finalizedDrive('d1'));
    const first = syncFinalizedDrives();
    // A second drive finishes while the first pass is uploading.
    mockUnsynced.push(finalizedDrive('d2'));
    const second = syncFinalizedDrives();
    await Promise.all([first, second]);

    expect(mockSynced.has('d1')).toBe(true);
    expect(mockSynced.has('d2')).toBe(true);
    // d1 was uploaded once, not raced by two concurrent passes.
    expect(of('drives', 'upsert').filter((c) => (c.payload as { id: string }).id === 'd1')).toHaveLength(1);
  });
});

describe('a version-blocked build', () => {
  test('uploads nothing once halted, including the identity', async () => {
    onboard();
    mockUnsynced.push(finalizedDrive('d1'));
    haltSync();

    expect(await syncFinalizedDrives()).toEqual({ uploaded: 0, failed: 0 });
    expect(await syncIdentity()).toBe(false);
    expect(mockCalls).toHaveLength(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test('a block that lands mid-pass stops at the next drive', async () => {
    onboard();
    mockUnsynced.push(finalizedDrive('d1'), finalizedDrive('d2'));
    // The gate answers while d1's verify call is in flight.
    mockVerify = () => {
      haltSync();
      return { error: null };
    };

    expect(await syncFinalizedDrives()).toEqual({ uploaded: 1, failed: 0 });
    expect(mockSynced.has('d2')).toBe(false);
    expect(of('drives', 'upsert').map((c) => (c.payload as { id: string }).id)).toEqual(['d1']);
  });
});

describe('verifyFailureIsTransient', () => {
  test.each([
    [{ message: 'offline' }, true],
    [{ context: new Error('fetch failed') }, true],
    [{ context: { status: 500 } }, true],
    [{ context: { status: 503 } }, true],
    [{ context: { status: 429 } }, true],
    [{ context: { status: 408 } }, true],
    // Refusals of the caller: about the session, not the drive.
    [{ context: { status: 401 } }, true],
    [{ context: { status: 403 } }, true],
    [{ context: { status: 400 } }, false],
    [{ context: { status: 404 } }, false],
  ])('%j → %s', (error, expected) => {
    expect(verifyFailureIsTransient(error)).toBe(expected);
  });
});

describe('isUsernameAvailable', () => {
  test('free when nobody holds it', async () => {
    mockRespond = () => ({ error: null, data: [] });
    expect(await isUsernameAvailable('toby')).toBe(true);
    expect(of('profiles', 'select')[0].filters).toEqual([['username', 'toby']]);
  });

  test('free when the holder is this user', async () => {
    mockRespond = () => ({ error: null, data: [{ id: 'user-1' }] });
    expect(await isUsernameAvailable('toby')).toBe(true);
  });

  test('taken when someone else holds it', async () => {
    mockRespond = () => ({ error: null, data: [{ id: 'someone-else' }] });
    expect(await isUsernameAvailable('toby')).toBe(false);
  });

  test('unknown when the check cannot run', async () => {
    mockRespond = () => ({ error: { message: 'Network request failed' }, data: null });
    expect(await isUsernameAvailable('toby')).toBeNull();
  });
});
