/**
 * Haptic vocabulary — each event maps to exactly one pattern (spec §A2).
 * Consistency is what makes haptics feel designed rather than noisy.
 *
 * Rules enforced here:
 *  - never more than one haptic per 100 ms (global throttle)
 *  - never during background recording (callers gate on app state; the
 *    recorder itself never imports this module)
 */

import * as Haptics from 'expo-haptics';

let lastFiredAt = 0;

function throttled(fn: () => Promise<void>): void {
  const now = Date.now();
  if (now - lastFiredAt < 100) return;
  lastFiredAt = now;
  fn().catch(() => undefined);
}

export const haptic = {
  /** Button press */
  press: () => throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Toggle / segment change / tab switch / scrub tick */
  selection: () => throttled(() => Haptics.selectionAsync()),
  /** Drive started */
  driveStarted: () =>
    throttled(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** New personal best during drive: Heavy ×2, 90 ms apart */
  personalBest: () =>
    throttled(async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      }, 90);
    }),
  /** Run verified: Success, then Medium 150 ms later */
  verified: () =>
    throttled(async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      }, 150);
    }),
  /** Run flagged unverified */
  unverified: () =>
    throttled(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Rank improved */
  rankUp: () => throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Error / rejected */
  error: () =>
    throttled(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Pull-to-refresh threshold */
  refreshThreshold: () =>
    throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
};
