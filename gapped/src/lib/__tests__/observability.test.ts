/**
 * The App Store build has no Sentry DSN, so nothing that reports may act as
 * though it has. The test crash used to crash such a build for real — with no
 * report anywhere to show for it — from a Settings row any tester could reach.
 *
 * The SDKs are replaced: Sentry ships ESM this Jest transform does not handle
 * (see scrub.ts), and what matters here is only whether they are called.
 */

const mockInit = jest.fn();
const mockCapture = jest.fn();
jest.mock('@sentry/react-native', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureException: (...args: unknown[]) => mockCapture(...args),
}));
jest.mock('posthog-react-native', () => jest.fn());

type Observability = typeof import('../observability');

/** A fresh copy of the module, as loaded with the given DSN in the env. */
function load(dsn: string | undefined): Observability {
  const saved = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (dsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
  let mod: Observability | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy per env
    mod = require('../observability') as Observability;
  });
  if (saved === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = saved;
  return mod!;
}

beforeEach(() => {
  mockInit.mockClear();
  mockCapture.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('without a DSN (the App Store build)', () => {
  test('init does not start Sentry', () => {
    load(undefined).initObservability();
    expect(mockInit).not.toHaveBeenCalled();
  });

  test('the test crash does nothing at all', () => {
    const o = load(undefined);
    o.initObservability();
    o.triggerTestCrash();
    // Nothing scheduled means nothing will throw.
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a caught error is not reported anywhere', () => {
    const o = load(undefined);
    o.initObservability();
    o.reportError(new Error('render failed'));
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('with a DSN (a developer build)', () => {
  test('init starts Sentry once, however often it is called', () => {
    const o = load('https://public@o0.ingest.sentry.io/0');
    o.initObservability();
    o.initObservability();
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  test('before init, nothing reports; after it, the test crash throws asynchronously', () => {
    const o = load('https://public@o0.ingest.sentry.io/0');
    o.triggerTestCrash();
    expect(jest.getTimerCount()).toBe(0);

    o.initObservability();
    o.triggerTestCrash();
    expect(jest.getTimerCount()).toBe(1);
    expect(() => jest.runOnlyPendingTimers()).toThrow('Gapped test crash');
  });

  test('a caught error is captured', () => {
    const o = load('https://public@o0.ingest.sentry.io/0');
    o.initObservability();
    const error = new Error('render failed');
    o.reportError(error);
    expect(mockCapture).toHaveBeenCalledWith(error);
  });
});
