import { epochMs, metres, mps, MS_PER_MPH, raw, seconds } from '@/types/units';
import {
  BoardResult,
  boardSafetyLine,
  buildLocalBoard,
  emptyBoardFraming,
  periodPhrase,
  sameBrackets,
  settleBoard,
} from '../boards';
import { BoardQuery, BoardRow } from '../types';
import type { LocalDrive } from '@/drive/wal';
import { DriveSummary } from '@/drive/types';

const drives: LocalDrive[] = [];

jest.mock('@/drive/wal', () => ({
  listDrives: () => drives,
}));

const NOW = 1_700_000_000_000;

function summary(over: Partial<DriveSummary> = {}): DriveSummary {
  return {
    startedAt: epochMs(NOW - 3600_000),
    endedAt: epochMs(NOW),
    distanceM: metres(12_000),
    durationS: seconds(900),
    maxSpeedMs: mps(30),
    avgSpeedMs: mps(13),
    maxG: null,
    avgG: null,
    zeroTo60S: seconds(6.2),
    fixCount: 900,
    ...over,
  };
}

function addDrive(over: Partial<DriveSummary> = {}, startedAt = NOW - 3600_000): void {
  drives.push({
    id: `d${drives.length}`,
    vehicleId: null,
    startedAt,
    endedAt: epochMs(startedAt + 900_000),
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

describe('periods are described as the rolling windows they are', () => {
  test('a drive from 22:00 last night is in the 24-hour window, and not called "today"', () => {
    // 11 hours old at "09:00": inside the window, so it is counted — the
    // framing must not claim it was recorded today.
    addDrive({}, NOW - 11 * 3600_000);
    const framing = buildLocalBoard(query({ period: 'day' }), 'me', NOW).framing.join(' ');
    expect(framing).toMatch(/1 drive recorded on this device in the last 24 hours\./);
    expect(framing).not.toMatch(/today/);
  });

  test('week and month name their length, not a calendar unit', () => {
    addDrive();
    expect(buildLocalBoard(query({ period: 'week' }), 'me', NOW).framing[0]).toMatch(
      /in the last 7 days\.$/,
    );
    expect(buildLocalBoard(query({ period: 'month' }), 'me', NOW).framing[0]).toMatch(
      /in the last 30 days\.$/,
    );
    expect(periodPhrase('all')).toBe('all-time');
  });
});

describe('empty server boards say which slice is empty', () => {
  test('world, verified-only', () => {
    expect(emptyBoardFraming(query(), null)).toEqual([
      'Nobody has a verified run in the last 7 days.',
      'Unverified runs are hidden while VERIFIED is on.',
    ]);
  });

  test('friends includes you, because the friends board does', () => {
    expect(emptyBoardFraming(query({ scope: 'friends', verifiedOnly: false }), null)).toEqual([
      'Neither you nor anyone you follow has a run in the last 7 days.',
    ]);
  });

  test('country names the country', () => {
    expect(
      emptyBoardFraming(query({ scope: 'country', period: 'day', verifiedOnly: false }), 'GB')[0],
    ).toMatch(/^Nobody in .+ has a run in the last 24 hours\.$/);
    expect(emptyBoardFraming(query({ scope: 'country' }), 'GB')[0]).not.toMatch(/your country/);
  });

  test('an all-time class board keeps the wording the bracket board always had', () => {
    expect(emptyBoardFraming(query({ period: 'all', bracket: 'awd|stock|open' }), null)[0]).toBe(
      'Nobody has a verified run in this class yet.',
    );
  });
});

describe('settleBoard', () => {
  const row = (over: Partial<BoardRow> = {}): BoardRow =>
    ({
      id: 'e1',
      rank: 1,
      username: 'a',
      country: null,
      vehicle: null,
      metric: 'top_speed',
      value: mps(30),
      verification: 'verified',
      kind: 'user',
      ...over,
    }) as BoardRow;
  const server = (rows: BoardRow[], framing: string[] = []): BoardResult => ({
    rows,
    isSample: false,
    framing,
    source: 'server',
  });
  const local = (): BoardResult => ({ rows: [], isSample: true, framing: ['x'], source: 'local' });

  test('a new slice always shows the new answer', () => {
    const prev = server([row()]);
    const next = server([row()]);
    expect(settleBoard(prev, next, false)).toBe(next);
    expect(settleBoard(null, next, true)).toBe(next);
  });

  test('an identical refocus answer keeps the object on screen, so nothing re-renders', () => {
    const prev = server([row()]);
    expect(settleBoard(prev, server([row()]), true)).toBe(prev);
  });

  test('a changed refocus answer replaces it — a new drive or friend shows up', () => {
    const prev = server([row()]);
    const moved = server([row({ value: mps(31) })]);
    expect(settleBoard(prev, moved, true)).toBe(moved);
    const added = server([row(), row({ id: 'e2', rank: 2 })]);
    expect(settleBoard(prev, added, true)).toBe(added);
    const sampleGone = buildLocalBoard(query(), 'me', NOW);
    expect(settleBoard(local(), sampleGone, true)).toBe(sampleGone);
  });

  test('a refocus that could not reach the server keeps the server board', () => {
    const prev = server([row()]);
    expect(settleBoard(prev, local(), true)).toBe(prev);
  });

  test('but a new slice that could not reach the server says so', () => {
    const next = local();
    expect(settleBoard(server([row()]), next, false)).toBe(next);
  });
});

describe('sameBrackets', () => {
  test('compares keys and counts in order', () => {
    expect(sameBrackets([{ key: 'a', drivers: 2 }], [{ key: 'a', drivers: 2 }])).toBe(true);
    expect(sameBrackets([{ key: 'a', drivers: 2 }], [{ key: 'a', drivers: 3 }])).toBe(false);
    expect(sameBrackets([], [{ key: 'a', drivers: 1 }])).toBe(false);
  });
});

describe('the SAMPLE board before a first drive', () => {
  test('fills the Distance board too, which is the one the tab opens on', () => {
    const r = buildLocalBoard(query({ metric: 'distance' }), null, NOW);
    expect(r.isSample).toBe(true);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((row) => row.kind === 'sample' && row.metric === 'distance')).toBe(true);
    expect(r.rows.map((row) => row.rank)).toEqual(r.rows.map((_, i) => i + 1));
  });

  test('still labels every row SAMPLE and never verified', () => {
    for (const metric of ['distance', 'top_speed'] as const) {
      const r = buildLocalBoard(query({ metric }), null, NOW);
      expect(r.rows.every((row) => row.verification === 'unverified')).toBe(true);
      expect(r.rows.every((row) => row.username.startsWith('sample_driver_'))).toBe(true);
    }
  });

  test('ranks no sample top speed that the line above it says is never ranked', () => {
    // 70 mph is the UK's limit; 130 km/h is verify-drive's default ceiling.
    const r = buildLocalBoard(query({ metric: 'top_speed' }), null, NOW);
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(raw(row.value) / MS_PER_MPH).toBeLessThan(70);
      expect(raw(row.value) * 3.6).toBeLessThan(130);
    }
  });

  test('invents nothing for the metrics it has no sample of', () => {
    expect(buildLocalBoard(query({ metric: 'zero_to_60' }), null, NOW).rows).toEqual([]);
    expect(buildLocalBoard(query({ metric: 'trip_count' }), null, NOW).rows).toEqual([]);
  });
});

describe('boardSafetyLine', () => {
  test("the top-speed board says speeds over the country's ranking limit are never ranked", () => {
    expect(boardSafetyLine('top_speed')).toMatch(
      /above the ranking limit for the driver's country \(its highest speed limit, or 130 km\/h\) are never ranked/,
    );
    // The driver's country, not the reader's: a global board ranks each
    // driver against their own country's ceiling.
    expect(boardSafetyLine('top_speed')).not.toMatch(/your country/);
  });

  test('the 0–60 board says where acceleration may be timed', () => {
    expect(boardSafetyLine('zero_to_60')).toMatch(/legal and safe/);
  });

  test('distance and drives need none', () => {
    expect(boardSafetyLine('distance')).toBeNull();
    expect(boardSafetyLine('trip_count')).toBeNull();
  });
});
