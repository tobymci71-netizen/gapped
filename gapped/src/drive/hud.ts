/**
 * Geometry of the Drive tab's live HUD: the dial and the distance · elapsed
 * line under it, which float over the map above the opaque Drives panel.
 * Pure, so the fit can be checked against real device sizes without a device.
 */

import { space, type } from '@/theme/tokens';

/** The dial's size when the screen has room for it. */
export const HUD_SIZE = 200;
/** Smallest the dial shrinks to when the screen is short. */
export const HUD_MIN_SIZE = 160;
/**
 * Text-size cap for the live line under the dial. It sits in a gap sized for
 * it above an opaque panel, so it cannot grow without limit — it is still
 * allowed to grow some, and the dial gives up the room.
 */
export const HUD_MAX_FONT_SCALE = 1.3;

/** Height of the live line under the dial, including its top margin. */
export function hudRowHeight(fontScale: number): number {
  return space.md + type.caption.lineHeight * Math.min(fontScale, HUD_MAX_FONT_SCALE);
}

/**
 * The dial size that lets the live line under it clear the panel.
 *
 * Nothing tied the two together: at a fixed 200pt, on a 375×667 SE the
 * panel's top edge (y 311) ran through that line (y 300–320) and hid the
 * bottom half of distance and time, and the 13 mini had 5pt to spare at the
 * default text size. The dial gives up height instead, down to HUD_MIN_SIZE.
 *
 * `sceneHeight` is the measured tab scene — the window minus the tab bar,
 * which the window height does not account for. 0 means not measured yet.
 */
export function hudDialSize(m: {
  sceneHeight: number;
  panelHeight: number;
  hudTop: number;
  fontScale: number;
}): number {
  if (m.sceneHeight <= 0) return HUD_SIZE;
  const room = m.sceneHeight - m.panelHeight - m.hudTop - hudRowHeight(m.fontScale) - space.sm;
  return Math.round(Math.max(HUD_MIN_SIZE, Math.min(HUD_SIZE, room)));
}
