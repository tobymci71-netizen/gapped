/**
 * Timing rules for the make-proof screen's data. Pure.
 */

/**
 * How long the proof screen waits for `make_popularity` before showing the
 * early variant. A slow network is treated as offline: the early variant is
 * honest either way, and a step that hangs on a chart costs the person more
 * than a chart is worth.
 */
export const PROOF_TIMEOUT_MS = 3500;

/**
 * How long loading may go unseen before the skeleton appears. An answer that
 * arrives inside this window (cached, local, or the offline stub's immediate
 * null) lands straight on the finished screen; showing a skeleton for one
 * frame first reads as a flicker, not as loading.
 */
export const SKELETON_GRACE_MS = 180;

/**
 * `promise`, or `fallback` if it has not settled within `ms`. A rejection also
 * becomes the fallback, so callers get one shape whatever went wrong. The
 * timer is cleared either way, so nothing fires after the answer is in.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
