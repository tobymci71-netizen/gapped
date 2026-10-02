/**
 * PressableScale's animated style owns `opacity` and resolves after the
 * caller's style, so whatever opacity the caller asked for has to be read out
 * and carried into it — otherwise a disabled pill dimmed to 0.45 through its
 * style renders at full strength and looks live. restingOpacity is that read.
 *
 * Its press haptic fires when a press commits, after the caller's handler, so
 * a scroll that starts on a row never buzzes and a handler's own pattern is
 * not swallowed by the throttle. withPressHaptic is that wrapper.
 */

import * as Haptics from 'expo-haptics';
import { StyleSheet } from 'react-native';
import { restingOpacity, withPressHaptic } from '@/components/PressableScale';
import { haptic } from '@/lib/haptics';

// The real haptics module runs, throttle included; only the native calls are
// stubbed, so the assertions are about which pattern the user actually feels.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Reanimated's entry point (its bundled mock included) boots the native
// worklets runtime, which jest does not have. restingOpacity is plain style
// arithmetic, so a stub covering what the module touches at import is enough.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: (c: unknown) => c },
  Easing: { bezier: () => () => 0 },
  useAnimatedStyle: jest.fn(),
  useSharedValue: jest.fn(),
  withSpring: jest.fn(),
  withTiming: jest.fn(),
}));

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 12, borderRadius: 999 },
  pillOff: { opacity: 0.45 },
});

describe('restingOpacity', () => {
  it('is 1 when the caller sets no style or no opacity', () => {
    expect(restingOpacity(undefined)).toBe(1);
    expect(restingOpacity(null)).toBe(1);
    expect(restingOpacity(styles.pill)).toBe(1);
  });

  it("carries a dimmed caller's opacity through", () => {
    expect(restingOpacity([styles.pill, styles.pillOff])).toBe(0.45);
  });

  it('ignores the falsy entries of a conditional style array', () => {
    // The shape every dimming caller uses: `disabled && styles.pillOff`.
    const disabled = false;
    expect(restingOpacity([styles.pill, disabled && styles.pillOff])).toBe(1);
    expect(restingOpacity([styles.pill, !disabled && styles.pillOff])).toBe(0.45);
  });

  it('lets the last opacity win, as React Native does', () => {
    expect(restingOpacity([{ opacity: 0.45 }, [{ opacity: 0.8 }]])).toBe(0.8);
  });

  it('falls back to 1 for a style function it cannot resolve without press state', () => {
    expect(restingOpacity(() => ({ opacity: 0.3 }))).toBe(1);
  });
});

describe('withPressHaptic', () => {
  // The throttle keys off Date.now(). Each test starts well clear of the last
  // one's window and holds the clock still, so two haptics in one test land
  // inside the same 100 ms, exactly as two calls in one press handler do.
  let clock = 0;
  let now: jest.SpyInstance<number, []>;
  beforeEach(() => {
    clock += 10_000;
    now = jest.spyOn(Date, 'now').mockReturnValue(clock);
    jest.mocked(Haptics.impactAsync).mockClear();
    jest.mocked(Haptics.notificationAsync).mockClear();
  });
  afterEach(() => now.mockRestore());

  it('adds no handler, and so no haptic, where the caller has none', () => {
    expect(withPressHaptic(undefined, false)).toBeUndefined();
    expect(withPressHaptic(null, false)).toBeUndefined();
  });

  it('runs the handler with the event, then the press haptic', () => {
    const order: string[] = [];
    jest.mocked(Haptics.impactAsync).mockImplementationOnce(() => {
      order.push('haptic');
      return Promise.resolve();
    });
    const handler = jest.fn(() => order.push('handler'));
    withPressHaptic(handler, false)?.('event');
    expect(handler).toHaveBeenCalledWith('event');
    expect(order).toEqual(['handler', 'haptic']);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it("lets a handler's own pattern win the throttle over the generic press", () => {
    // Start drive: the Button is not silent and its handler fires driveStarted.
    withPressHaptic(() => haptic.driveStarted(), false)?.(undefined);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('stays quiet when silent, but still runs the handler', () => {
    const handler = jest.fn();
    withPressHaptic(handler, true)?.(undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
