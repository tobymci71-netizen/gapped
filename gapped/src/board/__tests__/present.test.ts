import { formatDistance, formatSpeed, METERS_PER_MILE, MS_PER_MPH } from '@/drive/units';
import { count, metres, mps, seconds } from '@/types/units';
import {
  barProgress,
  boardBasis,
  boardHero,
  boardOrigin,
  DEVICE_SCOPE,
  EMPTY_ROAD,
  gapLine,
  heroAccessibilityLabel,
  heroView,
  periodWords,
  rowAccessibilityLabel,
  rowSubLine,
  rowTags,
  rowVerified,
  SAMPLE_SCOPE,
  scopeName,
  showsGap,
  valueParts,
} from '../present';
import type { BoardMetric, BoardRow } from '../types';
import { barTrackWidth } from '../ui/layout';

type Over = Partial<BoardRow> & { id: string };

function row(over: Over): BoardRow {
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

const miles = (n: number) => metres(n * METERS_PER_MILE);

/** The mock's board: m061087, jayden_r, then you on 33.8 mi. */
function distanceBoard(): BoardRow[] {
  return [
    row({ id: 'a', rank: 1, username: 'm061087', value: miles(41.2) }),
    row({ id: 'b', rank: 2, username: 'jayden_r', value: miles(38.5) }),
    row({ id: 'you', rank: 3, username: 'toby', kind: 'you', value: miles(33.8) }),
    row({ id: 'c', rank: 4, username: 'alfie.m', value: miles(29) }),
  ];
}

/** The same shape of board for any metric, with values that rank correctly. */
function boardFor(metric: BoardMetric): BoardRow[] {
  const values = {
    distance: [miles(41.2), miles(38.5), miles(33.8)],
    trip_count: [count(14), count(11), count(9)],
    top_speed: [mps(69 * MS_PER_MPH), mps(67 * MS_PER_MPH), mps(65 * MS_PER_MPH)],
    zero_to_60: [seconds(5.1), seconds(5.6), seconds(6.2)],
  }[metric];
  return [
    row({ id: 'a', rank: 1, username: 'm061087', metric, value: values[0] } as Over),
    row({ id: 'b', rank: 2, username: 'jayden_r', metric, value: values[1] } as Over),
    row({ id: 'you', rank: 3, username: 'toby', kind: 'you', metric, value: values[2] } as Over),
  ];
}

describe('valueParts', () => {
  test('distance and speed read exactly as formatDistance and formatSpeed do', () => {
    for (const pref of ['imperial', 'metric'] as const) {
      const d = row({ id: 'd', value: metres(54_321) });
      const dp = valueParts(d, pref);
      expect(`${dp.figure} ${dp.unit}`).toBe(formatDistance(metres(54_321), pref));
      const s = row({ id: 's', metric: 'top_speed', value: mps(29.4) } as Over);
      const sp = valueParts(s, pref);
      expect(`${sp.figure} ${sp.unit}`).toBe(formatSpeed(mps(29.4), pref));
    }
  });

  test('units are spoken in words', () => {
    expect(valueParts(row({ id: 'd', value: miles(33.8) }), 'imperial').spoken).toBe(
      '33.8 miles',
    );
    expect(valueParts(row({ id: 'd', value: metres(12_000) }), 'metric').spoken).toBe(
      '12.0 kilometres',
    );
    expect(
      valueParts(row({ id: 's', metric: 'top_speed', value: mps(65 * MS_PER_MPH) } as Over), 'imperial')
        .spoken,
    ).toBe('65 miles per hour');
    expect(
      valueParts(row({ id: 'z', metric: 'zero_to_60', value: seconds(4.123) } as Over), 'metric'),
    ).toEqual({ figure: '4.12', unit: 's', spoken: '4.12 seconds' });
  });

  test('a count names drives, singular for one', () => {
    expect(
      valueParts(row({ id: 'n', metric: 'trip_count', value: count(1) } as Over), 'metric'),
    ).toEqual({ figure: '1', unit: 'drive', spoken: '1 drive' });
    expect(
      valueParts(row({ id: 'n', metric: 'trip_count', value: count(12) } as Over), 'metric').unit,
    ).toBe('drives');
  });
});

describe('the words around a board', () => {
  test('Distance says it ranks the longest single drive', () => {
    expect(boardBasis('distance')).toBe('longest drive');
    expect(boardBasis('trip_count')).toBe('drives recorded');
  });

  test("a board names who it ranks; this device's drives are never the World board", () => {
    expect(boardOrigin({ source: 'server', isSample: false })).toBe('server');
    expect(boardOrigin({ source: 'local', isSample: false })).toBe('device');
    expect(boardOrigin({ source: 'local', isSample: true })).toBe('sample');
    expect(scopeName('global', 'United Kingdom', 'server')).toBe('World');
    expect(scopeName('country', 'United Kingdom', 'server')).toBe('United Kingdom');
    expect(scopeName('country', null, 'server')).toBe('Country');
    expect(scopeName('friends', null, 'server')).toBe('Friends');
    // Nothing landed yet: the scope as chosen.
    expect(scopeName('global', null, null)).toBe('World');
    // The segment still reads World on a local board, inert; the caption must not.
    expect(scopeName('global', 'United Kingdom', 'device')).toBe(DEVICE_SCOPE);
    expect(scopeName('global', null, 'sample')).toBe(SAMPLE_SCOPE);
  });

  test('periods read as rolling windows', () => {
    expect(periodWords('day')).toBe('last 24 hours');
    expect(periodWords('week')).toBe('last 7 days');
    expect(periodWords('month')).toBe('last 30 days');
    expect(periodWords('all')).toBe('all-time');
  });
});

describe('gap to the driver ahead', () => {
  test('the mock: 4.7 mi behind jayden_r', () => {
    const rows = distanceBoard();
    const you = rows[2];
    expect(gapLine(rows, you, 'imperial')).toEqual({
      text: '4.7 mi behind jayden_r',
      spoken: '4.7 miles behind jayden_r',
    });
  });

  test('drives count the gap in drives', () => {
    const rows = boardFor('trip_count');
    expect(gapLine(rows, rows[2], 'metric')?.text).toBe('2 drives behind jayden_r');
  });

  // The safety rule. A gap on a speed board frames another driver's number as
  // something to close in on, on a public road.
  test.each(['top_speed', 'zero_to_60'] as const)('never on the %s board', (metric) => {
    const rows = boardFor(metric);
    expect(showsGap(metric)).toBe(false);
    expect(gapLine(rows, rows[2], 'imperial')).toBeNull();
    expect(gapLine(rows, rows[1], 'metric')).toBeNull();
    const hero = boardHero(rows);
    expect(hero).not.toBeNull();
    const spoken = heroAccessibilityLabel(
      hero!,
      { scopeName: 'World', metric, period: 'week' },
      gapLine(rows, rows[2], 'imperial'),
      'imperial',
    );
    expect(spoken).not.toMatch(/behind|ahead|level/i);
  });

  test('none at P1', () => {
    const rows = distanceBoard();
    expect(gapLine(rows, rows[0], 'imperial')).toBeNull();
  });

  test('none behind a BENCHMARK ghost: it is nobody', () => {
    const rows = [
      row({ id: 'bench', rank: 1, username: 'Your all-time best', kind: 'benchmark', value: miles(50) }),
      row({ id: 'you', rank: 2, username: '@me', kind: 'you', value: miles(20) }),
    ];
    expect(gapLine(rows, rows[1], 'imperial')).toBeNull();
  });

  test('a tie reads as level, not "0.0 mi behind"', () => {
    const rows = [
      row({ id: 'a', rank: 1, username: 'sam', value: miles(20.01) }),
      row({ id: 'you', rank: 2, username: 'me', kind: 'you', value: miles(20) }),
    ];
    expect(gapLine(rows, rows[1], 'imperial')?.text).toBe('Level with sam');
  });
});

describe('boardHero', () => {
  test('finds you, the row ahead and the leader', () => {
    const hero = boardHero(distanceBoard());
    expect(hero?.you.id).toBe('you');
    expect(hero?.ahead?.id).toBe('b');
    expect(hero?.leader?.id).toBe('a');
  });

  test('at P2 the leader is the row ahead, not a second car', () => {
    const rows = distanceBoard().slice(1).map((r, i) => ({ ...r, rank: i + 1 }));
    const hero = boardHero(rows.slice(0, 2));
    expect(hero?.ahead?.username).toBe('jayden_r');
    expect(hero?.leader).toBeNull();
  });

  test('null when you are not on the board', () => {
    expect(boardHero(distanceBoard().filter((r) => r.kind !== 'you'))).toBeNull();
    expect(boardHero([])).toBeNull();
  });

  test('VoiceOver hears the whole hero as one sentence', () => {
    const rows = distanceBoard();
    const hero = boardHero(rows)!;
    expect(
      heroAccessibilityLabel(
        hero,
        { scopeName: 'World', metric: 'distance', period: 'week' },
        gapLine(rows, hero.you, 'imperial'),
        'imperial',
      ),
    ).toBe(
      "You're P3 on the World board for longest drive: 33.8 miles, last 7 days. 4.7 miles behind jayden_r.",
    );
  });

  test("on this device's drives the sentence does not claim a World place", () => {
    const rows = [
      row({ id: 'bench', rank: 1, username: 'Your all-time best', kind: 'benchmark', value: miles(50) }),
      row({ id: 'you', rank: 2, username: '@me', kind: 'you', value: miles(20) }),
    ];
    const label = heroAccessibilityLabel(
      boardHero(rows)!,
      { scopeName: DEVICE_SCOPE, metric: 'distance', period: 'week' },
      null,
      'imperial',
    );
    expect(label).toBe(
      "You're P2 on this device's board for longest drive: 20.0 miles, last 7 days.",
    );
    expect(label).not.toMatch(/World/);
  });
});

describe('barProgress', () => {
  test('the best reaches the edge and the rest are shares of it', () => {
    const p = barProgress(distanceBoard());
    expect(p.get('a')).toBe(1);
    expect(p.get('b')).toBeCloseTo(38.5 / 41.2, 6);
    expect(p.get('c')).toBeCloseTo(29 / 41.2, 6);
  });

  test('on 0–60 the quickest time is the longest bar', () => {
    const p = barProgress(boardFor('zero_to_60'));
    expect(p.get('a')).toBe(1);
    expect(p.get('b')!).toBeLessThan(1);
    expect(p.get('you')!).toBeLessThan(p.get('b')!);
  });

  test("the track is the mock's: 272pt on a 390pt phone with the '⋯' column", () => {
    expect(barTrackWidth(390, true, false)).toBe(272);
    // No menu column: the bar runs on to the row's right inset.
    expect(barTrackWidth(390, false, false)).toBe(312);
  });

  test('an empty or all-zero board draws no bars', () => {
    expect(barProgress([]).size).toBe(0);
    const p = barProgress([row({ id: 'z', value: metres(0) })]);
    expect(p.get('z')).toBe(0);
  });
});

describe('row labels', () => {
  test('verified rows carry a tick, unverified people a tag, ghosts their own label', () => {
    expect(rowVerified(row({ id: 'a' }))).toBe(true);
    expect(rowTags(row({ id: 'a' }))).toEqual([]);
    expect(rowTags(row({ id: 'a', verification: 'unverified' }))).toEqual(['unverified']);
    expect(rowTags(row({ id: 'y', kind: 'you' }))).toEqual(['you']);
    // SAMPLE and BENCHMARK rows are never people: never "unverified", never ticked.
    const sample = row({ id: 's', kind: 'sample', verification: 'unverified' });
    expect(rowTags(sample)).toEqual(['sample']);
    expect(rowVerified(sample)).toBe(false);
    expect(rowTags(row({ id: 'b', kind: 'benchmark', verification: 'unverified' }))).toEqual([
      'benchmark',
    ]);
  });

  test('a row is one sentence to VoiceOver', () => {
    expect(
      rowAccessibilityLabel(
        row({ id: 'y', rank: 3, username: 'toby', kind: 'you', value: miles(33.8) }),
        'imperial',
      ),
    ).toBe('3, toby, you, verified, 33.8 miles');
    expect(
      rowAccessibilityLabel(
        row({ id: 's', rank: 1, username: 'sample_driver_1', kind: 'sample', verification: 'unverified' }),
        'metric',
      ),
    ).toBe('1, sample_driver_1, sample, 1.0 kilometres');
  });

  test("the sub line is said too: a benchmark's provenance, a sample's vehicle", () => {
    const bench = row({
      id: 'b',
      rank: 1,
      username: 'Porsche 911 Turbo S',
      kind: 'benchmark',
      verification: 'unverified',
      metric: 'zero_to_60',
      value: seconds(2.7),
      note: 'manufacturer figure',
    } as Over);
    expect(rowSubLine(bench)).toBe('manufacturer figure');
    expect(rowAccessibilityLabel(bench, 'imperial')).toBe(
      '1, Porsche 911 Turbo S, benchmark, 2.70 seconds, manufacturer figure',
    );
    const sample = row({
      id: 's',
      kind: 'sample',
      verification: 'unverified',
      vehicle: 'Mazda MX-5',
      note: 'SAMPLE — replaced by real drivers after your first drive',
    });
    expect(rowSubLine(sample)).toBe('Mazda MX-5');
    expect(rowSubLine(row({ id: 'n' }))).toBeNull();
  });
});

describe('heroView', () => {
  const board = (metric: BoardMetric) => ({
    metric,
    period: 'week' as const,
    scopeName: 'World',
    isSample: false,
    verifiedShown: true,
  });

  test('the mock: P3, 33.8 mi over the last 7 days, behind jayden_r, with P1 and P2 ahead', () => {
    expect(heroView(distanceBoard(), board('distance'), 'imperial')).toMatchObject({
      kind: 'placed',
      position: 3,
      value: '33.8 mi',
      period: 'last 7 days',
      gap: '4.7 mi behind jayden_r',
      scene: { leader: 'P1', ahead: 'P2', you: true },
    });
  });

  test('at P2 one car ahead, at P1 an open road', () => {
    const p2 = distanceBoard().filter((r) => r.id !== 'a').map((r, i) => ({ ...r, rank: i + 1 }));
    expect(heroView(p2, board('distance'), 'imperial')).toMatchObject({
      position: 2,
      scene: { leader: null, ahead: 'P1', you: true },
    });
    const p1 = p2.filter((r) => r.id !== 'b').map((r, i) => ({ ...r, rank: i + 1 }));
    expect(heroView(p1, board('distance'), 'imperial')).toMatchObject({
      position: 1,
      gap: null,
      scene: { leader: null, ahead: null, you: true },
    });
  });

  // The safety rule, end to end: position and value only. No gap, and no
  // tail lights ahead to close in on.
  test.each(['top_speed', 'zero_to_60'] as const)('the %s hero has no chase in it', (metric) => {
    const view = heroView(boardFor(metric), board(metric), 'imperial');
    expect(view).toMatchObject({ kind: 'placed', position: 3, gap: null, scene: EMPTY_ROAD });
    if (view?.kind !== 'placed') throw new Error('placed');
    expect(view.accessibilityLabel).not.toMatch(/behind|ahead|level/i);
  });

  test('not on the board: a calm invitation, "verified" only while the filter applies', () => {
    const others = distanceBoard().filter((r) => r.kind !== 'you');
    expect(heroView(others, board('distance'), 'imperial')).toEqual({
      kind: 'absent',
      sample: false,
      title: 'Record a verified drive to join the board',
      detail: 'World · last 7 days',
    });
    expect(
      heroView(others, { ...board('distance'), verifiedShown: false }, 'imperial'),
    ).toMatchObject({ title: 'Record a drive to join the board' });
  });

  test('the SAMPLE board says it is one', () => {
    const sample = [row({ id: 's', rank: 1, kind: 'sample', verification: 'unverified' })];
    expect(heroView(sample, { ...board('distance'), isSample: true }, 'imperial')).toMatchObject({
      kind: 'absent',
      sample: true,
      title: 'Sample board',
    });
  });

  test('an empty board has no hero: the empty state speaks', () => {
    expect(heroView([], board('distance'), 'imperial')).toBeNull();
  });
});
