import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import type { BundledImage } from './types';

/**
 * Render images decoded for Skia, kept for the app's life, so a scene that
 * mounts again (a tab revisited, the welcome carousel re-entered) draws its
 * vehicle in its first frame instead of popping it in a frame or two later.
 * There are only a few renders, a few hundred KB each decoded at most.
 */
const decoded = new Map<BundledImage, SkImage>();
const pending = new Map<BundledImage, Promise<SkImage | null>>();

function decode(source: BundledImage): Promise<SkImage | null> {
  const known = pending.get(source);
  if (known) return known;
  const { uri } = Image.resolveAssetSource(source);
  const p = Skia.Data.fromURI(uri)
    .then((data) => Skia.Image.MakeImageFromEncoded(data))
    .catch(() => null)
    .then((image) => {
      if (image) decoded.set(source, image);
      // A failed decode is forgotten, so the next mount tries again.
      else pending.delete(source);
      return image;
    });
  pending.set(source, p);
  return p;
}

/**
 * A bundled render as a Skia image: at once if it has been decoded before,
 * otherwise null until it has. Always the image for `source`, never the one
 * before it while a new one decodes.
 */
export function useRenderImage(source: BundledImage | null): SkImage | null {
  const [, setDecoded] = useState(0);
  const image = source == null ? null : (decoded.get(source) ?? null);
  useEffect(() => {
    if (source == null || image) return;
    // Waits on the decode under way, or the one another scene started: it
    // may even have finished between this render and this effect.
    let live = true;
    decode(source).then(() => {
      if (live) setDecoded((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [source, image]);
  return image;
}
