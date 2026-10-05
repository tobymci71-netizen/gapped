import { fetchBoard, fetchBrackets } from '../boards';
import { BoardQuery } from '../types';

const mockRpc = jest.fn();
/** The signed-in account; null is a backend with no session yet. */
let mockUserId: string | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  ensureUserId: () => Promise.resolve(mockUserId),
}));

// The local fallback reads the WAL; with no drives it is the SAMPLE board.
jest.mock('@/drive/wal', () => ({ listDrives: () => [] }));

function query(over: Partial<BoardQuery> = {}): BoardQuery {
  return { metric: 'top_speed', scope: 'global', period: 'week', verifiedOnly: true, ...over };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockUserId = null;
});

describe('fetchBoard: an empty answer is still the server answering', () => {
  // These were 'local' before, which disabled the scope pill and VERIFIED
  // toggle — the controls needed to leave the empty slice.
  test.each([
    ['friends', query({ scope: 'friends' })],
    ['verified-only world', query()],
    ['country', query({ scope: 'country' })],
    ['class', query({ bracket: 'awd|stock|open' })],
  ])('%s board with no rows stays a server board', async (_, q) => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const r = await fetchBoard(q, 'me', 'GB');
    expect(r.source).toBe('server');
    expect(r.rows).toEqual([]);
    expect(r.isSample).toBe(false);
    expect(r.framing.length).toBeGreaterThan(0);
  });

  test('a country board with no country is an empty server board, not a local one', async () => {
    const r = await fetchBoard(query({ scope: 'country' }), 'me', null);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(r.source).toBe('server');
    expect(r.rows).toEqual([]);
    expect(r.framing.join(' ')).toMatch(/no country/);
  });

  test('only an unreachable server falls back to the local board', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'FetchError: offline' } });
    const r = await fetchBoard(query({ scope: 'friends' }), 'me', 'GB');
    expect(r.source).toBe('local');
  });

  test('rows come back as a server board with your own row marked', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: 'e1', username: 'me', country: 'GB', value: 30, verification: 'verified', bracket_key: null },
        { id: 'e2', username: 'them', country: 'GB', value: 25, verification: 'unverified', bracket_key: null },
      ],
      error: null,
    });
    const r = await fetchBoard(query({ verifiedOnly: false }), 'me', 'GB');
    expect(r.source).toBe('server');
    expect(r.rows.map((x) => [x.rank, x.kind, x.verification])).toEqual([
      [1, 'you', 'verified'],
      [2, 'user', 'unverified'],
    ]);
  });
});

describe('fetchBrackets counts the slice the board shows', () => {
  test('passes the window, scope, country and verification through', async () => {
    mockRpc.mockResolvedValue({ data: [{ bracket_key: 'awd|stock|open', entries: '3' }], error: null });
    const b = await fetchBrackets(
      { metric: 'top_speed', scope: 'country', period: 'day', verifiedOnly: true },
      'GB',
    );
    expect(mockRpc).toHaveBeenCalledWith('board_brackets', {
      p_metric: 'top_speed',
      p_period: 'day',
      p_scope: 'country',
      p_country: 'GB',
      p_verified_only: true,
    });
    expect(b).toEqual([{ key: 'awd|stock|open', drivers: 3 }]);
  });

  test('a country slice with no country has no classes, and asks nothing', async () => {
    const b = await fetchBrackets(
      { metric: 'top_speed', scope: 'country', period: 'week', verifiedOnly: true },
      null,
    );
    expect(b).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('an error is null — "could not ask" — not an empty list', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'FetchError: offline' } });
    const b = await fetchBrackets(
      { metric: 'top_speed', scope: 'global', period: 'week', verifiedOnly: true },
      null,
    );
    expect(b).toBeNull();
  });
});

describe('fetchBoard: your rows are yours by account, not by name', () => {
  test('another driver holding your local username is not marked as you', async () => {
    mockUserId = 'me-id';
    mockRpc.mockResolvedValue({
      data: [
        { id: 'e1', profile_id: 'other-id', username: 'me', country: 'GB', value: 31, verification: 'verified', bracket_key: null },
        { id: 'e2', profile_id: 'me-id', username: null, country: 'GB', value: 30, verification: 'verified', bracket_key: null },
      ],
      error: null,
    });
    const r = await fetchBoard(query(), 'me', 'GB');
    expect(r.rows.map((row) => row.kind)).toEqual(['user', 'you']);
  });
});

describe('fetchBoard: every server row names its account', () => {
  test('profileId comes from profile_id, so a report or a hide can name the driver', async () => {
    mockUserId = 'me-id';
    mockRpc.mockResolvedValue({
      data: [
        { id: 'e1', profile_id: 'other-id', username: 'them', country: 'GB', value: 31, verification: 'verified', bracket_key: null },
        { id: 'e2', profile_id: 'me-id', username: 'me', country: 'GB', value: 30, verification: 'verified', bracket_key: null },
        { id: 'e3', username: 'old', country: 'GB', value: 29, verification: 'verified', bracket_key: null },
      ],
      error: null,
    });
    const r = await fetchBoard(query(), 'me', 'GB');
    expect(r.rows.map((row) => [row.kind, row.profileId])).toEqual([
      ['user', 'other-id'],
      ['you', 'me-id'],
      ['user', null],
    ]);
  });

  test('ranks through board_top, never a direct read of leaderboard_entries', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await fetchBoard(query({ metric: 'distance' }), 'me', 'GB');
    expect(mockRpc).toHaveBeenCalledWith('board_top', expect.objectContaining({ p_metric: 'distance' }));
  });
});
