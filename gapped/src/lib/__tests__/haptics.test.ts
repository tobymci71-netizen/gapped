/**
 * The 100 ms throttle exists so taps never stack into noise. But the outcome
 * of a tap (drive started, error) usually lands inside that window, straight
 * after the tap's own press tick, and a plain throttle swallowed exactly the
 * haptic that carried the meaning. These pin the priority rule.
 */

const calls: string[] = [];

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: jest.fn((style: string) => {
    calls.push(`impact:${style}`);
    return Promise.resolve();
  }),
  selectionAsync: jest.fn(() => {
    calls.push('selection');
    return Promise.resolve();
  }),
  notificationAsync: jest.fn((type: string) => {
    calls.push(`notification:${type}`);
    return Promise.resolve();
  }),
}));

let now = 1_000_000;

beforeEach(() => {
  calls.length = 0;
  now += 10_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function load() {
  let haptic!: typeof import('../haptics').haptic;
  jest.isolateModules(() => {
    // A fresh module per test: the throttle's last-fired time is module state.
    haptic = jest.requireActual<typeof import('../haptics')>('../haptics').haptic;
  });
  return haptic;
}

test('two presses inside 100 ms fire once', () => {
  const haptic = load();
  haptic.press();
  now += 40;
  haptic.press();
  expect(calls).toEqual(['impact:light']);
});

test("a tap's outcome still fires right after its press tick", () => {
  const haptic = load();
  haptic.press();
  now += 5;
  haptic.driveStarted();
  expect(calls).toEqual(['impact:light', 'notification:success']);
});

test('an error after a selection tick is not swallowed', () => {
  const haptic = load();
  haptic.selection();
  now += 20;
  haptic.error();
  expect(calls).toEqual(['selection', 'notification:error']);
});

test('outcomes still never stack on each other inside the window', () => {
  const haptic = load();
  haptic.error();
  now += 30;
  haptic.unverified();
  expect(calls).toEqual(['notification:error']);
});

test('a press right after an outcome stays throttled', () => {
  const haptic = load();
  haptic.driveStarted();
  now += 30;
  haptic.press();
  expect(calls).toEqual(['notification:success']);
});
