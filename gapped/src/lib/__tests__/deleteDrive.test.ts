/**
 * Deleting one drive (src/drive/deleteDrive.ts), against fakes of supabase-js,
 * the WAL's SQLite and the file system.
 *
 * The rule under test is the one account deletion keeps: the server first, and
 * if it cannot be asked nothing is touched — a drive removed from the phone but
 * left on the boards is the outcome the order exists to prevent. Then the
 * records: a deleted drive's personal best and streak day must not outlive it.
 */

import { epochMs, gForce, metres, mps, seconds } from '@/types/units';
import type { DriveSummary } from '@/drive/types';
import type { LocalDrive } from '@/drive/wal';
import { useRecords } from '@/state/records';
// jest.mock calls below are hoisted above these imports by babel-jest.
import {
  deleteDrive,
  discardExportFile,
  isExportFileName,
  rebuildRecords,
  sweepExportFiles,
} from '@/drive/deleteDrive';
import { useDriveStore } from '@/drive/recorder';
import { File } from 'expo-file-system';

// ── supabase ───────────────────────────────────────────────────────────────

type Session = { user: { id: string } } | null;
let mockSession: { data: { session: Session }; error: Error | null } = {
  data: { session: { user: { id: 'user-1' } } },
  error: null,
};
let mockRpcError: Error | null = null;
const mockRpc = jest.fn(async (..._args: unknown[]) => ({ data: {}, error: mockRpcError }));
let mockHasBackend = true;

jest.mock('@/lib/supabase', () => ({
  get supabase() {
    return mockHasBackend
      ? {
          auth: { getSession: async () => mockSession },
          rpc: (...args: unknown[]) => mockRpc(...args),
        }
      : null;
  },
}));

// ── WAL ────────────────────────────────────────────────────────────────────

let mockDrives: LocalDrive[] = [];
let mockUnsyncedIds = new Set<string>();
jest.mock('@/drive/wal', () => ({
  listDrives: () => mockDrives,
  listUnsynced: () => mockDrives.filter((d) => mockUnsyncedIds.has(d.id)),
}));

type Run = { sql: string; params: unknown[] };
const mockRuns: Run[] = [];
let mockSqlFails = false;
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: (name: string) => ({
    name,
    runSync: (sql: string, params: unknown[]) => {
      if (mockSqlFails) throw new Error('disk I/O error');
      mockRuns.push({ sql, params });
      // Deleting the row is what the real database does; the fake WAL follows.
      if (sql.startsWith('DELETE FROM local_drives')) {
        mockDrives = mockDrives.filter((d) => d.id !== params[0]);
      }
    },
    withTransactionSync: (fn: () => void) => fn(),
  }),
}));

// ── recorder (only the store's shape; the real one arms GPS) ───────────────

jest.mock('@/drive/recorder', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot import
  const { create } = require('zustand');
  return {
    useDriveStore: create(() => ({ driveId: null, lastSummary: null, recovered: [] })),
  };
});

// ── file system ────────────────────────────────────────────────────────────

let mockCacheEntries: unknown[] = [];
jest.mock('expo-file-system', () => {
  class File {
    name: string;
    exists = true;
    delete = jest.fn(() => {
      this.exists = false;
    });
    constructor(fileName: string) {
      this.name = fileName;
    }
  }
  class Directory {}
  return {
    File,
    Directory,
    Paths: {
      get cache() {
        return { list: () => mockCacheEntries };
      },
    },
  };
});

// ── fixtures ───────────────────────────────────────────────────────────────

function summary(startedAt: number, topSpeed: number, distanceM: number): DriveSummary {
  return {
    startedAt: epochMs(startedAt),
    endedAt: epochMs(startedAt + 600_000),
    distanceM: metres(distanceM),
    durationS: seconds(600),
    maxSpeedMs: mps(topSpeed),
    avgSpeedMs: mps(15),
    maxG: gForce(0.3),
    avgG: gForce(0.1),
    zeroTo60S: null,
    fixCount: 600,
  };
}

function drive(id: string, startedAt: number, topSpeed: number, distanceM = 10_000): LocalDrive {
  return {
    id,
    vehicleId: null,
    startedAt,
    endedAt: startedAt + 600_000,
    status: 'finalized',
    summary: summary(startedAt, topSpeed, distanceM),
  };
}

const DAY = 86_400_000;
const T0 = new Date(2026, 8, 1, 12).getTime();

beforeEach(() => {
  mockHasBackend = true;
  mockSession = { data: { session: { user: { id: 'user-1' } } }, error: null };
  mockRpcError = null;
  mockRpc.mockClear();
  mockRuns.length = 0;
  mockSqlFails = false;
  mockDrives = [drive('old', T0, 30), drive('fast', T0 + DAY, 45, 20_000)];
  mockUnsyncedIds = new Set();
  mockCacheEntries = [];
  useDriveStore.setState({ driveId: null, lastSummary: null, recovered: [] });
  useRecords.getState().reset();
  for (const d of [...mockDrives]) useRecords.getState().recordDrive(d.summary!);
});

const deletedLocally = (id: string) =>
  mockRuns.some((r) => r.sql.startsWith('DELETE FROM local_drives') && r.params[0] === id);

describe('deleteDrive', () => {
  test('an uploaded drive goes from the server, then the phone, and the records follow', async () => {
    expect(useRecords.getState().pbs.topSpeedMs).toBe(45);

    await expect(deleteDrive('fast')).resolves.toBe('deleted');

    expect(mockRpc).toHaveBeenCalledWith('delete_drives_and_reconcile', {
      p_drive_ids: ['fast'],
      p_dry_run: false,
    });
    expect(mockRuns.map((r) => r.sql)).toEqual([
      'DELETE FROM wal_fixes WHERE drive_id = ?',
      'DELETE FROM local_drives WHERE id = ?',
    ]);
    expect(mockRuns.every((r) => r.params[0] === 'fast')).toBe(true);
    // The PB and the streak day were that drive's; only the other remains.
    const { pbs, driveDays } = useRecords.getState();
    expect(pbs.topSpeedMs).toBe(30);
    expect(pbs.longestDriveM).toBe(10_000);
    expect(driveDays).toHaveLength(1);
  });

  test('refused while a drive is recording: nothing is asked or removed', async () => {
    useDriveStore.setState({ driveId: 'live' });
    await expect(deleteDrive('fast')).resolves.toBe('recording');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRuns).toHaveLength(0);
  });

  test('offline (a stored session that cannot refresh): nothing is touched', async () => {
    mockSession = { data: { session: null }, error: new Error('fetch failed') };
    await expect(deleteDrive('fast')).resolves.toBe('unreachable');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRuns).toHaveLength(0);
    expect(useRecords.getState().pbs.topSpeedMs).toBe(45);
  });

  test('the server refusing is the same: the phone keeps the drive', async () => {
    mockRpcError = new Error('500');
    await expect(deleteDrive('fast')).resolves.toBe('unreachable');
    expect(deletedLocally('fast')).toBe(false);
  });

  test('a thrown request (timeout) is the same', async () => {
    mockRpc.mockImplementationOnce(async () => {
      throw new Error('aborted');
    });
    await expect(deleteDrive('fast')).resolves.toBe('unreachable');
    expect(deletedLocally('fast')).toBe(false);
  });

  test('a drive not yet uploaded is still asked about, since an upload can stop half way', async () => {
    mockUnsyncedIds.add('fast');
    await expect(deleteDrive('fast')).resolves.toBe('deleted');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(deletedLocally('fast')).toBe(true);
  });

  test('no session at all: an unuploaded drive is removed locally', async () => {
    mockSession = { data: { session: null }, error: null };
    mockUnsyncedIds.add('fast');
    await expect(deleteDrive('fast')).resolves.toBe('deleted');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(deletedLocally('fast')).toBe(true);
  });

  test('no session, but the drive was uploaded: refused rather than half-deleted', async () => {
    mockSession = { data: { session: null }, error: null };
    await expect(deleteDrive('fast')).resolves.toBe('signedOut');
    expect(mockRuns).toHaveLength(0);
  });

  test('no backend configured: the phone is the only copy', async () => {
    mockHasBackend = false;
    await expect(deleteDrive('fast')).resolves.toBe('deleted');
    expect(deletedLocally('fast')).toBe(true);
  });

  test('server done but SQLite failing reports exactly that', async () => {
    mockSqlFails = true;
    await expect(deleteDrive('fast')).resolves.toBe('localFailed');
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  test("the recorder forgets the drive if it was the last one, which refreshes the tabs", async () => {
    const last = mockDrives.find((d) => d.id === 'fast')!;
    useDriveStore.setState({ lastSummary: { ...last.summary! }, recovered: [last] });
    await deleteDrive('fast');
    expect(useDriveStore.getState().lastSummary).toBeNull();
    expect(useDriveStore.getState().recovered).toEqual([]);
  });

  test('and leaves it alone when the last drive was a different one', async () => {
    const other = mockDrives.find((d) => d.id === 'old')!;
    useDriveStore.setState({ lastSummary: other.summary });
    await deleteDrive('fast');
    expect(useDriveStore.getState().lastSummary).toBe(other.summary);
  });
});

describe('rebuildRecords', () => {
  test('replays only finalized drives, oldest first', () => {
    const recording: LocalDrive = { ...drive('live', T0 + 2 * DAY, 99), status: 'recording' };
    rebuildRecords([drive('b', T0 + DAY, 40), recording, drive('a', T0, 35)]);
    const { pbs, driveDays } = useRecords.getState();
    expect(pbs.topSpeedMs).toBe(40);
    expect(driveDays).toHaveLength(2);
  });

  test('nothing left means first-run records', () => {
    rebuildRecords([]);
    expect(useRecords.getState().pbs).toEqual({
      topSpeedMs: null,
      zeroTo60S: null,
      longestDriveM: null,
    });
    expect(useRecords.getState().driveDays).toEqual([]);
  });

  test('ends where recording the same drives one by one ends', () => {
    const drives = [
      drive('a', T0, 35, 5_000),
      drive('b', T0 + DAY, 40, 3_000),
      drive('c', T0 + DAY + 3_600_000, 30, 9_000),
    ];
    useRecords.getState().reset();
    for (const d of drives) useRecords.getState().recordDrive(d.summary!);
    const replayed = { pbs: useRecords.getState().pbs, driveDays: useRecords.getState().driveDays };

    rebuildRecords([...drives].reverse());
    expect({ pbs: useRecords.getState().pbs, driveDays: useRecords.getState().driveDays }).toEqual(
      replayed,
    );
  });

  test('is one store write however long the history, so it is persisted once', () => {
    const writes = jest.fn();
    const unsubscribe = useRecords.subscribe(writes);
    rebuildRecords([drive('a', T0, 35), drive('b', T0 + DAY, 40), drive('c', T0 + 2 * DAY, 38)]);
    unsubscribe();
    expect(writes).toHaveBeenCalledTimes(1);
  });
});

describe('exported files', () => {
  test('only the drive screen export names count', () => {
    expect(isExportFileName('gapped-2026-09-01_1200.gpx')).toBe(true);
    expect(isExportFileName('gapped-2026-09-01_1200.csv')).toBe(true);
    expect(isExportFileName('gapped-drives.db')).toBe(false);
    expect(isExportFileName('ReactNative-snapshot-image123.png')).toBe(false);
    expect(isExportFileName('notes.gpx')).toBe(false);
  });

  test('the sweep removes exports and leaves everything else in the cache', () => {
    const FileCtor = File as unknown as new (name: string) => File & { delete: jest.Mock };
    const gpx = new FileCtor('gapped-a.gpx');
    const csv = new FileCtor('gapped-a.csv');
    const photo = new FileCtor('ImagePicker-1.jpg');
    mockCacheEntries = [gpx, csv, photo];

    expect(sweepExportFiles()).toBe(2);
    expect(gpx.delete).toHaveBeenCalled();
    expect(csv.delete).toHaveBeenCalled();
    expect(photo.delete).not.toHaveBeenCalled();
  });

  test('discarding a file never throws', () => {
    const FileCtor = File as unknown as new (name: string) => File & { delete: jest.Mock };
    const f = new FileCtor('gapped-a.gpx');
    f.delete.mockImplementation(() => {
      throw new Error('EACCES');
    });
    expect(() => discardExportFile(f)).not.toThrow();
  });
});
