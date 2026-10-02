/**
 * Haptic vocabulary — each event maps to exactly one pattern (spec §A2).
 * Consistency is what makes haptics feel designed rather than noisy.
 *
 * Rules enforced here:
 *  - never more than one haptic per 100 ms (global throttle), except that an
 *    OUTCOME pattern (drive started, PB, verified, unverified, error) may
 *    follow a press or selection tick inside that window. Those outcomes
 *    usually come from the very tap that just fired `press`, so a plain
 *    throttle swallowed the one haptic that carried the meaning.
 *  - never during background recording (callers gate on app state; the
 *    recorder itself never imports this module)
 */

import * as Haptics from 'expo-haptics';

let lastFiredAt = 0;
let lastWasOutcome = false;

function throttled(fn: () => Promise<void>, outcome = false): void {
  const now = Date.now();
  if (now - lastFiredAt < 100 && !(outcome && !lastWasOutcome)) return;
  lastFiredAt = now;
  lastWasOutcome = outcome;
  fn().catch(() => undefined);
}

export const haptic = {
  /** Button press */
  press: () => throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Toggle / segment change / tab switch / scrub tick */
  selection: () => throttled(() => Haptics.selectionAsync()),
  /** Drive started */
  driveStarted: () =>
    throttled(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), true),
  /** New personal best, when a drive finalises — never mid-drive (NO_IN_DRIVE_SPEED_NUDGES): Heavy ×2, 90 ms apart */
  personalBest: () =>
    throttled(async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      }, 90);
    }, true),
  /** Run verified: Success, then Medium 150 ms later */
  verified: () =>
    throttled(async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      }, 150);
    }, true),
  /** Run flagged unverified */
  unverified: () =>
    throttled(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning), true),
  /** Rank improved */
  rankUp: () => throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Error / rejected */
  error: () =>
    throttled(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), true),
  /** Pull-to-refresh threshold */
  refreshThreshold: () =>
    throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
};
