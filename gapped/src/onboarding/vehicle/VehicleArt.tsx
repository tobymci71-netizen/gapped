import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import type { VehicleKind } from '@/state/profile';
import { duration } from '@/theme/motion';
import { color, radius } from '@/theme/tokens';
import { VehicleRender } from '@/vehicles/art/VehicleRender';
import { inferBodyType } from '@/vehicles/bodyType';
import { cleanName } from './draft';
import { vehiclePhotoSource } from './vehiclePhoto';

/**
 * The window shape's height, as a fraction of its width: a side-on vehicle's
 * band, so the art sits in a layout at its visual height. The tallest body
 * (the van) fills it; a saloon leaves room above and below.
 */
const WINDOW_ASPECT = 0.52;

type Props = {
  kind: VehicleKind;
  make?: string | null;
  model?: string | null;
  /** The stored `vehiclePhotoUri`. When set (and readable) it replaces the render. */
  photoUri?: string | null;
  /** Width of the art, in points. */
  size: number;
  /**
   * `set`: the vehicle is chosen, in its paint. `idle`: a placeholder in the
   * muted grey, before anything is chosen.
   */
  tone?: 'set' | 'idle';
  /**
   * Square (the photo step's stage, garage thumbnails), which shows a photo
   * whole — the picker crops square — or the side-on window (inline art on
   * the proof step), where a photo fills the band.
   */
  shape?: 'square' | 'window';
  /** Corner radius for a photo; defaults to the card radius. */
  photoRadius?: number;
  /** VoiceOver label for a photo. The render is decorative and has none. */
  photoLabel?: string;
};

/**
 * The person's vehicle as a picture: their photo when they have added one,
 * otherwise its body type's rendered vehicle (VehicleRender), with its tail
 * lights lit once the vehicle is chosen.
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
  // falls back to the render instead of a blank square. Remembered per URI,
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
  const height = shape === 'square' ? size : Math.round(size * WINDOW_ASPECT);

  return (
    <View style={[styles.frame, { width: size, height }]}>
      {/*
        The crossfade is for a swap — a photo picked, a photo removed — not
        for the art's first appearance. Faded in on mount, the wrapper could
        stall part-way through when it mounted during a screen push, leaving
        the art at a third of its strength; VehicleRender already fades and
        settles in on mount.
      */}
      <LayoutAnimationConfig skipEntering>
        {showPhoto ? (
          <Animated.View
            key={source}
            entering={fade}
            exiting={FadeOut.duration(duration.fast)}
            // In the window shape the square photo is cropped to the window's
            // band by `cover`.
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
            key="render"
            entering={fade}
            exiting={FadeOut.duration(duration.fast)}
            style={[styles.render, { width: size, height }]}
          >
            {/*
              The body type's rendered vehicle, side on, nose right. Before a
              vehicle is chosen it is its render, dimmed, with its lights off;
              chosen, it is painted and its tail lights catch. It appears
              again when the body type changes, not on every keystroke of a
              name typed by hand.
            */}
            <VehicleRender
              bodyType={bodyType}
              view="side"
              width={size}
              height={height}
              tone={tone}
              lights={tone === 'set' ? 'on' : 'off'}
            />
          </Animated.View>
        )}
      </LayoutAnimationConfig>
    </View>
  );
}

const styles = StyleSheet.create({
  // Not clipped: a clip cut the tail light's glow off in a hard square at
  // the frame's side. The photo clips itself (photoWrap).
  frame: { alignItems: 'center' },
  render: { position: 'absolute', left: 0, top: 0 },
  photoWrap: { overflow: 'hidden', backgroundColor: color.surface2 },
  photo: { width: '100%', height: '100%' },
});
