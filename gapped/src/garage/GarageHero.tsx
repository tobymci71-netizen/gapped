import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { FilmGrain } from '@/components/brand/FilmGrain';
import { CarSilhouette } from '@/components/CarSilhouette';
import { vehiclePhotoSource } from '@/onboarding/vehicle/vehiclePhoto';
import type { VehicleKind } from '@/state/profile';
import { color } from '@/theme/tokens';
import { inferBodyType } from '@/vehicles/bodyType';
import { GarageScene, SCENE_GROUND_Y, SCENE_H, SCENE_W } from './GarageScene';

/** The hero's height at the mockups' 390pt width; it scales with the width. */
const HERO_ASPECT = SCENE_H / SCENE_W;

/**
 * Where a side-profile silhouette's ground line sits in its square
 * (CarSilhouette centres the body; a bike's wheels touch about here).
 */
const SILHOUETTE_GROUND = 0.68;

type Props = {
  kind: VehicleKind | null;
  make: string | null;
  model: string | null;
  /** The stored vehiclePhotoUri. A readable photo replaces the drawing. */
  photoUri: string | null;
  /** Read to VoiceOver for a photo ("Your BMW M3"). Drawings are decorative. */
  photoLabel?: string;
  /** No vehicle at all: the bay stands empty. */
  empty?: boolean;
};

/**
 * The top of the Garage tab: the main vehicle in its bay. A car is drawn from
 * behind, parked with its lights on (GarageScene). A bike is its own side
 * profile on the same floor, rim-lit by the strip light rather than red: it
 * has no pair of lamps to light. A photo the driver chose in onboarding
 * replaces the drawing, graded into the night at both edges; one that can no
 * longer be read falls back to the drawing rather than a blank.
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
  const bikeSize = Math.round(250 * s);
  const bikeTop = box.height - (SCENE_H - SCENE_GROUND_Y) * s - bikeSize * SILHOUETTE_GROUND;

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
          <GarageScene width={box.width} height={box.height} car={!empty && !bike} />
          {!empty && bike && box.width > 0 ? (
            <View
              style={[styles.bike, { top: bikeTop, left: (box.width - bikeSize) / 2 }]}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <CarSilhouette
                bodyType={inferBodyType('motorbike', make ?? '', model ?? '')}
                size={bikeSize}
                revealKey={`${make ?? ''} ${model ?? ''}`}
                color={color.text2}
              />
            </View>
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
  bike: { position: 'absolute' },
});
