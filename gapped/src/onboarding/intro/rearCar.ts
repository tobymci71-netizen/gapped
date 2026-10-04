import { PathOp, Skia, type SkPath, type SkPoint, vec } from '@shopify/react-native-skia';

/**
 * A car seen from behind, as Skia paths, for the cornering demo.
 *
 * Why not CarSilhouette: that is a side profile, and roll is a rotation about
 * the car's long axis, which a side view looks straight across. Turned a few
 * degrees in the plane of the screen, a side profile pitches nose-up or
 * nose-down; it reads as braking, not cornering. Seen from behind, the same
 * rotation is body roll. The reference used a front three-quarter view of its
 * bike for exactly this reason. Same rule as CarSilhouette: no manufacturer
 * imagery, a generic shape drawn from proportions.
 *
 * Coordinates are fractions of the car's width: u runs left to right from the
 * centreline (−0.5 to 0.5 is the body), v runs up from the ground. Built once
 * per size with Skia's PathBuilder (the mutating SkPath methods are deprecated
 * in this Skia); nothing allocates per frame.
 */

export type RearCarGeometry = {
  /** Body shell, mirrors included: rolls. */
  body: SkPath;
  /** Rear screen: rolls. */
  glass: SkPath;
  /** Lamps and the light bar between them: roll. */
  lamps: SkPath;
  lightBar: SkPath;
  /** Number plate and diffuser line: roll. */
  trim: SkPath;
  /** Tyres stay planted while the body rolls over them. */
  tyres: SkPath;
  /** Soft contact shadow on the ground. */
  shadow: SkPath;
  /** Roll centre: the body pivots about a point near axle height. */
  rollCentre: SkPoint;
  stroke: number;
  hairline: number;
};

type UV = [number, number];

export function buildRearCar(cx: number, groundY: number, width: number): RearCarGeometry {
  const X = (u: number) => cx + u * width;
  const Y = (v: number) => groundY - v * width;

  /** A closed outline; a four-number step is a quadratic (control, then end). */
  const outline = (start: UV, steps: (UV | [number, number, number, number])[]): SkPath => {
    const b = Skia.PathBuilder.Make().moveTo(X(start[0]), Y(start[1]));
    for (const s of steps) {
      if (s.length === 2) b.lineTo(X(s[0]), Y(s[1]));
      else b.quadTo(X(s[0]), Y(s[1]), X(s[2]), Y(s[3]));
    }
    return b.close().build();
  };

  // The shell, clockwise from the bumper's bottom-left corner: across the
  // bumper, up the right flank, over the roof and down the left. Shoulders
  // are the widest point; the cabin tapers in above the beltline the way a
  // real greenhouse does. The left half mirrors the right point for point.
  let body = outline(
    [-0.46, 0.12],
    [
      [0.46, 0.12],
      [0.5, 0.12, 0.5, 0.17],
      [0.5, 0.3],
      [0.5, 0.355, 0.45, 0.365],
      [0.405, 0.375],
      [0.315, 0.555],
      [0.295, 0.59, 0.255, 0.59],
      [-0.255, 0.59],
      [-0.295, 0.59, -0.315, 0.555],
      [-0.405, 0.375],
      [-0.45, 0.365],
      [-0.5, 0.355, -0.5, 0.3],
      [-0.5, 0.17],
      [-0.5, 0.12, -0.46, 0.12],
    ],
  );

  /** A rounded rectangle from its left edge `u` and top `v`, in car widths. */
  const rrect = (u: number, v: number, w: number, h: number, r: number) =>
    Skia.RRectXY(Skia.XYWHRect(X(u), Y(v), w * width, h * width), r * width, r * width);

  // Door mirrors: a slim arm out from the pillar and a short, deep head just
  // beyond the shoulder. One long bar here reads as a pair of wings. Unioned
  // into the shell rather than added as extra contours, so the outline runs
  // round each mirror instead of through it.
  for (const side of [-1, 1]) {
    const arm = rrect(side > 0 ? 0.38 : -0.46, 0.425, 0.08, 0.02, 0.01);
    const head = rrect(side > 0 ? 0.45 : -0.545, 0.45, 0.095, 0.065, 0.026);
    for (const part of [arm, head]) {
      body = Skia.Path.MakeFromOp(body, Skia.Path.RRect(part), PathOp.Union) ?? body;
    }
  }

  const glass = outline(
    [-0.355, 0.395],
    [
      [0.355, 0.395],
      [0.285, 0.545],
      [0.27, 0.565, 0.245, 0.565],
      [-0.245, 0.565],
      [-0.27, 0.565, -0.285, 0.545],
    ],
  );

  const lamps = Skia.PathBuilder.Make()
    .addRRect(rrect(-0.475, 0.315, 0.175, 0.045, 0.012))
    .addRRect(rrect(0.3, 0.315, 0.175, 0.045, 0.012))
    .build();
  const lightBar = Skia.Path.Line(vec(X(-0.3), Y(0.293)), vec(X(0.3), Y(0.293)));

  const trim = Skia.PathBuilder.Make()
    .addRRect(rrect(-0.1, 0.235, 0.2, 0.06, 0.008))
    .moveTo(X(-0.32), Y(0.145))
    .lineTo(X(0.32), Y(0.145))
    .build();

  // Tyres reach up behind the bumper, so a rolling body never uncovers their tops.
  const tyres = Skia.PathBuilder.Make()
    .addRRect(rrect(-0.47, 0.17, 0.16, 0.17, 0.045))
    .addRRect(rrect(0.31, 0.17, 0.16, 0.17, 0.045))
    .build();

  const shadow = Skia.Path.Oval(
    Skia.XYWHRect(X(-0.54), groundY - 0.025 * width, 1.08 * width, 0.05 * width),
  );

  return {
    body,
    glass,
    lamps,
    lightBar,
    trim,
    tyres,
    shadow,
    rollCentre: vec(cx, Y(0.1)),
    stroke: Math.max(1.25, width * 0.012),
    hairline: Math.max(1, width * 0.008),
  };
}
