import { BlurMask, Canvas, Path, Skia } from '@shopify/react-native-skia';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { deriveSpeeds } from '@/drive/stats';
import { Fix } from '@/drive/types';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing } from '@/theme/motion';
import { color } from '@/theme/tokens';

/**
 * Route rendering (spec §A4): the polyline draws on with an animated path
 * trim over duration.epic; beneath it sits a blurred glow copy at 30%
 * opacity. Speed colouring is a two-stop ramp — surface-3 at slow → accent
 * at fast, never a rainbow. Implemented as 5 speed-bucket layers that fade
 * in after the draw-on completes.
 */

const BUCKETS = 5;

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return (
    '#' +
    pa
      .map((v, i) =>
        Math.round(v + (pb[i] - v) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

type Props = {
  fixes: Fix[];
  width: number;
  height: number;
  /** Replay: draw-on progress 0..1 controlled externally; default animates once. */
  animate?: boolean;
};

export function RoutePath({ fixes, width, height, animate = true }: Props) {
  const reduced = useReducedMotion();

  const { basePath, bucketPaths } = useMemo(() => {
    if (fixes.length < 2) return { basePath: null, bucketPaths: [] as ReturnType<typeof buildBuckets> };

    const lats = fixes.map((f) => f.lat);
    const lons = fixes.map((f) => f.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const pad = 14;
    // preserve aspect: fit the bounding box into the canvas
    const latSpan = Math.max(maxLat - minLat, 1e-6);
    const lonSpan = Math.max(maxLon - minLon, 1e-6);
    const scale = Math.min((width - pad * 2) / lonSpan, (height - pad * 2) / latSpan);
    const ox = (width - lonSpan * scale) / 2;
    const oy = (height - latSpan * scale) / 2;
    const toXY = (f: Fix): [number, number] => [
      ox + (f.lon - minLon) * scale,
      height - (oy + (f.lat - minLat) * scale), // lat grows north = up
    ];

    const base = Skia.Path.Make();
    const pts = fixes.map(toXY);
    base.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) base.lineTo(pts[i][0], pts[i][1]);

    function buildBuckets() {
      const speeds = deriveSpeeds(fixes);
      const vMax = Math.max(...speeds, 0.1);
      const paths = Array.from({ length: BUCKETS }, () => Skia.Path.Make());
      for (let i = 1; i < pts.length; i++) {
        const frac = speeds[i] / vMax;
        const b = Math.min(BUCKETS - 1, Math.floor(frac * BUCKETS));
        paths[b].moveTo(pts[i - 1][0], pts[i - 1][1]);
        paths[b].lineTo(pts[i][0], pts[i][1]);
      }
      return paths.map((p, b) => ({
        path: p,
        color: mixHex(color.surface3, color.accent, b / (BUCKETS - 1)),
      }));
    }

    return { basePath: base, bucketPaths: buildBuckets() };
  }, [fixes, width, height]);

  const trim = useSharedValue(0);
  const bucketsOpacity = useSharedValue(0);

  useEffect(() => {
    if (!animate || reduced) {
      trim.value = 1;
      bucketsOpacity.value = withTiming(1, { duration: duration.fast });
      return;
    }
    trim.value = withTiming(1, { duration: duration.epic, easing: easing.decel });
    bucketsOpacity.value = withDelay(
      duration.epic,
      withTiming(1, { duration: duration.base }),
    );
  }, [animate, reduced, trim, bucketsOpacity]);

  const bucketsStyle = useAnimatedStyle(() => ({ opacity: bucketsOpacity.value }));

  if (!basePath) return <View style={{ width, height }} />;

  return (
    <View style={{ width, height }}>
      <Canvas style={{ width, height, position: 'absolute' }}>
        {/* trail glow beneath the main stroke */}
        <Path
          path={basePath}
          style="stroke"
          strokeWidth={7}
          strokeCap="round"
          strokeJoin="round"
          color={color.accent}
          opacity={0.3}
          start={0}
          end={trim}
        >
          <BlurMask blur={8} style="outer" />
        </Path>
        {/* draw-on stroke */}
        <Path
          path={basePath}
          style="stroke"
          strokeWidth={3.5}
          strokeCap="round"
          strokeJoin="round"
          color={color.accent}
          start={0}
          end={trim}
        />
      </Canvas>
      {/* speed-coloured layers fade in once drawn */}
      <Animated.View style={[{ width, height, position: 'absolute' }, bucketsStyle]}>
        <Canvas style={{ width, height }}>
          {bucketPaths.map((b, i) => (
            <Path
              key={i}
              path={b.path}
              style="stroke"
              strokeWidth={3.5}
              strokeCap="round"
              strokeJoin="round"
              color={b.color}
            />
          ))}
        </Canvas>
      </Animated.View>
    </View>
  );
}
