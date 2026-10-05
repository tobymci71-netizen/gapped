import { metres } from '@/types/units';
import {
  answeredAfter,
  hideHere,
  isModeratable,
  settleHidden,
  withoutHidden,
} from '../hiddenRows';
import type { BoardRow } from '../types';

function row(over: Partial<BoardRow> & { id: string }): BoardRow {
  return {
    rank: 0,
    username: over.id,
    country: 'GB',
    vehicle: null,
    verification: 'verified',
    kind: 'user',
    metric: 'distance',
    value: metres(1000),
    ...over,
  } as BoardRow;
}

describe('isModeratable', () => {
  test("another real driver's row can be reported or hidden", () => {
    expect(isModeratable(row({ id: 'a', profileId: 'p-a' }))).toBe(true);
  });

  test('your own row, SAMPLE and BENCHMARK rows cannot', () => {
    expect(isModeratable(row({ id: 'you', kind: 'you', profileId: 'me' }))).toBe(false);
    expect(isModeratable(row({ id: 'sample-0', kind: 'sample' }))).toBe(false);
    expect(isModeratable(row({ id: 'bench', kind: 'benchmark' }))).toBe(false);
  });

  test('a row with no account behind it cannot: there is nobody to name', () => {
    expect(isModeratable(row({ id: 'a' }))).toBe(false);
    expect(isModeratable(row({ id: 'a', profileId: null }))).toBe(false);
    expect(isModeratable(row({ id: 'a', profileId: '' }))).toBe(false);
  });
});

describe('withoutHidden', () => {
  const board = [
    row({ id: 'e1', rank: 1, profileId: 'p1' }),
    row({ id: 'e2', rank: 2, profileId: 'p2' }),
    row({ id: 'you', rank: 3, kind: 'you', profileId: 'me' }),
    row({ id: 'e4', rank: 4, profileId: 'p4' }),
  ];

  test('takes the hidden driver off and ranks the rest from 1, as the server will', () => {
    const shown = withoutHidden(board, new Set(['p2']));
    expect(shown.map((r) => [r.id, r.rank])).toEqual([
      ['e1', 1],
      ['you', 2],
      ['e4', 3],
    ]);
  });

  test('rows above the gap keep their identity, so they do not re-render', () => {
    const shown = withoutHidden(board, new Set(['p2']));
    expect(shown[0]).toBe(board[0]);
  });

  test('nobody hidden here returns the same array', () => {
    expect(withoutHidden(board, new Set())).toBe(board);
    expect(withoutHidden(board, new Set(['someone-else']))).toBe(board);
  });

  test('never takes off your own row, whatever the set holds', () => {
    expect(withoutHidden(board, new Set(['me']))).toBe(board);
  });

  test('accepts the screen\'s map of hides as well as a set', () => {
    expect(withoutHidden(board, new Map([['p1', 0]])).map((r) => r.id)).toEqual(['e2', 'you', 'e4']);
  });
});

describe('a hide is a bridge to the server\'s next answer', () => {
  test('kept until a request started after the hide has answered', () => {
    const hidden = hideHere(new Map(), 'p2', 7);
    // Request 7 may have left before the hide reached the server.
    expect(settleHidden(hidden, 7)).toBe(hidden);
    // Request 8 started after it: the server leaves p2 off by itself now.
    expect(settleHidden(hidden, 8).size).toBe(0);
  });

  test('so an Unhide elsewhere shows again on the next board, not never', () => {
    let hidden = hideHere(new Map(), 'p2', 3);
    hidden = settleHidden(hidden, 4);
    expect(withoutHidden([row({ id: 'e2', rank: 1, profileId: 'p2' })], hidden)).toHaveLength(1);
  });

  test('only the entries old enough are dropped', () => {
    const hidden = hideHere(hideHere(new Map(), 'p1', 2), 'p2', 5);
    expect([...settleHidden(hidden, 4).keys()]).toEqual(['p2']);
  });
});

describe('answeredAfter', () => {
  test('a server answer counts even when its board is unchanged', () => {
    // Hide p2 while request 5 is the newest, unhide in Settings, come back:
    // request 6's board is the board from before the hide, row for row, and
    // the screen keeps that result object as it was. The answer still counts,
    // or p2 stayed hidden here although the server shows them again.
    const hidden = hideHere(new Map(), 'p2', 5);
    const answered = answeredAfter(5, 6, 'server');
    expect(answered).toBe(6);
    const before = [
      row({ id: 'e1', rank: 1, profileId: 'p1' }),
      row({ id: 'e2', rank: 2, profileId: 'p2' }),
    ];
    expect(withoutHidden(before, settleHidden(hidden, answered))).toBe(before);
  });

  test('a local answer never counts: the server was not asked', () => {
    expect(answeredAfter(5, 6, 'local')).toBe(5);
  });

  test('never goes backwards', () => {
    expect(answeredAfter(8, 6, 'server')).toBe(8);
  });
});
