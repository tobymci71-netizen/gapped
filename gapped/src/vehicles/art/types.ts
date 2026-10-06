import type { BodyType } from '../bodyType';

/**
 * A bundled image: what `require('…webp')` returns in React Native, an asset
 * id both <Image source> and Skia's useImage accept.
 */
export type BundledImage = number;

/**
 * The camera a render was made from (docs/VEHICLE_ART.md, "Views"):
 * side, nose to the right; rear, square on from behind; rear34, behind and
 * to one side.
 */
export type RenderView = 'side' | 'rear' | 'rear34';

/** A box in an image's pixels: [x, y, width, height], from the top left. */
export type PxBox = readonly [number, number, number, number];

export type ViewRender = {
  /** The lit vehicle with its contact shadow, on transparent. */
  body: BundledImage;
  /** The tail lights alone with their bloom, layered over `body`. */
  lights: BundledImage;
  /** The same two at a third of the size, for thumbnails and avatars. */
  bodySmall: BundledImage;
  lightsSmall: BundledImage;
  /** The full-size image's pixel size. Every box below is in these pixels. */
  w: number;
  h: number;
  /** The vehicle's own extent in the image (the shadow and glow excluded). */
  box: PxBox;
  /** Where the tyres meet the road, in image pixels from the top. */
  groundY: number;
  /** The tail lights' centres in image pixels, left to right as seen. */
  tailLights: readonly (readonly [number, number])[];
};

export type BodyRenders = {
  /** The paint's name, for the record ("Racing green"). Never shown as a brand. */
  paint: string;
  /** The vehicle's size in metres: length, width, height. */
  sizeM: readonly [number, number, number];
  views: Record<RenderView, ViewRender>;
};

export type RenderManifest = Record<BodyType, BodyRenders>;
