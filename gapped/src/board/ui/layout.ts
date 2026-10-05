import { space } from '@/theme/tokens';

/**
 * The Ranks tab's horizontal measures (Nightrun-Ranks).
 *
 * The board runs full-bleed: its rows, controls and hero sit 20pt from the
 * screen's edge, the inset tokens.ts gives full-bleed list rows, rather than
 * inside the 24pt screen gutter.
 */
export const EDGE = space.xl - space.xs;

/** A row's columns: position, the name and its bar, the '⋯' button. */
export const POS_W = 28;
/** The position column at large text, where a capped wide-italic "50" needs more. */
export const POS_W_LARGE = 48;
export const COL_GAP = 10;
/** The '⋯' button: a full 44pt square. */
export const MORE_W = 44;
/** Air right of the '⋯' button; its own 44pt square already pads the dots. */
export const ROW_END = 6;

/**
 * How wide a row's streak bar runs: from the name's left edge to the value's
 * right edge, which is the same for every row, so every bar shares an origin
 * and the board's best reaches the edge.
 */
export function barTrackWidth(windowWidth: number, menuSlot: boolean, largeText: boolean): number {
  const pos = largeText ? POS_W_LARGE : POS_W;
  const right = menuSlot ? COL_GAP + MORE_W + ROW_END : EDGE;
  return Math.max(0, windowWidth - EDGE - pos - COL_GAP - right);
}
