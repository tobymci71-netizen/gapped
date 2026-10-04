/**
 * The "Getting your car ready" beat, as pure functions of time.
 *
 * docs/ONBOARDING.md: a staged checklist over real work (saving the answers,
 * syncing the profile), with a minimum of about three seconds so "You're all
 * set" does not flash past. Two clocks run at once — the staging and the work —
 * and the percent has to honour both: it never reaches 100 before the minimum,
 * and never before the work has either finished or been given up on. Offline,
 * the work finishes at once (no backend, nothing to wait for), so the beat is
 * exactly the minimum; on a slow network it waits, but never past
 * SETUP_MAX_WAIT_MS.
 *
 * Pure so the curve is tested rather than eyeballed. The screen samples it
 * once a frame.
 */

/** The shortest the beat may take, start to 100%. */
export const SETUP_MIN_MS = 3200;

/**
 * The longest the work is waited on. Past it the beat finishes anyway and the
 * work carries on in the background: syncIdentity runs again when onboarding
 * completes and on every launch, and the answers stay in the store for a
 * retry, so nothing is lost by not waiting — only time is lost by waiting.
 */
export const SETUP_MAX_WAIT_MS = 8000;

/** Where the percent waits while the work is still out. */
export const SETUP_HOLD_PERCENT = 94;

/** From the hold to 100% once the work lands: one ease-out step, not a jump. */
export const SETUP_FINISH_MS = 500;

/** A beat at 100% before the heading turns to "You're all set." */
export const SETUP_SETTLE_MS = 350;

export type ChecklistKey = 'vehicle' | 'preferences' | 'stats' | 'rankings' | 'setup';

export type ChecklistItem = {
  key: ChecklistKey;
  label: string;
  /** The grey second line, shown while this row is the one in progress. */
  caption?: string;
  /** The percent at which this row ticks. The last is 100: it ticks as the beat ends. */
  threshold: number;
};

/** The five rows, in order. `noun` is vehicleNoun(kind): "Your car" or "Your bike". */
export function setupChecklist(noun: 'car' | 'bike'): readonly ChecklistItem[] {
  return [
    { key: 'vehicle', label: `Your ${noun}`, threshold: 14 },
    {
      key: 'preferences',
      label: 'Your drive preferences',
      caption: 'Your units. Your country. Your way.',
      threshold: 36,
    },
    { key: 'stats', label: 'Your stats', threshold: 58 },
    { key: 'rankings', label: 'Your rankings', threshold: 80 },
    {
      key: 'setup',
      label: 'Your setup',
      caption: 'Keeping everything ready for your first drive.',
      threshold: 100,
    },
  ];
}

const clamp01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x);

/**
 * Ease in and out. A loading count that leaps off the line reads as fake; one
 * that gathers pace and then settles reads as work being done.
 */
const easeInOutSine = (x: number): number => (1 - Math.cos(Math.PI * clamp01(x))) / 2;
const easeOutQuad = (x: number): number => 1 - (1 - clamp01(x)) ** 2;

/** The staged curve on its own: 0 at the start, 100 at SETUP_MIN_MS. */
function staged(elapsedMs: number): number {
  return 100 * easeInOutSine(elapsedMs / SETUP_MIN_MS);
}

/**
 * The percent (0–100, fractional) at `elapsedMs` into the beat.
 *
 * `workDoneAtMs` is when the work settled, measured on the same clock; null
 * while it is still out. Work still out at SETUP_MAX_WAIT_MS is given up on
 * there, and an answer arriving after that changes nothing.
 *
 *  - Work out: the staged curve, held at SETUP_HOLD_PERCENT.
 *  - Work done before the curve reached the hold: the staged curve, untouched,
 *    to 100 at SETUP_MIN_MS. The common case: offline, or a quick sync.
 *  - Work done (or given up on) while holding: from the hold to 100 over
 *    SETUP_FINISH_MS.
 *
 * Continuous in every case, and never decreasing. The cap lives here rather
 * than in a timer on the screen, so the screen has nothing to clean up and a
 * late answer cannot pull a finishing bar back to the hold.
 */
export function setupPercent(elapsedMs: number, workDoneAtMs: number | null): number {
  const t = Math.max(0, elapsedMs);
  const done = Math.max(0, Math.min(workDoneAtMs ?? Infinity, SETUP_MAX_WAIT_MS));
  if (t < done) return Math.min(staged(t), SETUP_HOLD_PERCENT);
  if (staged(done) < SETUP_HOLD_PERCENT) return staged(t);
  return (
    SETUP_HOLD_PERCENT +
    (100 - SETUP_HOLD_PERCENT) * easeOutQuad((t - done) / SETUP_FINISH_MS)
  );
}

/** The whole number the screen prints. Floored, so "100%" means finished. */
export function displayPercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.floor(percent)));
}

/**
 * How far down the checklist the printed percent has reached: how many rows
 * have ticked, and which row (if any) is the one in progress — the row whose
 * caption shows.
 */
export function checklistProgress(
  shownPercent: number,
  items: readonly ChecklistItem[],
): { done: number; active: number | null } {
  let done = 0;
  while (done < items.length && shownPercent >= items[done].threshold) done++;
  return { done, active: done < items.length ? done : null };
}
