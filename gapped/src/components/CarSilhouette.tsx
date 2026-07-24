import {
  BlurMask,
  Canvas,
  Group,
  Path,
  Skia,
  vec,
  type SkPath,
  type SkPoint,
} from '@shopify/react-native-skia';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing, spring } from '@/theme/motion';
import { color } from '@/theme/tokens';
import { BodyType } from '@/vehicles/bodyType';

/**
 * Parametric vehicle silhouette — the payoff of the "choose your ride" step.
 *
 * We never ship manufacturer imagery. Instead one side-profile generator is
 * driven by a proportion preset per body type, so a roadster, a Range Rover
 * and a panel van resolve to genuinely different shapes. Presets are quoted
 * as fractions of the vehicle's own LENGTH (the way vehicle dimensions are
 * published), which keeps a 4.0 m hatchback correctly stubbier than a 5.7 m
 * pickup once both are normalised into the same circle.
 *
 * Geometry is built once per [bodyType, size] in useMemo; the reveal is a
 * path trim driven by shared values. Nothing allocates per frame.
 */

/** u = distance aft of the nose ÷ length. v = height above ground ÷ length. */
type UV = { u: number; v: number };
type XY = { x: number; y: number };

type CarProfile = {
  /** Length as a fraction of the square's side, before the height cap bites. */
  fill: number;
  /** Underside of the body (rocker panel). */
  sillY: number;
  /** Front face is raked: the top of the nose sits this far aft of u=0. */
  noseRake: number;
  noseY: number;
  /** Base of the windscreen — where the bonnet ends. */
  cowlX: number;
  bonnetY: number;
  roofStart: number;
  roofEnd: number;
  roofY: number;
  /** Where the backlight meets the boot lid / bed rail / tailgate. */
  deckX: number;
  bootY: number;
  tailRake: number;
  tailY: number;
  /** Beltline: bottom edge of the side glass. */
  beltY: number;
  /** B-pillar; omitted when the body has a single cab window. */
  pillarX?: number;
  /** Forces the glass to stop short of the roof end (van cab, roadster). */
  glassEndX?: number;
  /** Backward rake of the glass trailing edge when glassEndX applies. */
  glassRake?: number;
  wheelR: number;
  frontWheelX: number;
  rearWheelX: number;
  /** Wheel arch radius ÷ wheel radius. */
  archScale: number;
  /** Convex bow of the bonnet and the roof. */
  bonnetCrown: number;
  roofCrown: number;
};

type BikeProfile = {
  fill: number;
  /** Highest point of the whole machine (bar or mirror), for the fit. */
  topV: number;
  wheelR: number;
  frontWheelX: number;
  rearWheelX: number;
  /** Closed body mass, traversed without self-intersecting. */
  outline: UV[];
  /** Open polylines: forks, bars, swingarm, exhaust. */
  lines: UV[][];
  /** Front mudguard radius ÷ wheel radius. */
  guardScale: number;
  /** Catmull-Rom tension; below 1 keeps the tank/seat step from rounding away. */
  tension: number;
  /** Headlight disc inside the leg shield (scooters). */
  lamp?: { at: UV; r: number };
};

const SALOON: CarProfile = {
  fill: 0.88,
  sillY: 0.052,
  noseRake: 0.022,
  noseY: 0.163,
  cowlX: 0.33,
  bonnetY: 0.202,
  roofStart: 0.5,
  roofEnd: 0.7,
  roofY: 0.308,
  deckX: 0.855,
  bootY: 0.243,
  tailRake: 0.016,
  tailY: 0.23,
  beltY: 0.246,
  pillarX: 0.585,
  wheelR: 0.084,
  frontWheelX: 0.196,
  rearWheelX: 0.798,
  archScale: 1.3,
  bonnetCrown: 0.008,
  roofCrown: 0.01,
};

const COUPE: CarProfile = {
  fill: 0.89,
  sillY: 0.048,
  noseRake: 0.026,
  noseY: 0.15,
  cowlX: 0.355,
  bonnetY: 0.192,
  roofStart: 0.505,
  roofEnd: 0.63,
  roofY: 0.292,
  deckX: 0.905,
  bootY: 0.216,
  tailRake: 0.02,
  tailY: 0.2,
  beltY: 0.222,
  pillarX: 0.585,
  wheelR: 0.088,
  frontWheelX: 0.198,
  rearWheelX: 0.802,
  archScale: 1.28,
  bonnetCrown: 0.007,
  roofCrown: 0.012,
};

const HATCHBACK: CarProfile = {
  fill: 0.84,
  sillY: 0.06,
  noseRake: 0.02,
  noseY: 0.186,
  cowlX: 0.32,
  bonnetY: 0.238,
  roofStart: 0.492,
  roofEnd: 0.76,
  roofY: 0.36,
  deckX: 0.958,
  bootY: 0.272,
  tailRake: 0.008,
  tailY: 0.25,
  beltY: 0.264,
  pillarX: 0.612,
  wheelR: 0.098,
  frontWheelX: 0.204,
  rearWheelX: 0.8,
  archScale: 1.28,
  bonnetCrown: 0.008,
  roofCrown: 0.008,
};

const ESTATE: CarProfile = {
  fill: 0.88,
  sillY: 0.055,
  noseRake: 0.02,
  noseY: 0.168,
  cowlX: 0.335,
  bonnetY: 0.208,
  roofStart: 0.5,
  roofEnd: 0.88,
  roofY: 0.312,
  deckX: 0.978,
  bootY: 0.252,
  tailRake: 0.006,
  tailY: 0.235,
  beltY: 0.25,
  pillarX: 0.59,
  wheelR: 0.085,
  frontWheelX: 0.194,
  rearWheelX: 0.8,
  archScale: 1.28,
  bonnetCrown: 0.008,
  roofCrown: 0.006,
};

const SUV: CarProfile = {
  fill: 0.86,
  sillY: 0.076,
  noseRake: 0.014,
  noseY: 0.238,
  cowlX: 0.312,
  bonnetY: 0.268,
  roofStart: 0.478,
  roofEnd: 0.845,
  roofY: 0.378,
  deckX: 0.968,
  bootY: 0.3,
  tailRake: 0.008,
  tailY: 0.28,
  beltY: 0.292,
  pillarX: 0.608,
  wheelR: 0.112,
  frontWheelX: 0.196,
  rearWheelX: 0.806,
  archScale: 1.26,
  bonnetCrown: 0.006,
  roofCrown: 0.005,
};

/** tailRake 0 keeps the bed rail dead flat from the cab to the tailgate. */
const PICKUP: CarProfile = {
  fill: 0.92,
  sillY: 0.066,
  noseRake: 0.012,
  noseY: 0.226,
  cowlX: 0.272,
  bonnetY: 0.254,
  roofStart: 0.392,
  roofEnd: 0.58,
  roofY: 0.336,
  deckX: 0.648,
  bootY: 0.224,
  tailRake: 0,
  tailY: 0.224,
  beltY: 0.25,
  pillarX: 0.486,
  wheelR: 0.094,
  frontWheelX: 0.176,
  rearWheelX: 0.812,
  archScale: 1.26,
  bonnetCrown: 0.006,
  roofCrown: 0.005,
};

const VAN: CarProfile = {
  fill: 0.86,
  sillY: 0.072,
  noseRake: 0.01,
  noseY: 0.268,
  cowlX: 0.168,
  bonnetY: 0.3,
  roofStart: 0.318,
  roofEnd: 0.962,
  roofY: 0.442,
  deckX: 0.992,
  bootY: 0.352,
  tailRake: 0.004,
  tailY: 0.322,
  beltY: 0.33,
  glassEndX: 0.452,
  wheelR: 0.09,
  frontWheelX: 0.166,
  rearWheelX: 0.796,
  archScale: 1.24,
  bonnetCrown: 0.005,
  roofCrown: 0.004,
};

/** Speedster profile: long bonnet, cabin pushed aft, roof is the screen header. */
const ROADSTER: CarProfile = {
  fill: 0.88,
  sillY: 0.052,
  noseRake: 0.026,
  noseY: 0.152,
  cowlX: 0.452,
  bonnetY: 0.196,
  roofStart: 0.578,
  roofEnd: 0.632,
  roofY: 0.306,
  deckX: 0.782,
  bootY: 0.226,
  tailRake: 0.022,
  tailY: 0.208,
  beltY: 0.232,
  glassEndX: 0.658,
  glassRake: 0.036,
  wheelR: 0.096,
  frontWheelX: 0.212,
  rearWheelX: 0.796,
  archScale: 1.28,
  bonnetCrown: 0.01,
  roofCrown: 0.014,
};

const SUPERCAR: CarProfile = {
  fill: 0.92,
  sillY: 0.042,
  noseRake: 0.036,
  noseY: 0.116,
  cowlX: 0.268,
  bonnetY: 0.148,
  roofStart: 0.468,
  roofEnd: 0.568,
  roofY: 0.256,
  deckX: 0.862,
  bootY: 0.212,
  tailRake: 0.022,
  tailY: 0.196,
  beltY: 0.186,
  glassEndX: 0.64,
  glassRake: 0.03,
  wheelR: 0.1,
  frontWheelX: 0.206,
  rearWheelX: 0.8,
  archScale: 1.24,
  bonnetCrown: 0.006,
  roofCrown: 0.012,
};

const MOTORBIKE: BikeProfile = {
  fill: 0.74,
  topV: 0.5,
  wheelR: 0.148,
  frontWheelX: 0.112,
  rearWheelX: 0.786,
  guardScale: 1.34,
  tension: 0.5,
  outline: [
    { u: 0.268, v: 0.382 }, // headstock
    { u: 0.3, v: 0.428 },
    { u: 0.352, v: 0.47 }, // tank crown
    { u: 0.412, v: 0.466 },
    { u: 0.446, v: 0.424 }, // step down to the seat
    { u: 0.492, v: 0.408 },
    { u: 0.64, v: 0.406 },
    { u: 0.76, v: 0.418 },
    { u: 0.85, v: 0.462 }, // tail kick
    { u: 0.9, v: 0.47 },
    { u: 0.902, v: 0.43 },
    { u: 0.812, v: 0.392 },
    { u: 0.706, v: 0.356 },
    { u: 0.618, v: 0.322 },
    { u: 0.556, v: 0.286 }, // swingarm pivot
    { u: 0.532, v: 0.216 },
    { u: 0.478, v: 0.158 }, // sump
    { u: 0.404, v: 0.156 },
    { u: 0.344, v: 0.216 },
    { u: 0.296, v: 0.296 },
    { u: 0.262, v: 0.352 },
  ],
  lines: [
    [
      { u: 0.258, v: 0.376 },
      { u: 0.112, v: 0.148 },
    ], // fork
    [
      { u: 0.258, v: 0.394 },
      { u: 0.226, v: 0.458 },
      { u: 0.176, v: 0.472 },
    ], // bars
    [
      { u: 0.552, v: 0.28 },
      { u: 0.786, v: 0.148 },
    ], // swingarm
    [
      { u: 0.486, v: 0.15 },
      { u: 0.606, v: 0.15 },
      { u: 0.712, v: 0.19 },
      { u: 0.8, v: 0.228 },
    ], // exhaust
  ],
};

/** Step-through: front wheel sits well ahead of the shield, body arches over the rear. */
const SCOOTER: BikeProfile = {
  fill: 0.74,
  topV: 0.56,
  wheelR: 0.104,
  frontWheelX: 0.098,
  rearWheelX: 0.8,
  guardScale: 1.55,
  tension: 0.7,
  lamp: { at: { u: 0.23, v: 0.386 }, r: 0.05 },
  outline: [
    { u: 0.222, v: 0.492 }, // shield dome, front
    { u: 0.19, v: 0.43 },
    { u: 0.184, v: 0.336 },
    { u: 0.208, v: 0.256 },
    { u: 0.25, v: 0.206 }, // shield foot
    { u: 0.33, v: 0.18 }, // floorboard, underside
    { u: 0.47, v: 0.176 },
    { u: 0.56, v: 0.18 },
    { u: 0.62, v: 0.15 },
    { u: 0.66, v: 0.1 }, // skirt, ahead of the rear wheel
    { u: 0.716, v: 0.18 },
    { u: 0.8, v: 0.25 }, // rear arch crown
    { u: 0.884, v: 0.176 },
    { u: 0.93, v: 0.1 }, // skirt, behind
    { u: 0.968, v: 0.196 },
    { u: 0.992, v: 0.32 },
    { u: 0.98, v: 0.416 },
    { u: 0.906, v: 0.456 }, // seat rear
    { u: 0.772, v: 0.466 },
    { u: 0.656, v: 0.446 },
    { u: 0.618, v: 0.39 },
    { u: 0.596, v: 0.292 },
    { u: 0.572, v: 0.226 }, // floorboard, top surface
    { u: 0.4, v: 0.222 },
    { u: 0.352, v: 0.3 }, // shield, rear face
    { u: 0.306, v: 0.404 },
    { u: 0.276, v: 0.486 },
  ],
  lines: [
    [
      { u: 0.276, v: 0.486 },
      { u: 0.322, v: 0.548 },
      { u: 0.362, v: 0.556 },
    ], // bars
    [
      { u: 0.63, v: 0.402 },
      { u: 0.952, v: 0.42 },
    ], // seat shut line
    [
      { u: 0.212, v: 0.252 },
      { u: 0.1, v: 0.118 },
    ], // fork
  ],
};

/**
 * Cruiser: long wheelbase, raked fork, teardrop tank, low stepped seat and
 * straight pipes. Deliberately a different silhouette from MOTORBIKE — a
 * Harley must not read as a sportbike.
 */
const CRUISER: BikeProfile = {
  fill: 0.84,
  topV: 0.44,
  wheelR: 0.134,
  frontWheelX: 0.104,
  rearWheelX: 0.848,
  guardScale: 1.42,
  tension: 0.5,
  outline: [
    { u: 0.302, v: 0.352 }, // headstock, raked back
    { u: 0.336, v: 0.392 },
    { u: 0.392, v: 0.412 }, // teardrop tank crown
    { u: 0.454, v: 0.402 },
    { u: 0.492, v: 0.344 }, // step down to the low seat
    { u: 0.548, v: 0.318 },
    { u: 0.648, v: 0.316 },
    { u: 0.736, v: 0.34 }, // pillion rise
    { u: 0.822, v: 0.386 }, // rear fender crown
    { u: 0.876, v: 0.372 },
    { u: 0.87, v: 0.33 },
    { u: 0.79, v: 0.3 },
    { u: 0.7, v: 0.272 },
    { u: 0.624, v: 0.252 }, // frame rail
    { u: 0.6, v: 0.208 },
    { u: 0.572, v: 0.148 }, // gearbox
    { u: 0.5, v: 0.132 },
    { u: 0.446, v: 0.18 }, // front cylinder
    { u: 0.408, v: 0.268 },
    { u: 0.35, v: 0.3 },
    { u: 0.298, v: 0.322 },
  ],
  lines: [
    [
      { u: 0.294, v: 0.346 },
      { u: 0.104, v: 0.134 },
    ], // raked fork
    [
      { u: 0.296, v: 0.364 },
      { u: 0.256, v: 0.414 },
      { u: 0.206, v: 0.424 },
    ], // pullback bars
    [
      { u: 0.62, v: 0.246 },
      { u: 0.848, v: 0.134 },
    ], // rear frame
    [
      { u: 0.452, v: 0.152 },
      { u: 0.62, v: 0.14 },
      { u: 0.78, v: 0.14 },
      { u: 0.86, v: 0.162 },
    ], // straight pipes
  ],
};

function carProfile(bodyType: BodyType): CarProfile {
  switch (bodyType) {
    case 'coupe':
      return COUPE;
    case 'hatchback':
      return HATCHBACK;
    case 'estate':
      return ESTATE;
    case 'suv':
      return SUV;
    case 'pickup':
      return PICKUP;
    case 'van':
      return VAN;
    case 'roadster':
      return ROADSTER;
    case 'supercar':
      return SUPERCAR;
    case 'saloon':
      return SALOON;
    default:
      return SALOON;
  }
}

function bikeProfile(bodyType: BodyType): BikeProfile | null {
  if (bodyType === 'motorbike') return MOTORBIKE;
  if (bodyType === 'scooter') return SCOOTER;
  if (bodyType === 'cruiser') return CRUISER;
  return null;
}

type Wheel = { tyre: SkPath; hub: SkPath; origin: SkPoint };

type Geometry = {
  body: SkPath;
  detail: SkPath;
  wheels: Wheel[];
  ground: SkPath;
  stroke: number;
  hairline: number;
  blur: number;
};

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Independent interpolation of u and v — lets a control point sit "far up, barely along". */
const mix = (a: UV, b: UV, tu: number, tv: number): UV => ({
  u: a.u + (b.u - a.u) * tu,
  v: a.v + (b.v - a.v) * tv,
});

const lerpUV = (a: UV, b: UV, t: number): UV => mix(a, b, t, t);

/** Catmull-Rom through the points, emitted as cubics. */
function smooth(p: SkPath, pts: XY[], closed: boolean, tension = 1): void {
  const n = pts.length;
  if (n < 2) return;
  p.moveTo(pts[0].x, pts[0].y);
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = pts[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
    const p1 = pts[i % n];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[closed ? (i + 2) % n : Math.min(i + 2, n - 1)];
    p.cubicTo(
      p1.x + ((p2.x - p0.x) / 6) * tension,
      p1.y + ((p2.y - p0.y) / 6) * tension,
      p2.x - ((p3.x - p1.x) / 6) * tension,
      p2.y - ((p3.y - p1.y) / 6) * tension,
      p2.x,
      p2.y,
    );
  }
  if (closed) p.close();
}

/**
 * Arch the sill up and over a wheel. The arc is centred on the wheel, not on
 * the sill, so the tyre never pokes through it; we enter and leave at the two
 * points where that circle crosses the sill line.
 */
function archOverWheel(
  p: SkPath,
  cx: number,
  sillLineY: number,
  r: number,
  centreRise: number,
  leftToRight: boolean,
): void {
  const rise = clamp(centreRise, -r * 0.92, r * 0.92);
  const a = (Math.asin(rise / r) * 180) / Math.PI;
  const cy = sillLineY - rise;
  const oval = Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);
  p.arcToOval(oval, leftToRight ? 180 - a : a, leftToRight ? 180 + 2 * a : -(180 + 2 * a), false);
}

function buildCar(pf: CarProfile, size: number): Geometry {
  const L = Math.min(size * pf.fill, (size * 0.7) / pf.roofY);
  const x0 = (size - L) / 2;
  const groundY = (size + pf.roofY * L) / 2;
  // Nose faces right: u runs aft, screen x runs back toward the tail.
  const X = (u: number): number => x0 + (1 - u) * L;
  const Y = (v: number): number => groundY - v * L;
  const P = (q: UV): XY => ({ x: X(q.u), y: Y(q.v) });

  const noseBottom: UV = { u: 0, v: pf.sillY };
  const noseTop: UV = { u: pf.noseRake, v: pf.noseY };
  const cowl: UV = { u: pf.cowlX, v: pf.bonnetY };
  const roofF: UV = { u: pf.roofStart, v: pf.roofY };
  const roofR: UV = { u: pf.roofEnd, v: pf.roofY };
  const deck: UV = { u: pf.deckX, v: pf.bootY };
  const tailTop: UV = { u: 1 - pf.tailRake, v: pf.tailY };
  const tailBottom: UV = { u: 1, v: pf.sillY };

  const body = Skia.Path.Make();
  const start = P(noseBottom);
  body.moveTo(start.x, start.y);
  const nt = P(noseTop);
  body.lineTo(nt.x, nt.y);
  const bonnetC = P({
    u: (pf.noseRake + pf.cowlX) / 2,
    v: Math.max(pf.noseY, pf.bonnetY) + pf.bonnetCrown,
  });
  const cw = P(cowl);
  body.quadTo(bonnetC.x, bonnetC.y, cw.x, cw.y);
  // Steep off the cowl, flattening into the roof: control high in v, short in u.
  const screenC = P(mix(cowl, roofF, 0.34, 0.76));
  const rf = P(roofF);
  body.quadTo(screenC.x, screenC.y, rf.x, rf.y);
  const roofC = P({ u: (pf.roofStart + pf.roofEnd) / 2, v: pf.roofY + pf.roofCrown });
  const rr = P(roofR);
  body.quadTo(roofC.x, roofC.y, rr.x, rr.y);
  const lightC = P(mix(roofR, deck, 0.62, 0.26));
  const dk = P(deck);
  body.quadTo(lightC.x, lightC.y, dk.x, dk.y);
  const tt = P(tailTop);
  body.lineTo(tt.x, tt.y);
  const tb = P(tailBottom);
  body.lineTo(tb.x, tb.y);
  // Underside runs tail → nose, which is left → right once mirrored.
  const sillLineY = Y(pf.sillY);
  const archR = pf.wheelR * pf.archScale * L;
  const rise = (pf.wheelR - pf.sillY) * L;
  archOverWheel(body, X(pf.rearWheelX), sillLineY, archR, rise, true);
  archOverWheel(body, X(pf.frontWheelX), sillLineY, archR, rise, true);
  body.lineTo(start.x, start.y);
  body.close();

  // Greenhouse — corners walked along the screen and backlight chords so the
  // glass can never escape the body no matter how extreme a preset gets.
  const gi = 0.017;
  const screenChord = Math.hypot(pf.roofStart - pf.cowlX, pf.roofY - pf.bonnetY);
  const tScreen = clamp(
    (pf.beltY - pf.bonnetY) / Math.max(pf.roofY - pf.bonnetY, 1e-4) + gi / Math.max(screenChord, 1e-4),
    0.05,
    0.9,
  );
  const frontBottom: UV = { u: lerpUV(cowl, roofF, tScreen).u, v: pf.beltY };
  const frontTop: UV = { u: pf.roofStart + gi * 0.95, v: pf.roofY - gi * 0.85 };

  const lightChord = Math.hypot(pf.deckX - pf.roofEnd, pf.roofY - pf.bootY);
  const tLight = clamp(
    (pf.roofY - pf.beltY) / Math.max(pf.roofY - pf.bootY, 1e-4) - gi / Math.max(lightChord, 1e-4),
    0.06,
    0.94,
  );
  const lightAnchor = lerpUV(roofR, deck, tLight);
  const rearBottom: UV = {
    u: pf.glassEndX ?? lightAnchor.u,
    v: Math.min(pf.beltY, lightAnchor.v - gi * 0.4),
  };
  const rearTopU = Math.max(
    frontTop.u + 0.02,
    pf.glassEndX === undefined
      ? pf.roofEnd - gi * 0.95
      : Math.min(pf.roofEnd - gi * 0.95, pf.glassEndX - (pf.glassRake ?? 0.03)),
  );
  const rearTop: UV = { u: rearTopU, v: pf.roofY - gi * 0.85 };

  const detail = Skia.Path.Make();
  const g0 = P(frontBottom);
  detail.moveTo(g0.x, g0.y);
  const g0c = P(mix(frontBottom, frontTop, 0.34, 0.76));
  const g1 = P(frontTop);
  detail.quadTo(g0c.x, g0c.y, g1.x, g1.y);
  const g2 = P(rearTop);
  detail.lineTo(g2.x, g2.y);
  const g2c = P(mix(rearTop, rearBottom, 0.62, 0.26));
  const g3 = P(rearBottom);
  detail.quadTo(g2c.x, g2c.y, g3.x, g3.y);
  detail.close();
  if (pf.pillarX !== undefined && pf.pillarX > frontTop.u + 0.01 && pf.pillarX < rearTop.u - 0.01) {
    const b0 = P({ u: pf.pillarX, v: frontBottom.v });
    const b1 = P({ u: pf.pillarX, v: frontTop.v });
    detail.moveTo(b0.x, b0.y);
    detail.lineTo(b1.x, b1.y);
  }

  const wheels = [pf.frontWheelX, pf.rearWheelX].map((u) =>
    buildWheel(X(u), Y(pf.wheelR), pf.wheelR * L, 0.42),
  );

  return {
    body,
    detail,
    wheels,
    ground: buildGround(x0, groundY, L, size),
    ...weights(size),
  };
}

function buildBike(pf: BikeProfile, size: number): Geometry {
  const L = Math.min(size * pf.fill, (size * 0.7) / pf.topV);
  const x0 = (size - L) / 2;
  const groundY = (size + pf.topV * L) / 2;
  const X = (u: number): number => x0 + (1 - u) * L;
  const Y = (v: number): number => groundY - v * L;
  const P = (q: UV): XY => ({ x: X(q.u), y: Y(q.v) });

  const body = Skia.Path.Make();
  smooth(body, pf.outline.map(P), true, pf.tension);

  const detail = Skia.Path.Make();
  for (const line of pf.lines) smooth(detail, line.map(P), false, pf.tension);
  // Front mudguard: a symmetric cap over the front wheel.
  const gx = X(pf.frontWheelX);
  const gy = Y(pf.wheelR);
  const gr = pf.wheelR * pf.guardScale * L;
  detail.addArc(Skia.XYWHRect(gx - gr, gy - gr, gr * 2, gr * 2), 202, 136);
  if (pf.lamp) {
    const lamp = P(pf.lamp.at);
    detail.addCircle(lamp.x, lamp.y, pf.lamp.r * L);
  }

  const wheels = [pf.frontWheelX, pf.rearWheelX].map((u) =>
    buildWheel(X(u), Y(pf.wheelR), pf.wheelR * L, 0.3),
  );

  return {
    body,
    detail,
    wheels,
    ground: buildGround(x0, groundY, L, size),
    ...weights(size),
  };
}

function buildWheel(cx: number, cy: number, r: number, hubRatio: number): Wheel {
  const tyre = Skia.Path.Make();
  tyre.addCircle(cx, cy, r);
  const hub = Skia.Path.Make();
  hub.addCircle(cx, cy, r * hubRatio);
  return { tyre, hub, origin: vec(cx, cy) };
}

function buildGround(x0: number, groundY: number, L: number, size: number): SkPath {
  const p = Skia.Path.Make();
  const h = size * 0.026;
  p.addOval(Skia.XYWHRect(x0 + L * 0.03, groundY - h / 2, L * 0.94, h));
  return p;
}

function weights(size: number): { stroke: number; hairline: number; blur: number } {
  return { stroke: size * 0.022, hairline: size * 0.016, blur: size * 0.03 };
}

type Props = {
  bodyType: BodyType;
  /** Width in px; the silhouette renders inside a square of this size. */
  size: number;
  /** Replay the draw-on animation when this changes (e.g. new model picked). */
  revealKey?: string;
  color?: string;
};

export function CarSilhouette({
  bodyType,
  size,
  revealKey,
  color: stroke = color.accent,
}: Props): React.JSX.Element {
  const reduced = useReducedMotion();

  const geo = useMemo<Geometry | null>(() => {
    if (size <= 0) return null;
    const bike = bikeProfile(bodyType);
    return bike ? buildBike(bike, size) : buildCar(carProfile(bodyType), size);
  }, [bodyType, size]);

  const progress = useSharedValue(0);
  const wheelIn = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      wheelIn.value = 1;
      fade.value = withTiming(1, { duration: duration.base });
      return;
    }
    fade.value = withTiming(1, { duration: duration.fast });
    progress.value = 0;
    progress.value = withTiming(1, { duration: duration.slow, easing: easing.decel });
    wheelIn.value = 0;
    wheelIn.value = withDelay(Math.round(duration.slow * 0.42), withSpring(1, spring.bouncy));
  }, [revealKey, bodyType, reduced, progress, wheelIn, fade]);

  // Body leads, glass follows into the tail of the same sweep.
  const bodyEnd = useDerivedValue(() => Math.min(1, progress.value / 0.7));
  const detailEnd = useDerivedValue(() => clampW((progress.value - 0.38) / 0.62));
  const glowOpacity = useDerivedValue(() => 0.3 * Math.min(1, progress.value / 0.5));
  const fillOpacity = useDerivedValue(() => clampW((progress.value - 0.72) / 0.28) * 0.08);
  const groundOpacity = useDerivedValue(() => 0.18 * clampW(wheelIn.value));
  const wheelOpacity = useDerivedValue(() => clampW(wheelIn.value * 1.6));
  const wheelTransform = useDerivedValue(() => [{ scale: Math.max(0, wheelIn.value) }]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!geo) return <View style={{ width: size, height: size }} />;

  return (
    <Animated.View style={[{ width: size, height: size }, fadeStyle]}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={geo.ground} style="fill" color={stroke} opacity={groundOpacity}>
          <BlurMask blur={geo.blur} style="normal" />
        </Path>

        {/* glow copy beneath the line art, exactly as RoutePath does */}
        <Path
          path={geo.body}
          style="stroke"
          strokeWidth={geo.stroke * 1.9}
          strokeCap="round"
          strokeJoin="round"
          color={stroke}
          opacity={glowOpacity}
          start={0}
          end={bodyEnd}
        >
          <BlurMask blur={geo.blur} style="outer" />
        </Path>

        {/* body wash — only meaningful once the outline has closed */}
        <Path path={geo.body} style="fill" color={stroke} opacity={fillOpacity} />

        <Path
          path={geo.body}
          style="stroke"
          strokeWidth={geo.stroke}
          strokeCap="round"
          strokeJoin="round"
          color={stroke}
          start={0}
          end={bodyEnd}
        />

        <Path
          path={geo.detail}
          style="stroke"
          strokeWidth={geo.hairline}
          strokeCap="round"
          strokeJoin="round"
          color={stroke}
          opacity={0.72}
          start={0}
          end={detailEnd}
        />

        {geo.wheels.map((w, i) => (
          <Group key={i} transform={wheelTransform} origin={w.origin} opacity={wheelOpacity}>
            <Path
              path={w.tyre}
              style="stroke"
              strokeWidth={geo.stroke * 1.6}
              color={stroke}
              opacity={0.28}
            >
              <BlurMask blur={geo.blur * 0.8} style="outer" />
            </Path>
            <Path path={w.tyre} style="stroke" strokeWidth={geo.stroke} color={stroke} />
            <Path
              path={w.hub}
              style="stroke"
              strokeWidth={geo.hairline}
              color={stroke}
              opacity={0.6}
            />
          </Group>
        ))}
      </Canvas>
    </Animated.View>
  );
}

function clampW(n: number): number {
  'worklet';
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
