/**
 * Arithmetic behind the make-proof screen's motion and its printed numbers.
 * Pure, so the count, the bars and the strings are tested without a device.
 */

/**
 * Cubic ease-out: fast away, settling softly, no overshoot. The same family as
 * `easing.decel` in src/theme/motion.ts, which is a Reanimated curve and so
 * not callable from a plain JS frame loop.
 */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/**
 * Where a value ramping from 0 to `target` is after `elapsed` of `total` ms.
 * Never past the target and never below zero, whatever the clock says (a
 * frame delivered late, a negative delay).
 */
export function rampAt(elapsed: number, total: number, target: number): number {
  if (!Number.isFinite(target)) return 0;
  if (!(total > 0)) return target;
  return target * easeOutCubic(elapsed / total);
}

/**
 * A whole count with thousands separators: 1520 → "1,520".
 *
 * Built by hand rather than with toLocaleString, for the reason the board's
 * month table gives: the string must read the same on every device whatever
 * ICU data the platform shipped, and a count that ticks up must not change
 * width rules halfway through because one frame took a different code path.
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const whole = Math.round(Math.abs(n));
  const digits = String(whole);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return n < 0 && whole > 0 ? `-${out}` : out;
}

/**
 * A chart bar's length as a fraction of the track: `share` against the
 * largest share on the chart, so the leading row fills the track and the rest
 * read against it. Printed percentages carry the absolute values; the bars
 * carry the comparison. Never below `min`, so a make with a sliver of the
 * board still shows a mark rather than nothing.
 */
export function barFraction(share: number, maxShare: number, min = 0.04): number {
  if (!Number.isFinite(share) || !Number.isFinite(maxShare) || maxShare <= 0) return min;
  return Math.min(1, Math.max(min, share / maxShare));
}
