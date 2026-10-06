import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { FilmGrain } from '@/components/brand/FilmGrain';
import { vehiclePhotoSource } from '@/onboarding/vehicle/vehiclePhoto';
import type { VehicleKind } from '@/state/profile';
import { color } from '@/theme/tokens';
import { VEHICLE_RENDERS } from '@/vehicles/art/manifest';
import { placeOnGround } from '@/vehicles/art/place';
import { VehicleRender } from '@/vehicles/art/VehicleRender';
import { inferBodyType } from '@/vehicles/bodyType';
import { GarageScene, SCENE_GROUND_Y, SCENE_H, SCENE_W } from './GarageScene';

/** The hero's height at the mockups' 390pt width; it scales with the width. */
const HERO_ASPECT = SCENE_H / SCENE_W;

/**
 * A render's scale in the bay, in design units per metre of the vehicle's
 * height (bikes a little larger, or they look lost in the bay), and the most
 * room it may take: the bay's width, and the roller door's height.
 */
const PX_PER_M = { car: 104, bike: 128 } as const;
const MAX_VEHICLE = { w: 250, h: 175 } as const;

type Props = {
  kind: VehicleKind | null;
  make: string | null;
  model: string | null;
  /** The stored vehiclePhotoUri. A readable photo replaces the render. */
  photoUri: string | null;
  /** Read to VoiceOver for a photo ("Your BMW M3"). The render is decorative. */
  photoLabel?: string;
  /** No vehicle at all: the bay stands empty. */
  empty?: boolean;
};

/**
 * The top of the Garage tab: the main vehicle in its bay. Its body type's
 * render stands from behind on the bay's floor, tail lights breathing
 * (VehicleRender; docs/VEHICLE_ART.md), car or bike alike. A photo the
 * driver chose in onboarding replaces it, graded into the night at both
 * edges; one that can no longer be read falls back to the render rather than
 * a blank.
 *
 * Full-bleed: give it the screen's width. Its height follows the width.
 */
export function GarageHero({ kind, make, model, photoUri, photoLabel, empty }: Props) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState<string | null>(null);
  const source = useMemo(() => (photoUri ? vehiclePhotoSource(photoUri) : null), [photoUri]);
  const showPhoto = !empty && !!source && failed !== source;
  const bike = kind === 'motorbike';

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.width || height !== box.height) setBox({ width, height });
  };

  const s = box.width / SCENE_W;

  // The rendered vehicle, from behind, tyres on the bay's floor.
  const bodyType = inferBodyType(bike ? 'motorbike' : 'car', make ?? '', model ?? '');
  const renders = empty ? undefined : VEHICLE_RENDERS[bodyType];
  const rear = renders?.views.rear;
  const placement =
    renders && rear && box.width > 0
      ? placeOnGround(rear, {
          cx: box.width / 2,
          // The scene is anchored to the hero's bottom edge (GarageScene).
          groundY: box.height - (SCENE_H - SCENE_GROUND_Y) * s,
          vehicleHeight: renders.sizeM[2] * (bike ? PX_PER_M.bike : PX_PER_M.car) * s,
          maxWidth: MAX_VEHICLE.w * s,
          maxHeight: MAX_VEHICLE.h * s,
        })
      : null;

  return (
    <View style={[styles.hero, { aspectRatio: 1 / HERO_ASPECT }]} onLayout={onLayout}>
      {showPhoto ? (
        <>
          <Image
            source={{ uri: source }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setFailed(source)}
            accessible
            accessibilityRole="image"
            accessibilityLabel={photoLabel}
          />
          <PhotoGrade />
        </>
      ) : (
        <>
          <GarageScene width={box.width} height={box.height} />
          {placement ? (
            <VehicleRender
              bodyType={bodyType}
              view="rear"
              width={box.width}
              height={box.height}
              placement={placement}
              lights="breathe"
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </>
      )}
      <FilmGrain opacity={0.08} />
    </View>
  );
}

/**
 * A photo is daylight in a night app: darken its top into the canvas the
 * title sits on and fade its foot into whatever follows, so it reads as a
 * frame from the same film. The middle, the car, is left alone.
 */
function PhotoGrade() {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id="garagePhotoGrade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color.canvas} stopOpacity={0.7} />
          <Stop offset="0.28" stopColor={color.canvas} stopOpacity={0} />
          <Stop offset="0.62" stopColor={color.canvas} stopOpacity={0} />
          <Stop offset="1" stopColor={color.canvas} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#garagePhotoGrade)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden' },
});
