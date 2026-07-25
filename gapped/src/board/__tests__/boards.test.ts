import { buildLocalBoard } from '../boards';
import { BoardQuery } from '../types';
import type { LocalDrive } from '@/drive/wal';
import { DriveSummary } from '@/drive/types';

const drives: LocalDrive[] = [];

jest.mock('@/drive/wal', () => ({
  listDrives: () => drives,
}));

const NOW = 1_700_000_000_000;

function summary(over: Partial<DriveSummary> = {}): DriveSummary {
  return {
    startedAt: NOW - 3600_000,
    endedAt: NOW,
    distanceM: 12_000,
    durationS: 900,
    maxSpeedMs: 30,
    avgSpeedMs: 13,
    maxG: null,
    avgG: null,
    zeroTo60S: 6.2,
    fixCount: 900,
    ...over,
  };
}

function addDrive(over: Partial<DriveSummary> = {}, startedAt = NOW - 3600_000): void {
  drives.push({
    id: `d${drives.length}`,
    vehicleId: null,
    startedAt,
    endedAt: startedAt + 900_000,
    status: 'finalized',
    summary: summary(over),
  });
}

function query(over: Partial<BoardQuery> = {}): BoardQuery {
  return { metric: 'top_speed', scope: 'global', period: 'week', verifiedOnly: true, ...over };
}

beforeEach(() => {
  drives.length = 0;
});

describe('local board provenance', () => {
  test('is labelled as local so the screen can disable filters it cannot honour', () => {
    expect(buildLocalBoard(query(), 'me', NOW).source).toBe('local');
    addDrive();
    expect(buildLocalBoard(query(), 'me', NOW).source).toBe('local');
  });

  test('the local board explains why scope and verified-only are inert', () => {
    addDrive();
    const framing = buildLocalBoard(query(), 'me', NOW).framing.join(' ');
    expect(framing).toMatch(/Scope and verified-only/);
  });

  test('the sample board carries the same explanation', () => {
    const r = buildLocalBoard(query(), null, NOW);
    expect(r.isSample).toBe(true);
    expect(r.framing.join(' ')).toMatch(/Scope and verified-only/);
  });
});

describe('nothing local is presented as verified', () => {
  test('sample rows are not verified — they are not measurements at all', () => {
    const r = buildLocalBoard(query(), null, NOW);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((row) => row.verification === 'unverified')).toBe(true);
  });

  test('manufacturer 0-60 ghosts are not verified measurements', () => {
    addDrive();
    const r = buildLocalBoard(query({ metric: 'zero_to_60' }), 'me', NOW);
    const benchmarks = r.rows.filter((row) => row.kind === 'benchmark');
    expect(benchmarks.length).toBeGreaterThan(0);
    expect(benchmarks.every((row) => row.verification === 'unverified')).toBe(true);
  });

  test('your own all-time ghost is measured but not server-verified', () => {
    addDrive();
    const r = buildLocalBoard(query({ period: 'week' }), 'me', NOW);
    const rows = r.rows.filter((row) => row.kind === 'benchmark');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.verification === 'unverified')).toBe(true);
  });

  test('no row on a local board claims verification', () => {
    addDrive();
    for (const metric of ['top_speed', 'distance', 'trip_count', 'zero_to_60'] as const) {
      const r = buildLocalBoard(query({ metric }), 'me', NOW);
      expect(r.rows.some((row) => row.verification === 'verified')).toBe(false);
    }
  });
});
