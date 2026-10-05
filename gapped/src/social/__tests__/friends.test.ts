import { addFriend, addFriendErrorMessage, listFriends, removeFriend } from '../friends';
import { friendUsernameFromInput, isValidUsername, USERNAME_RULE } from '../username';

const mockRpc = jest.fn();
const mockUserId: string | null = 'me-id';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  ensureUserId: () => Promise.resolve(mockUserId),
}));

beforeEach(() => {
  mockRpc.mockReset();
});

describe('friendUsernameFromInput', () => {
  test('drops the @ the app displays usernames with', () => {
    expect(friendUsernameFromInput('@toby_m')).toBe('toby_m');
    expect(friendUsernameFromInput('@@toby_m')).toBe('toby_m');
  });

  test('lowercases, because stored usernames are lowercase and matched exactly', () => {
    expect(friendUsernameFromInput('Toby_M')).toBe('toby_m');
    expect(friendUsernameFromInput('@TOBY_M')).toBe('toby_m');
  });

  test('trims before removing the @, so a pasted " @name " still resolves', () => {
    expect(friendUsernameFromInput('  @toby_m  ')).toBe('toby_m');
  });

  test('leaves an @ that is not leading for the format check to reject', () => {
    expect(friendUsernameFromInput('toby@m')).toBe('toby@m');
    expect(isValidUsername('toby@m')).toBe(false);
  });
});

describe('addFriend', () => {
  test('sends the stored form of a name typed the way the app shows it', async () => {
    mockRpc.mockResolvedValue({ data: 'friend-id', error: null });
    const r = await addFriend(' @Toby_M ');
    expect(mockRpc).toHaveBeenCalledWith('add_friend', { p_username: 'toby_m' });
    expect(r).toEqual({ ok: true, friendId: 'friend-id' });
  });

  test('an empty or bare "@" input asks for a username without a request', async () => {
    expect(await addFriend('   ')).toEqual({ ok: false, reason: 'Enter a username.' });
    expect(await addFriend('@')).toEqual({ ok: false, reason: 'Enter a username.' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('text that cannot be a username says why, without a round trip', async () => {
    for (const bad of ['ab', 'toby m', 'toby-m', 'a'.repeat(21)]) {
      expect(await addFriend(bad)).toEqual({ ok: false, reason: USERNAME_RULE });
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('a genuinely unknown name is reported in the form the app displays', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'no driver called nobody_here' },
    });
    expect(await addFriend('@Nobody_Here')).toEqual({
      ok: false,
      reason: 'No driver called @nobody_here.',
    });
  });
});

describe('removeFriend', () => {
  test('reports failure rather than throwing, so the screen can say so', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'FetchError: offline' } });
    expect(await removeFriend('f1')).toBe(false);
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await removeFriend('f1')).toBe(true);
  });
});

describe('before the anonymous session exists', () => {
  test('a permission refusal reads as still connecting, not as a server message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for function add_friend' } });
    const r = await addFriend('toby_m');
    expect(r).toEqual({ ok: false, reason: 'Still connecting your account. Try again in a moment.' });
  });

  test('listing friends says the same instead of claiming a network problem', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    const r = await listFriends();
    expect(r).toEqual({ ok: false, reason: 'Still connecting your account. Try again in a moment.' });
  });
});


describe('an add_friend failure reads as plain copy, never the server message', () => {
  test.each([
    [{ code: 'P0001', message: 'you are already on your own board' }, "That's you. Your own runs are already on your board."],
    [{ code: 'P0002', message: 'no driver called toby_m' }, 'No driver called @toby_m.'],
    [{ code: '28000', message: 'not authenticated' }, 'Still connecting your account. Try again in a moment.'],
    [{ code: 'P0001', message: 'rate_limited' }, "You've added a lot of drivers in a short time. Try again later."],
    [{ code: '54000', message: 'program limit exceeded' }, "You've added a lot of drivers in a short time. Try again later."],
    [{ code: 'P0001', message: 'not_allowed' }, "You can't add this driver."],
    [{ code: '', message: 'TypeError: Network request failed' }, "You're offline. Try again when you have signal."],
    [{ code: 'XX000', message: 'ERROR: internal: something odd' }, "Couldn't add them. Try again later."],
  ])('%j', (error, expected) => {
    expect(addFriendErrorMessage(error, 'toby_m')).toBe(expected);
  });

  test('adding yourself is said in words, not as "you are already on your own board"', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'you are already on your own board' },
    });
    expect(await addFriend('toby_m')).toEqual({
      ok: false,
      reason: "That's you. Your own runs are already on your board.",
    });
  });

  test('a request that throws resolves as offline rather than rejecting', async () => {
    mockRpc.mockRejectedValue(new TypeError('Network request failed'));
    expect(await addFriend('toby_m')).toEqual({
      ok: false,
      reason: "You're offline. Try again when you have signal.",
    });
  });
});
