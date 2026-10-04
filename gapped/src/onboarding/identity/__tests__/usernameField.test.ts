import {
  type Availability,
  availabilityFrom,
  USERNAME_HELPER,
  USERNAME_INVALID,
  USERNAME_TAKEN,
  usernameFieldState,
  withTimeout,
} from '../usernameField';

const state = (raw: string, settled = true, availability: Availability = 'unchecked') =>
  usernameFieldState({ raw, settled, availability });

describe('usernameFieldState', () => {
  it('starts grey and closed', () => {
    expect(state('')).toEqual({
      name: '',
      tone: 'neutral',
      caption: USERNAME_HELPER,
      checking: false,
      canContinue: false,
    });
  });

  it('flags characters outside the rule at once, before typing settles', () => {
    for (const raw of ['to.by', 'to-by', 'to by', 'tobé', 'toby!']) {
      const s = state(raw, false);
      expect([raw, s.tone, s.caption, s.canContinue]).toEqual([
        raw,
        'error',
        USERNAME_INVALID,
        false,
      ]);
    }
  });

  it('does not call a short name wrong while it is still being typed', () => {
    expect(state('to', false)).toMatchObject({
      tone: 'neutral',
      caption: USERNAME_HELPER,
      canContinue: false,
    });
  });

  it('calls a short name wrong once typing has settled', () => {
    expect(state('to', true)).toMatchObject({
      tone: 'error',
      caption: USERNAME_INVALID,
      canContinue: false,
    });
  });

  it('uses the server rule: 3 and 20 characters pass, 21 does not', () => {
    expect(state('abc', true, 'available').canContinue).toBe(true);
    expect(state('a'.repeat(20), true, 'available').canContinue).toBe(true);
    expect(state('a'.repeat(21), true, 'available')).toMatchObject({
      tone: 'error',
      canContinue: false,
    });
  });

  it('judges the name as it will be stored: trimmed and lower-cased', () => {
    const s = state('  Toby_99 ', true, 'available');
    expect(s.name).toBe('toby_99');
    expect(s.canContinue).toBe(true);
  });

  it('waits on the server for a well-formed name', () => {
    expect(state('toby', true, 'unchecked')).toMatchObject({
      tone: 'neutral',
      checking: false,
      canContinue: false,
    });
    expect(state('toby', true, 'checking')).toMatchObject({
      tone: 'neutral',
      checking: true,
      canContinue: false,
    });
  });

  it('shows the taken state in orange and keeps Continue shut', () => {
    expect(state('toby', true, 'taken')).toEqual({
      name: 'toby',
      tone: 'error',
      caption: USERNAME_TAKEN,
      checking: false,
      canContinue: false,
    });
  });

  it('opens Continue for an available name, with the lime tick', () => {
    expect(state('toby', true, 'available')).toMatchObject({
      tone: 'ok',
      caption: USERNAME_HELPER,
      canContinue: true,
    });
  });

  it('lets someone offline carry on: unknown is not taken', () => {
    expect(state('toby', true, 'unknown')).toMatchObject({ tone: 'neutral', canContinue: true });
  });

  it('never opens Continue for an invalid name, whatever the server said', () => {
    for (const a of ['available', 'unknown'] as const) {
      expect(state('to', true, a).canContinue).toBe(false);
      expect(state('to-by', true, a).canContinue).toBe(false);
    }
  });

  it('uses the exact copy from docs/ONBOARDING.md', () => {
    expect(USERNAME_HELPER).toBe('3–20 lowercase letters, numbers or underscores.');
    expect(USERNAME_INVALID).toBe('Use 3–20 lowercase letters, numbers or underscores.');
    expect(USERNAME_TAKEN).toBe('That username is already taken.');
  });
});

describe('availabilityFrom', () => {
  it('maps the server verdict, and treats "could not ask" as unknown, never taken', () => {
    expect(availabilityFrom(true)).toBe('available');
    expect(availabilityFrom(false)).toBe('taken');
    expect(availabilityFrom(null)).toBe('unknown');
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes an answer through when it arrives in time', async () => {
    const result = withTimeout(Promise.resolve(true), 1000, null);
    await expect(result).resolves.toBe(true);
  });

  it('gives the fallback when the answer is too slow', async () => {
    const never = new Promise<boolean>(() => undefined);
    const result = withTimeout(never, 1000, null);
    jest.advanceTimersByTime(1000);
    await expect(result).resolves.toBeNull();
  });

  it('gives the fallback, not a rejection, when the call fails', async () => {
    const result = withTimeout(Promise.reject(new Error('offline')), 1000, null);
    await expect(result).resolves.toBeNull();
  });
});
