import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig } from 'react-native-reanimated';
import { CarSilhouette } from '@/components/CarSilhouette';
import { useReducedMotion } from '@/lib/useReducedMotion';
import type { VehicleKind } from '@/state/profile';
import { duration } from '@/theme/motion';
import { color, radius } from '@/theme/tokens';
import { inferBodyType } from '@/vehicles/bodyType';
import { cleanName } from './draft';
import { vehiclePhotoSource } from './vehiclePhoto';

/**
 * How much of CarSilhouette's square the drawing actually uses. The generator
 * centres every body in a square and the tallest preset (the scooter) fills
 * 0.41 of it, a saloon about 0.27; the rest is empty canvas. Cropping to this
 * window lets a silhouette sit in a layout at its visual height instead of
 * pushing everything under it down by a car's worth of nothing. The extra over
 * 0.41 is the glow's blur.
 */
const SILHOUETTE_WINDOW = 0.52;

/**
 * The drawing's size inside a square frame, as a fraction of the frame. A
 * body fills 0.88 of its own canvas, which in a frame the size of the canvas
 * put the bumpers against the border; this leaves the margin a photo's crop
 * would.
 */
const SQUARE_ART_SCALE = 0.84;

type Props = {
  kind: VehicleKind;
  make?: string | null;
  model?: string | null;
  /** The stored `vehiclePhotoUri`. When set (and readable) it replaces the drawing. */
  photoUri?: string | null;
  /** Width of the art, in points. */
  size: number;
  /**
   * `set`: the vehicle is chosen, drawn white. `idle`: a placeholder in the
   * muted grey, before anything is chosen.
   */
  tone?: 'set' | 'idle';
  /**
   * Square (the photo step's stage, garage thumbnails), which shows a photo
   * whole — the picker crops square — or the cropped silhouette window
   * (inline art on the proof step), where a photo fills the band.
   */
  shape?: 'square' | 'window';
  /** Corner radius for a photo; defaults to the card radius. */
  photoRadius?: number;
  /** VoiceOver label for a photo. The drawing is decorative and has none. */
  photoLabel?: string;
};

/**
 * The person's vehicle as a picture: their photo when they have added one,
 * otherwise the parametric silhouette for its body type, in white line art
 * with its tail light lit once the vehicle is chosen — the one red on it,
 * because it is the one light.
 */
export function VehicleArt({
  kind,
  make,
  model,
  photoUri,
  size,
  tone = 'set',
  shape = 'window',
  photoRadius = radius.card,
  photoLabel,
}: Props) {
  const reduced = useReducedMotion();
  // A photo whose file has gone (restored to a new phone, cleared by hand)
  // falls back to the drawing instead of a blank square. Remembered per URI,
  // so picking a new photo gets its own chance to load.
  const [failed, setFailed] = useState<string | null>(null);
  const source = useMemo(() => (photoUri ? vehiclePhotoSource(photoUri) : null), [photoUri]);
  const showPhoto = !!source && failed !== source;

  const m = cleanName(make);
  const mo = cleanName(model);
  const bodyType = useMemo(
    () => (m && mo ? inferBodyType(kind, m, mo) : kind === 'motorbike' ? 'motorbike' : 'saloon'),
    [kind, m, mo],
  );

  const fade = reduced ? FadeIn.duration(duration.fast) : FadeIn.duration(duration.base);
  const height = shape === 'square' ? size : Math.round(size * SILHOUETTE_WINDOW);
  const art = shape === 'square' ? Math.round(size * SQUARE_ART_SCALE) : size;

  return (
    <View style={[styles.frame, { width: size, height }]}>
      {/*
        The crossfade is for a swap — a photo picked, a photo removed — not
        for the art's first appearance. Faded in on mount, the wrapper could
        stall part-way through when it mounted during a screen push, leaving
        the drawing at a third of its strength; CarSilhouette already fades
        and draws itself in on mount.
      */}
      <LayoutAnimationConfig skipEntering>
        {showPhoto ? (
          <Animated.View
            key={source}
            entering={fade}
            exiting={FadeOut.duration(duration.fast)}
            // In the window shape the square photo is cropped to the window's
            // band by `cover`, the way the silhouette's empty canvas is.
            style={[styles.photoWrap, { width: size, height, borderRadius: photoRadius }]}
          >
            <Image
              source={{ uri: source }}
              style={styles.photo}
              resizeMode="cover"
              onError={() => setFailed(source)}
              accessible={!!photoLabel}
              accessibilityRole="image"
              accessibilityLabel={photoLabel}
            />
          </Animated.View>
        ) : (
          <Animated.View
            key="silhouette"
            entering={fade}
            exiting={FadeOut.duration(duration.fast)}
            style={[styles.silhouette, { top: (height - art) / 2 }]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <CarSilhouette
              bodyType={bodyType}
              size={art}
              // Redrawn when the shape or its state changes, not on every
              // change of name: typed into "Not listed? Add it yourself", a
              // name-keyed drawing replayed its draw-on with each keystroke.
              revealKey={`${bodyType}:${tone}`}
              color={tone === 'set' ? color.text1 : color.text3}
              // A chosen vehicle is the person's own, ready to drive: its
              // tail light is on. The placeholder stays dark.
              lit={tone === 'set'}
            />
          </Animated.View>
        )}
      </LayoutAnimationConfig>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clips the silhouette's empty canvas, never the drawing (see the window).
  frame: { overflow: 'hidden', alignItems: 'center' },
  silhouette: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  photoWrap: { overflow: 'hidden', backgroundColor: color.surface2 },
  photo: { width: '100%', height: '100%' },
});
