/**
 * ensureUserId: the anonymous session has to come back after it is lost.
 *
 * It used to be created once, at cold start. An offline first launch, or the
 * signOut at the end of account deletion, then left the app with no session —
 * sync, friends and VIN decode all failing — until the process was killed.
 * These pin the replacement's rules against a fake auth client: sign in only
 * when there is cleanly no session, never over a stored session that merely
 * failed to refresh, never twice at once, and try again after a failure.
 */

type Session = { user: { id: string } } | null;
type AuthError = { message: string } | null;

const mockAuth = {
  getSession: jest.fn<Promise<{ data: { session: Session }; error: AuthError }>, []>(),
  signInAnonymously: jest.fn<Promise<{ data: { session: Session }; error: AuthError }>, []>(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: mockAuth }),
}));

let ensureUserId: () => Promise<string | null>;

beforeAll(() => {
  // The client is only built when the backend is configured, and the module
  // reads that at load — so it is loaded here, after the env is set.
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  ({ ensureUserId } = jest.requireActual<typeof import('../supabase')>('../supabase'));
});

const session = (id: string) => ({ user: { id } });

beforeEach(() => {
  mockAuth.getSession.mockReset();
  mockAuth.signInAnonymously.mockReset();
});

test('an existing session is used as is', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: session('u1') }, error: null });
  expect(await ensureUserId()).toBe('u1');
  expect(mockAuth.signInAnonymously).not.toHaveBeenCalled();
});

test('no session at all signs in anonymously', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockAuth.signInAnonymously.mockResolvedValue({ data: { session: session('new') }, error: null });
  expect(await ensureUserId()).toBe('new');
});

test('a stored session that failed to refresh is not replaced with a new user', async () => {
  // auth-js answers this way offline with an expired access token, while the
  // session stays stored. Signing in here would orphan everything it uploaded.
  mockAuth.getSession.mockResolvedValue({
    data: { session: null },
    error: { message: 'AuthRetryableFetchError: Network request failed' },
  });
  expect(await ensureUserId()).toBeNull();
  expect(mockAuth.signInAnonymously).not.toHaveBeenCalled();
});

test('a failed sign-in is retried by the next call, not remembered', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockAuth.signInAnonymously
    .mockResolvedValueOnce({ data: { session: null }, error: { message: 'offline' } })
    .mockResolvedValueOnce({ data: { session: session('later') }, error: null });

  expect(await ensureUserId()).toBeNull();
  expect(await ensureUserId()).toBe('later');
  expect(mockAuth.signInAnonymously).toHaveBeenCalledTimes(2);
});

test('callers that arrive together share one sign-in', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockAuth.signInAnonymously.mockResolvedValue({ data: { session: session('one') }, error: null });

  const ids = await Promise.all([ensureUserId(), ensureUserId(), ensureUserId()]);
  expect(ids).toEqual(['one', 'one', 'one']);
  expect(mockAuth.signInAnonymously).toHaveBeenCalledTimes(1);
});

test('a throw anywhere resolves null rather than rejecting', async () => {
  mockAuth.getSession.mockRejectedValue(new Error('storage unavailable'));
  expect(await ensureUserId()).toBeNull();
});
