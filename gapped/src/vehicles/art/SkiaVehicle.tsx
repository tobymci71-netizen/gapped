import {
  BlurMask,
  Group,
  Image,
  LinearGradient,
  Rect,
  vec,
  type SkImage,
  type Transforms3d,
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { alpha, color } from '@/theme/tokens';
import type { BodyType } from '../bodyType';
import { VEHICLE_RENDERS } from './manifest';
import { boxToPoints, placeOnGround, pointToPoints, type Placement } from './place';
import { useRenderImage } from './skiaImages';
import type { RenderView } from './types';

type Animated<T> = T | SharedValue<T>;

/** Where a vehicle stands in a canvas, in the canvas's own units. */
export type GroundSpot = {
  /** The centre of the vehicle's width. */
  cx: number;
  /** Where its tyres meet the ground. */
  groundY: number;
  /** Units per metre of the vehicle's real height: a van stands taller than a hatchback. */
  perMetre: number;
  /** The most room it may take; a cap shrinks it, still on the ground. */
  maxWidth?: number;
  maxHeight?: number;
};

/** A body type's render, loaded and placed in a Skia canvas. */
export type SkiaVehicle = {
  body: SkImage;
  lights: SkImage | null;
  place: Placement;
  /** The vehicle's own extent (no shadow, no glow), in the canvas's units. */
  box: { x: number; y: number; w: number; h: number };
  /** Its tail lights' centres, left to right, in the canvas's units. */
  tailLights: { x: number; y: number }[];
};

/**
 * Loads a body type's render for a Skia canvas and stands it at `spot`.
 * Null until its image has decoded, the first time only (useRenderImage keeps
 * it): draw nothing, not a stand-in. A bundled image decodes from the app
 * itself, so it is never missing for long.
 */
export function useSkiaVehicle(
  bodyType: BodyType,
  view: RenderView,
  spot: GroundSpot,
): SkiaVehicle | null {
  const renders = VEHICLE_RENDERS[bodyType];
  const r = renders?.views[view];
  const body = useRenderImage(r ? r.body : null);
  const lights = useRenderImage(r ? r.lights : null);
  const { cx, groundY, perMetre, maxWidth, maxHeight } = spot;
  return useMemo(() => {
    if (!renders || !r || !body) return null;
    const place = placeOnGround(r, {
      cx,
      groundY,
      vehicleHeight: renders.sizeM[2] * perMetre,
      maxWidth,
      maxHeight,
    });
    return {
      body,
      lights,
      place,
      box: boxToPoints(place, r.box),
      tailLights: r.tailLights.map((pt) => pointToPoints(place, pt)),
    };
  }, [renders, r, body, lights, cx, groundY, perMetre, maxWidth, maxHeight]);
}

type Props = {
  vehicle: SkiaVehicle;
  /** The tail lights' layer: 0 off, 1 on (an ignite or a breathe drives it). */
  lit?: Animated<number>;
  /**
   * The anamorphic red streak a camera draws through a bright light at
   * night, 0 to 1. Omit for none.
   */
  streak?: Animated<number>;
  /** A transform for the whole vehicle about `rollOrigin`: the cornering demo's lean. */
  roll?: Animated<Transforms3d>;
  rollOrigin?: { x: number; y: number };
};

/**
 * A rendered vehicle in a Skia canvas: the body, its tail lights on their own
 * layer, and optionally the camera's streak through them. Red is light: the
 * streak and the lights are the only red that glows.
 */
export function SkiaVehicleImage({ vehicle, lit = 1, streak, roll, rollOrigin }: Props) {
  const { body, lights, place, box, tailLights } = vehicle;
  const image = { x: place.left, y: place.top, width: place.width, height: place.height };
  const streakW = box.w * 0.9;
  const streakH = Math.max(1.5, box.h * 0.025);
  // Skia 2.x restores the canvas after any group with an origin, but saves it
  // only when there is a transform, a clip or a layer too: an origin alone
  // pops the PARENT's save, and everything drawn after it loses the parent's
  // transform. So no roll, no origin.
  const origin = roll && rollOrigin ? vec(rollOrigin.x, rollOrigin.y) : undefined;
  return (
    <Group transform={roll} origin={origin}>
      <Image image={body} {...image} fit="fill" />
      {lights ? (
        <Group opacity={lit}>
          <Image image={lights} {...image} fit="fill" />
          {streak !== undefined ? (
            <Group opacity={streak}>
              {tailLights.map((p) => (
                <Rect
                  key={`${p.x},${p.y}`}
                  x={p.x - streakW / 2}
                  y={p.y - streakH / 2}
                  width={streakW}
                  height={streakH}
                >
                  <LinearGradient
                    start={vec(p.x - streakW / 2, 0)}
                    end={vec(p.x + streakW / 2, 0)}
                    colors={[alpha(color.accent, 0), color.accentHot, alpha(color.accent, 0)]}
                    positions={[0, 0.5, 1]}
                  />
                  <BlurMask blur={streakH * 0.6} style="normal" />
                </Rect>
              ))}
            </Group>
          ) : null}
        </Group>
      ) : null}
    </Group>
  );
}
