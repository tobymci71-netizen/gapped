/**
 * closeDrive / recoverUnterminated decide whether an ended recording is a
 * drive. SQLite is native, so it is replaced by a small fake that answers the
 * WAL's own queries — enough to see which status each drive is written with.
 */

import { Fix } from '../types';
import { metres } from '@/types/units';
// jest.mock below is hoisted above every import, so wal.ts sees the fake.
import { closeDrive, recoverUnterminated } from '../wal';
import { cleanCruise } from './fixtures';

type Run = { sql: string; params: unknown[] };

const mockFixes: Record<string, Record<string, unknown>[]> = {};
const mockRecording: { id: string }[] = [];
const mockRuns: Run[] = [];

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => undefined,
    runSync: (sql: string, params: unknown[]) => {
      mockRuns.push({ sql, params });
    },
    getAllSync: (sql: string, params: unknown[]) => {
      if (sql.includes('FROM wal_fixes')) return mockFixes[params[0] as string] ?? [];
      if (sql.includes("status = 'recording'")) return mockRecording;
      return [];
    },
    getFirstSync: (sql: string, params: unknown[]) =>
      sql.includes('FROM local_drives WHERE id')
        ? { id: params[0], vehicle_id: null, started_at: 0, ended_at: 0, status: 'finalized', summary: null }
        : null,
  }),
}));

function store(id: string, fixes: Fix[]) {
  mockFixes[id] = fixes.map((f, seq) => ({
    seq,
    t: f.t,
    lat: f.lat,
    lon: f.lon,
    speed_ms: f.speedMs,
    accuracy_m: f.accuracyM,
    altitude_m: f.altitudeM ?? null,
    heading: f.heading ?? null,
    accel_x: f.accelX ?? null,
    accel_y: f.accelY ?? null,
    accel_z: f.accelZ ?? null,
    pressure_hpa: f.pressureHpa ?? null,
    is_mock: f.isMock ? 1 : 0,
  }));
}

/** The status each drive id was last written with. */
function statusOf(id: string): string | undefined {
  const write = [...mockRuns].reverse().find((r) => r.params[r.params.length - 1] === id);
  return write?.sql.match(/status = '(\w+)'/)?.[1];
}

beforeEach(() => {
  for (const k of Object.keys(mockFixes)) delete mockFixes[k];
  mockRecording.length = 0;
  mockRuns.length = 0;
});

describe('closeDrive', () => {
  test('Start then End with no fixes is discarded, not saved as a zero drive', () => {
    store('empty', []);
    expect(closeDrive('empty', 1_700_000_000_000)).toBeNull();
    expect(statusOf('empty')).toBe('discarded');
  });

  test('a single fix is not a drive', () => {
    store('one', cleanCruise().slice(0, 1));
    expect(closeDrive('one', 1_700_000_005_000)).toBeNull();
    expect(statusOf('one')).toBe('discarded');
  });

  test('fixes that all fail the accuracy gate (indoors) are not a drive either', () => {
    const indoors = cleanCruise().map((f) => ({ ...f, accuracyM: metres(60) }));
    store('indoors', indoors);
    expect(closeDrive('indoors', 1_700_000_100_000)).toBeNull();
    expect(statusOf('indoors')).toBe('discarded');
  });

  test('a real drive is finalised with its summary', () => {
    const fixes = cleanCruise();
    store('real', fixes);
    const s = closeDrive('real', 1_700_000_100_000);
    expect(s).not.toBeNull();
    expect(s!.distanceM).toBeGreaterThan(1000);
    expect(statusOf('real')).toBe('finalized');
  });
});

describe('recoverUnterminated', () => {
  test('finalises interrupted drives and discards empty ones on the same rule', () => {
    store('kept', cleanCruise());
    store('blank', []);
    mockRecording.push({ id: 'kept' }, { id: 'blank' });
    const recovered = recoverUnterminated();
    expect(recovered.map((d) => d.id)).toEqual(['kept']);
    expect(statusOf('kept')).toBe('finalized');
    expect(statusOf('blank')).toBe('discarded');
  });
});
