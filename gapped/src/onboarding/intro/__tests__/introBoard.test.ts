/**
 * The carousel's "Top speed" card: the real board's top three when the server
 * has three people on it, the labelled sample otherwise. docs/ONBOARDING.md
 * rule 1: no invented numbers.
 */

import type { BoardResult } from '@/board/boards';
import type { BoardRow } from '@/board/types';
import { msToMph } from '@/drive/units';
import { mps, raw } from '@/types/units';
import {
  boardAttempts,
  GLOBAL_LABEL,
  INTRO_BOARD_SIZE,
  ordinal,
  realBoardRows,
  sampleIntroBoard,
  settleWithin,
} from '../introBoard';

function row(
  rank: number,
  over: Partial<Omit<BoardRow, 'metric' | 'value'>> & { ms?: number } = {},
): BoardRow {
  const { ms = 40 - rank, ...rest } = over;
  return {
    id: `r${rank}`,
    rank,
    username: `driver${rank}`,
    country: 'GB',
    vehicle: null,
    verification: 'verified',
    kind: 'user',
    metric: 'top_speed',
    value: mps(ms),
    ...rest,
  };
}

function server(rows: BoardRow[], over: Partial<BoardResult> = {}): BoardResult {
  return { rows, isSample: false, framing: [], source: 'server', ...over };
}

describe('sample card', () => {
  const board = sampleIntroBoard();

  test('three rows, every one marked sample, under "Global"', () => {
    expect(board.sample).toBe(true);
    expect(board.scopeLabel).toBe(GLOBAL_LABEL);
    expect(board.rows).toHaveLength(INTRO_BOARD_SIZE);
    expect(board.rows.every((r) => r.sample)).toBe(true);
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  test("the Board tab's own sample: same names, cars and road speeds", () => {
    expect(board.rows.map((r) => r.name)).toEqual([
      'sample_driver_1',
      'sample_driver_2',
      'sample_driver_3',
    ]);
    expect(board.rows.map((r) => r.detail)).toEqual(['BMW M240i', 'Golf GTI', 'MX-5 ND']);
    expect(board.rows.map((r) => Math.round(msToMph(r.speed)))).toEqual([82, 76, 71]);
  });

  test('names that say what they are, never passable as people', () => {
    for (const r of board.rows) expect(r.name).toMatch(/^sample_/);
  });
});

describe('real rows', () => {
  test('the top three people from a server board, in order', () => {
    const rows = realBoardRows(server([row(1), row(2), row(3), row(4)]));
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.name)).toEqual(['driver1', 'driver2', 'driver3']);
    expect(rows!.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows!.every((r) => !r.sample)).toBe(true);
    expect(rows![0].detail).toBe('GB');
    expect(raw(rows![0].speed)).toBe(39);
  });

  test('your own row counts as a row', () => {
    const rows = realBoardRows(server([row(1), row(2, { kind: 'you' }), row(3)]));
    expect(rows).toHaveLength(3);
  });

  test('fewer than three people is not a podium: null, so the sample shows', () => {
    expect(realBoardRows(server([]))).toBeNull();
    expect(realBoardRows(server([row(1), row(2)]))).toBeNull();
  });

  test('benchmarks and samples are not people and do not make up the three', () => {
    const rows = server([
      row(1),
      row(2, { kind: 'benchmark' }),
      row(3, { kind: 'sample' }),
      row(4),
    ]);
    expect(realBoardRows(rows)).toBeNull();
  });

  test('ranks are renumbered after skipping a non-person', () => {
    const rows = realBoardRows(
      server([row(1, { kind: 'benchmark' }), row(2), row(3), row(4)]),
    );
    expect(rows!.map((r) => [r.rank, r.name])).toEqual([
      [1, 'driver2'],
      [2, 'driver3'],
      [3, 'driver4'],
    ]);
  });

  test('a zero or broken speed is not shown', () => {
    expect(realBoardRows(server([row(1), row(2, { ms: 0 }), row(3)]))).toBeNull();
    expect(realBoardRows(server([row(1), row(2, { ms: NaN }), row(3)]))).toBeNull();
  });

  test('only a server answer counts: local history and samples do not', () => {
    const three = [row(1), row(2), row(3)];
    expect(realBoardRows(server(three, { source: 'local' }))).toBeNull();
    expect(realBoardRows(server(three, { isSample: true }))).toBeNull();
    expect(realBoardRows(null)).toBeNull();
    expect(realBoardRows(undefined)).toBeNull();
  });

  test('a board of another metric is not a top-speed card', () => {
    const distance = [1, 2, 3].map(
      (rank) =>
        ({
          ...row(rank),
          metric: 'distance',
          value: 1000 * rank,
        }) as unknown as BoardRow,
    );
    expect(realBoardRows(server(distance))).toBeNull();
  });
});

describe('which boards to ask for', () => {
  test('no country: the global board only', () => {
    expect(boardAttempts(null)).toEqual([{ scope: 'global', label: GLOBAL_LABEL }]);
  });

  test('with a country: theirs first, then the world', () => {
    expect(boardAttempts('IT')).toEqual([
      { scope: 'country', label: 'IT' },
      { scope: 'global', label: GLOBAL_LABEL },
    ]);
  });
});

describe('settleWithin: the wait on the server', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('an answer in time is the answer, and its wait is cleared', async () => {
    const answer = settleWithin(Promise.resolve('board'), 4000);
    await expect(answer).resolves.toBe('board');
    expect(jest.getTimerCount()).toBe(0);
  });

  test('an error is null, never a rejection, and leaves no timer', async () => {
    const answer = settleWithin(Promise.reject(new Error('offline')), 4000);
    await expect(answer).resolves.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('no answer by the deadline is null', async () => {
    const never = new Promise<string>(() => undefined);
    const answer = settleWithin(never, 4000);
    jest.advanceTimersByTime(3999);
    let settled = false;
    void answer.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(answer).resolves.toBeNull();
  });

  test('a late answer after the deadline does not change it', async () => {
    let resolveLate!: (v: string) => void;
    const late = new Promise<string>((r) => {
      resolveLate = r;
    });
    const answer = settleWithin(late, 100);
    jest.advanceTimersByTime(100);
    resolveLate('board');
    await expect(answer).resolves.toBeNull();
  });

  test('a spent or broken budget answers null at once, without waiting', async () => {
    for (const ms of [0, -50, NaN]) {
      await expect(settleWithin(Promise.resolve('board'), ms)).resolves.toBeNull();
    }
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('ordinal', () => {
  test.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [101, '101st'],
    [111, '111th'],
  ])('%i → %s', (n, s) => {
    expect(ordinal(n)).toBe(s);
  });
});
