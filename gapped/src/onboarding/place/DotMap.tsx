import { Canvas, Points, vec } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { color } from '@/theme/tokens';
import { dotCentres, fitDots, type CountryDots } from './countryDots';

type Props = {
  dots: CountryDots;
  width: number;
  height: number;
  /** The main landmass. Lime by default. */
  mainColor?: string;
  /** Near land, the islands. accentDim by default: the same lime, stepped down. */
  nearColor?: string;
};

/**
 * A dotted map, drawn with Skia: two point-list draws, one per colour, each a
 * single call however many dots it holds (up to ~1,400 for a square country).
 * A round stroke cap on a zero-length point is a filled circle, so every dot
 * is a true circle at any density without building a path per dot.
 *
 * Layout is computed once per [map, size] — nothing allocates per frame, and
 * nothing here animates: the step crossfades whole maps around it.
 *
 * Decorative to assistive tech by itself; the caller labels the box it sits
 * in ("Map of Italy").
 */
export function DotMap({
  dots,
  width,
  height,
  mainColor = color.accent,
  nearColor = color.accentDim,
}: Props) {
  const drawn = useMemo(() => {
    const layout = fitDots(dots.cols, dots.rows, width, height);
    const points = (cells: readonly number[]) =>
      dotCentres(cells, dots.cols, layout).map((p) => vec(p.x, p.y));
    return { diameter: layout.radius * 2, main: points(dots.main), near: points(dots.near) };
  }, [dots, width, height]);

  if (width <= 0 || height <= 0) return null;

  return (
    <Canvas style={{ width, height }}>
      {drawn.near.length > 0 ? (
        <Points
          points={drawn.near}
          mode="points"
          color={nearColor}
          style="stroke"
          strokeWidth={drawn.diameter}
          strokeCap="round"
        />
      ) : null}
      <Points
        points={drawn.main}
        mode="points"
        color={mainColor}
        style="stroke"
        strokeWidth={drawn.diameter}
        strokeCap="round"
      />
    </Canvas>
  );
}
