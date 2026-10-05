import {
  hideDriver,
  listHidden,
  moderationFailure,
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  reportDetails,
  reportDriver,
  unhideDriver,
} from '../moderation';

type Reply = { data?: unknown; error: unknown };

/** Every call the fake client was asked to make, in order. */
const mockCalls: { kind: string; args: unknown[]; filters: [string, unknown][] }[] = [];
let mockReply: () => Reply | Promise<Reply> = () => ({ data: null, error: null });
let mockUserId: string | null = 'me-id';
let mockConfigured = true;

function mockTable(table: string) {
  const call = { kind: `${table}.?`, args: [] as unknown[], filters: [] as [string, unknown][] };
  const b = {
    insert(row: unknown) {
      call.kind = `${table}.insert`;
      call.args = [row];
      return b;
    },
    delete() {
      call.kind = `${table}.delete`;
      return b;
    },
    eq(col: string, val: unknown) {
      call.filters.push([col, val]);
      return b;
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      mockCalls.push(call);
      return Promise.resolve(mockReply()).then(resolve, reject);
    },
  };
  return b;
}

const mockClient = {
  rpc: (name: string, args?: unknown) => {
    mockCalls.push({ kind: `rpc.${name}`, args: [args], filters: [] });
    return Promise.resolve(mockReply());
  },
  from: (table: string) => mockTable(table),
};

jest.mock('@/lib/supabase', () => ({
  get supabase() {
    return mockConfigured ? mockClient : null;
  },
  ensureUserId: () => Promise.resolve(mockUserId),
}));

beforeEach(() => {
  mockCalls.length = 0;
  mockReply = () => ({ data: null, error: null });
  mockUserId = 'me-id';
  mockConfigured = true;
});

describe('reportDriver', () => {
  test('sends the driver, the reason and the details to report_driver', async () => {
    const r = await reportDriver('them-id', 'impersonation', '  Pretending to be a pro driver  ');
    expect(r).toEqual({ ok: true });
    expect(mockCalls).toEqual([
      {
        kind: 'rpc.report_driver',
        args: [
          {
            p_reported: 'them-id',
            p_reason: 'impersonation',
            p_details: 'Pretending to be a pro driver',
          },
        ],
        filters: [],
      },
    ]);
  });

  test('no details is null, not an empty string', async () => {
    await reportDriver('them-id', 'other', '   ');
    expect((mockCalls[0].args[0] as { p_details: unknown }).p_details).toBeNull();
  });

  test("details are held to the server's 500 characters", () => {
    expect(reportDetails('x'.repeat(REPORT_DETAILS_MAX + 40))).toHaveLength(REPORT_DETAILS_MAX);
    expect(reportDetails(null)).toBeNull();
  });

  test('the four reasons, in the order the sheet lists them', () => {
    expect(REPORT_REASONS).toEqual([
      { key: 'offensive_username', label: 'Offensive username' },
      { key: 'cheating', label: 'Cheating or spoofed run' },
      { key: 'impersonation', label: 'Impersonation' },
      { key: 'other', label: 'Other' },
    ]);
  });

  test('reporting yourself is refused without a request', async () => {
    const r = await reportDriver('me-id', 'other');
    expect(r).toEqual({ ok: false, reason: 'self', message: "You can't report yourself." });
    expect(mockCalls).toHaveLength(0);
  });

  test('with no session nothing is asked of a server that would refuse', async () => {
    mockUserId = null;
    const r = await reportDriver('them-id', 'cheating');
    expect(r).toMatchObject({ ok: false, reason: 'not_connected' });
    expect(mockCalls).toHaveLength(0);
  });

  test.each(['PGRST202', '42883'])(
    'a backend without the RPC (%s) says "Couldn\'t send", and does not throw',
    async (code) => {
      mockReply = () => ({ data: null, error: { code, message: 'Could not find the function' } });
      expect(await reportDriver('them-id', 'cheating')).toEqual({
        ok: false,
        reason: 'unavailable',
        message: "Couldn't send. Try again later.",
      });
    },
  );

  test('a rate-limited report says so in plain words', async () => {
    mockReply = () => ({ data: null, error: { code: 'PT429', message: 'rate_limited' } });
    expect(await reportDriver('them-id', 'cheating')).toEqual({
      ok: false,
      reason: 'rate_limited',
      message: "You've sent a lot of reports recently. Try again later.",
    });
  });

  test('a request that never got an answer is offline, returned or thrown', async () => {
    mockReply = () => ({
      data: null,
      error: { code: '', message: 'TypeError: Network request failed' },
    });
    expect(await reportDriver('them-id', 'cheating')).toMatchObject({ ok: false, reason: 'offline' });

    mockReply = () => Promise.reject(new TypeError('Network request failed'));
    expect(await reportDriver('them-id', 'cheating')).toMatchObject({ ok: false, reason: 'offline' });
  });

  test('without a backend it fails as unavailable rather than pretending to send', async () => {
    mockConfigured = false;
    expect(await reportDriver('them-id', 'cheating')).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
  });
});

describe('hideDriver', () => {
  test('inserts the hidden driver; blocker_id is the server default', async () => {
    expect(await hideDriver('them-id')).toEqual({ ok: true });
    expect(mockCalls).toEqual([
      { kind: 'blocks.insert', args: [{ blocked_id: 'them-id' }], filters: [] },
    ]);
  });

  test('hiding someone already hidden is a success, not a duplicate-key error', async () => {
    mockReply = () => ({ data: null, error: { code: '23505', message: 'duplicate key value' } });
    expect(await hideDriver('them-id')).toEqual({ ok: true });
  });

  test('a backend without the table (PGRST205, 42P01) says "Couldn\'t send"', async () => {
    for (const code of ['PGRST205', '42P01']) {
      mockReply = () => ({ data: null, error: { code, message: 'relation "blocks" does not exist' } });
      expect(await hideDriver('them-id')).toEqual({
        ok: false,
        reason: 'unavailable',
        message: "Couldn't send. Try again later.",
      });
    }
  });

  test('hiding yourself is refused without a request', async () => {
    expect(await hideDriver('me-id')).toEqual({
      ok: false,
      reason: 'self',
      message: "You can't hide yourself.",
    });
    expect(mockCalls).toHaveLength(0);
  });
});

describe('unhideDriver', () => {
  test('deletes only your own row for that driver', async () => {
    expect(await unhideDriver('them-id')).toEqual({ ok: true });
    expect(mockCalls).toEqual([
      {
        kind: 'blocks.delete',
        args: [],
        filters: [
          ['blocker_id', 'me-id'],
          ['blocked_id', 'them-id'],
        ],
      },
    ]);
  });

  test('a failure is reported, with its own copy', async () => {
    mockReply = () => ({ data: null, error: { code: 'PGRST205', message: 'no table' } });
    expect(await unhideDriver('them-id')).toEqual({
      ok: false,
      reason: 'unavailable',
      message: "Couldn't unhide them. Try again later.",
    });
  });
});

describe('listHidden', () => {
  test('reads list_blocked, newest first', async () => {
    mockReply = () => ({
      data: [
        { blocked_id: 'a', username: 'older', created_at: '2026-10-01T00:00:00Z' },
        { blocked_id: 'b', username: null, created_at: '2026-10-03T00:00:00Z' },
      ],
      error: null,
    });
    const r = await listHidden();
    expect(mockCalls[0].kind).toBe('rpc.list_blocked');
    expect(r).toEqual({
      ok: true,
      drivers: [
        { profileId: 'b', username: 'driver', hiddenAt: Date.parse('2026-10-03T00:00:00Z') },
        { profileId: 'a', username: 'older', hiddenAt: Date.parse('2026-10-01T00:00:00Z') },
      ],
    });
  });

  test('a failure is never an empty list', async () => {
    mockReply = () => ({ data: null, error: { code: 'PGRST202', message: 'no function' } });
    expect(await listHidden()).toEqual({
      ok: false,
      reason: 'unavailable',
      message: "Couldn't load hidden drivers. Try again later.",
    });
  });

  test('with no backend there is nobody to have hidden', async () => {
    mockConfigured = false;
    expect(await listHidden()).toEqual({ ok: true, drivers: [] });
  });
});

describe('moderationFailure', () => {
  test.each([
    [{ code: 'PGRST202', message: '' }, 'unavailable'],
    [{ code: 'PGRST205', message: '' }, 'unavailable'],
    [{ code: '42P01', message: '' }, 'unavailable'],
    [{ code: '42883', message: '' }, 'unavailable'],
    [{ code: '42501', message: 'permission denied' }, 'not_connected'],
    [{ code: '28000', message: 'not authenticated' }, 'not_connected'],
    [{ code: '54000', message: '' }, 'rate_limited'],
    [{ code: 'P0001', message: 'Too many reports' }, 'rate_limited'],
    [{ code: 'P0001', message: 'cannot report yourself' }, 'self'],
    // report_driver's own refusals (0019), by message.
    [{ code: 'PT429', message: 'rate_limited' }, 'rate_limited'],
    [{ code: '22023', message: 'cannot_report_self' }, 'self'],
    // A self-block that reaches the server: the blocks CHECK, as 23514.
    [
      {
        code: '23514',
        message: 'new row for relation "blocks" violates check constraint "blocks_not_self"',
      },
      'self',
    ],
    [{ code: '22023', message: 'invalid_reason' }, 'unavailable'],
    [{ code: 'P0002', message: 'no_such_driver' }, 'unavailable'],
    [{ code: '', message: 'TypeError: Network request failed' }, 'offline'],
    [new TypeError('Failed to fetch'), 'offline'],
    [null, 'offline'],
    [{ code: 'XX000', message: 'internal error' }, 'unavailable'],
  ])('%j → %s', (error, expected) => {
    expect(moderationFailure(error)).toBe(expected);
  });
});
