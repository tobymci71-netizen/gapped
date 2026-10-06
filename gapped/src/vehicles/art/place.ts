import type { PxBox, ViewRender } from './types';

/** Where a render's image goes in its container, in points. */
export type Placement = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Points per image pixel. */
  scale: number;
};

function place(r: ViewRender, s: number, cx: number, anchorY: number, imageY: number): Placement {
  const [bx, , bw] = r.box;
  return {
    left: cx - (bx + bw / 2) * s,
    top: anchorY - imageY * s,
    width: r.w * s,
    height: r.h * s,
    scale: s,
  };
}

/**
 * Stands the vehicle on a floor: its tyres on `groundY`, centred on `cx`, as
 * tall as `vehicleHeight` (so a van stands taller than a hatchback at the
 * same scale of metres), but never wider than `maxWidth` or taller than
 * `maxHeight`.
 */
export function placeOnGround(
  r: ViewRender,
  opts: { cx: number; groundY: number; vehicleHeight: number; maxWidth?: number; maxHeight?: number },
): Placement {
  const [, , bw, bh] = r.box;
  let s = opts.vehicleHeight / bh;
  if (opts.maxWidth != null && bw * s > opts.maxWidth) s = opts.maxWidth / bw;
  if (opts.maxHeight != null && bh * s > opts.maxHeight) s = opts.maxHeight / bh;
  return place(r, s, opts.cx, opts.groundY, r.groundY);
}

/**
 * Fits the vehicle inside a frame, centred, leaving `margin` (a fraction of
 * the frame) on every side. The image may overhang the frame: its shadow and
 * glow sit outside the vehicle's box.
 */
export function fitInFrame(r: ViewRender, frameW: number, frameH: number, margin = 0.04): Placement {
  const [, by, bw, bh] = r.box;
  const s = Math.min((frameW * (1 - 2 * margin)) / bw, (frameH * (1 - 2 * margin)) / bh);
  return place(r, s, frameW / 2, frameH / 2, by + bh / 2);
}

/** A box in image pixels mapped through a placement, in points. */
export function boxToPoints(p: Placement, box: PxBox): { x: number; y: number; w: number; h: number } {
  return { x: p.left + box[0] * p.scale, y: p.top + box[1] * p.scale, w: box[2] * p.scale, h: box[3] * p.scale };
}

/** An image-pixel point mapped through a placement, in points. */
export function pointToPoints(p: Placement, pt: readonly [number, number]): { x: number; y: number } {
  return { x: p.left + pt[0] * p.scale, y: p.top + pt[1] * p.scale };
}
