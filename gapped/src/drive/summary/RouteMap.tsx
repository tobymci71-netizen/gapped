import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Points,
  RadialGradient,
  Rect,
  Skia,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { Text } from '@/components/Text';
import type { Fix } from '@/drive/types';
import type { UnitPref } from '@/drive/units';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { alpha, color, space } from '@/theme/tokens';
import {
  chevronFractions,
  cumulativeLengths,
  endsWhereItStarted,
  pointAlong,
  projectRoute,
  markerLabels,
  scaleBar,
  type LabelPlacement,
  type Pt,
} from './geometry';

/** The map's height (Nightrun-Summary's figure). */
export const ROUTE_MAP_HEIGHT = 260;

/*
 * Where the route may be drawn inside the map. The scale and north arrow sit
 * above ROUTE_TOP; the distance plate overlaps the map from about 200pt
 * down, so the route stops above it; the sides leave room for a marker's
 * label.
 */
const ROUTE_TOP = 46;
const ROUTE_BOTTOM = 194;
const ROUTE_SIDE = 34;

/** The top and bottom fades (the mock's mask: in over 26pt, out over the last 70). */
const FADE_IN = 26 / ROUTE_MAP_HEIGHT;
const FADE_OUT = 190 / ROUTE_MAP_HEIGHT;

/** The mockups' timings: the trail draws on, then a light runs round it. */
const DRAW_DELAY = 250;
const DRAW_MS = 2400;
const DRAW_EASING = Easing.bezier(0.45, 0, 0.2, 1);
const RUN_GAP = 150;
const RUN_MS = 6500;
/** The running light's length, and its white-hot head, as fractions of the route. */
const RUN_LEN = 0.06;
const RUN_CORE = 0.024;
/** Shorter than this (pt) and a running light or chevron would crowd the markers. */
const MIN_ANIMATED_LENGTH = 60;

/** The dot texture's pitch (pt): abstract, not a map. */
const DOT_PITCH = 12;

type Props = {
  /** The fixes to draw, in the order driven (routeFixes). */
  fixes: readonly Fix[];
  /** The full width of the screen: the map runs edge to edge. */
  width: number;
  unitPref: UnitPref;
  /** "19.8 miles", for VoiceOver's description of the map. */
  spokenDistance: string;
};

/**
 * The drive's route, drawn from its real fixes as a red light trail on a
 * dark, map-like ground (Nightrun-Summary).
 *
 * The ground is abstract — a fine dot texture and a grid ruled at the scale
 * bar's distance — and claims no roads, water or places: the only real thing
 * on it is the route. North is up, the scale is true (geometry.projectRoute),
 * and the scale bar is measured from the same projection.
 *
 * Motion: the trail draws on once, then a point of light runs round it in the
 * direction of travel, on the UI thread. The light stops while the screen is
 * not focused, and under Reduce Motion the map is its finished still: the
 * whole trail, no light.
 *
 * Two canvases, so the running light does not redraw the map: the lower one
 * repaints only while the trail draws on, the upper one holds just the light.
 */
export function RouteMap({ fixes, width, unitPref, spokenDistance }: Props) {
  const reduced = useReducedMotion();
  const focused = useIsFocused();

  const height = ROUTE_MAP_HEIGHT;
  const model = useMemo(() => {
    const height = ROUTE_MAP_HEIGHT;
    const projection = projectRoute(fixes, {
      x: ROUTE_SIDE,
      y: ROUTE_TOP,
      width: width - ROUTE_SIDE * 2,
      height: ROUTE_BOTTOM - ROUTE_TOP,
    });
    if (!projection) return null;
    const { points } = projection;
    const lengths = cumulativeLengths(points);
    const length = lengths[lengths.length - 1];
    const path = Skia.Path.Make();
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y);

    const bar = scaleBar(projection.pxPerMetre, unitPref);
    // The grid is ruled at the scale bar's distance (or twice or five times
    // it, so squares are never smaller than 36pt): every square is a real
    // measure of this map.
    const gridStep = bar
      ? bar.px * ([1, 2, 5].find((k) => bar.px * k >= 36) ?? 5)
      : 0;
    const grid = Skia.Path.Make();
    if (gridStep > 0) {
      const { x: cx, y: cy } = projection.centre;
      for (let x = cx % gridStep; x <= width; x += gridStep) {
        grid.moveTo(x, 0);
        grid.lineTo(x, height);
      }
      for (let y = cy % gridStep; y <= height; y += gridStep) {
        grid.moveTo(0, y);
        grid.lineTo(width, y);
      }
    }

    const dots = [];
    for (let y = 1; y < height; y += DOT_PITCH) {
      for (let x = 1; x < width; x += DOT_PITCH) dots.push(vec(x, y));
    }

    const chevron = Skia.Path.MakeFromSVGString('M-7 -3.5 L7 0 L-7 3.5 L-3 0 Z');
    const chevrons = chevronFractions(length).map((at) => ({ at, ...pointAlong(points, at, lengths) }));

    return {
      path,
      grid,
      dots,
      chevron,
      chevrons,
      length,
      start: points[0],
      end: points[points.length - 1],
      loop: endsWhereItStarted(fixes, projection.extentM),
      centre: projection.centre,
      bar,
    };
  }, [fixes, width, unitPref]);

  // Draw-on: once, as the screen opens. Under Reduce Motion, already drawn.
  const draw = useSharedValue(reduced ? 1 : 0);
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
    if (reduced) {
      draw.set(1);
      return;
    }
    draw.set(
      withDelay(DRAW_DELAY, withTiming(1, { duration: DRAW_MS, easing: DRAW_EASING })),
    );
    // Only on first open: the trail does not draw itself again on refocus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(draw);
      draw.set(1);
    }
  }, [reduced, draw]);

  // The running light: only while focused, with motion allowed, on a route
  // long enough to carry it.
  const run = useSharedValue(0);
  const live = focused && !reduced && model != null && model.length >= MIN_ANIMATED_LENGTH;
  useEffect(() => {
    if (!live) {
      cancelAnimation(run);
      run.set(0);
      return;
    }
    // After the trail has drawn on, the first time; straight away on refocus.
    const elapsed = Date.now() - openedAt.current;
    const wait = Math.max(0, DRAW_DELAY + DRAW_MS + RUN_GAP - elapsed);
    run.set(0);
    run.set(
      withDelay(
        wait,
        withRepeat(withTiming(1, { duration: RUN_MS, easing: Easing.linear }), -1, false),
      ),
    );
    return () => cancelAnimation(run);
  }, [live, run]);

  if (!model) return null;

  const { bar, start, end, loop } = model;
  const labels = markerLabels(start, loop ? null : end);
  // "a loop of 19.8 miles", not "a 19.8 miles loop".
  const describe = `Route map, north up: ${
    loop
      ? `a loop of ${spokenDistance}, starting and finishing at the same point`
      : `${spokenDistance} from start to finish`
  }.${bar ? ` Scale bar, ${bar.spoken}.` : ''}`;

  return (
    <View
      style={{ width, height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={describe}
    >
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {/*
          A layer the fade is cut out of. This was a <Mask mode="alpha">, which
          drew nothing at all on device: the summary's route, markers and
          ground were all invisible, only the running light (drawn outside it)
          showed. dstIn keeps the layer only where the gradient is opaque.
        */}
        <Group layer>
          {/* The ground: a night panel with a fine dot texture and the scale grid. */}
          <Rect x={0} y={0} width={width} height={height} color={alpha(color.surface1, 0.8)} />
          <Points
            points={model.dots}
            mode="points"
            color={alpha(color.text1, 0.05)}
            strokeWidth={1.4}
            strokeCap="round"
          />
          <Path path={model.grid} style="stroke" strokeWidth={1} color={alpha(color.hairline, 0.45)} />
          {/* The light the trail throws on the ground around it. */}
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient
              c={vec(model.centre.x, model.centre.y)}
              r={Math.max(width, height) * 0.5}
              colors={[alpha(color.accent, 0.09), alpha(color.accent, 0)]}
            />
          </Rect>

          {/* The whole route, unlit, for the trail to draw along. */}
          <Path
            path={model.path}
            style="stroke"
            strokeWidth={4.5}
            strokeCap="round"
            strokeJoin="round"
            color={color.surface3}
          />
          <Trail path={model.path} draw={draw} />
          {model.length >= MIN_ANIMATED_LENGTH
            ? model.chevrons.map((c) => (
                <Chevron key={c.at} path={model.chevron} at={c.at} x={c.x} y={c.y} angle={c.angle} draw={draw} />
              ))
            : null}
          <Marker at={start} kind="start" />
          {loop ? null : <Marker at={end} kind="finish" />}
          {/* The top and bottom fades (the mock's mask). */}
          <Rect x={0} y={0} width={width} height={height} blendMode="dstIn">
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, height)}
              positions={[0, FADE_IN, FADE_OUT, 1]}
              colors={[
                alpha(color.canvas, 0),
                color.canvas,
                color.canvas,
                alpha(color.canvas, 0),
              ]}
            />
          </Rect>
        </Group>
      </Canvas>

      {live ? <RunningLight path={model.path} run={run} width={width} height={height} /> : null}

      <MarkerLabel
        at={start}
        place={labels.start}
        label={loop ? 'Start · finish' : 'Start'}
        width={width}
      />
      {loop ? null : <MarkerLabel at={end} place={labels.finish} label="Finish" width={width} />}
      {bar ? <ScaleCluster barPx={bar.px} label={bar.label} /> : null}
    </View>
  );
}

/** The lit trail: a soft red halo, the red line, and its white-hot core. */
function Trail({ path, draw }: { path: SkPath; draw: SharedValue<number> }) {
  return (
    <Group>
      <Path
        path={path}
        style="stroke"
        strokeWidth={8}
        strokeCap="round"
        strokeJoin="round"
        color={color.accent}
        opacity={0.4}
        start={0}
        end={draw}
      >
        <BlurMask blur={5} style="normal" />
      </Path>
      <Path
        path={path}
        style="stroke"
        strokeWidth={2.6}
        strokeCap="round"
        strokeJoin="round"
        color={color.accent}
        start={0}
        end={draw}
      />
      <Path
        path={path}
        style="stroke"
        strokeWidth={1.1}
        strokeCap="round"
        strokeJoin="round"
        color={color.accentCore}
        start={0}
        end={draw}
      />
    </Group>
  );
}

/** A direction-of-travel chevron, lit once the trail has drawn past it. */
function Chevron({
  path,
  at,
  x,
  y,
  angle,
  draw,
}: {
  path: SkPath | null;
  at: number;
  x: number;
  y: number;
  angle: number;
  draw: SharedValue<number>;
}) {
  const opacity = useDerivedValue(() => Math.max(0, Math.min(1, (draw.get() - at) * 25)));
  if (!path) return null;
  return (
    <Group
      opacity={opacity}
      transform={[{ translateX: x }, { translateY: y }, { rotate: (angle * Math.PI) / 180 }]}
    >
      <Path path={path} color={color.text1} />
    </Group>
  );
}

/** Start: a ring with a lit centre. Finish (when apart): a solid white disc. */
function Marker({ at, kind }: { at: Pt; kind: 'start' | 'finish' }) {
  if (kind === 'finish') {
    return (
      <Group>
        <Circle cx={at.x} cy={at.y} r={6} color={color.canvas} />
        <Circle cx={at.x} cy={at.y} r={4.6} color={color.text1} />
      </Group>
    );
  }
  return (
    <Group>
      <Circle cx={at.x} cy={at.y} r={7.5} color={color.canvas} />
      <Circle cx={at.x} cy={at.y} r={7.5} style="stroke" strokeWidth={1.6} color={color.text1} />
      <Circle cx={at.x} cy={at.y} r={2.6} color={color.text1} />
    </Group>
  );
}

/**
 * The point of light running the route: a hot red smear with a white head,
 * fading in as it sets off and out as it arrives.
 */
function RunningLight({
  path,
  run,
  width,
  height,
}: {
  path: SkPath;
  run: SharedValue<number>;
  width: number;
  height: number;
}) {
  const head = useDerivedValue(() => run.get() * (1 + RUN_LEN));
  const tail = useDerivedValue(() => Math.max(0, Math.min(1, head.get() - RUN_LEN)));
  const coreTail = useDerivedValue(() => Math.max(0, Math.min(1, head.get() - RUN_CORE)));
  const front = useDerivedValue(() => Math.min(1, head.get()));
  const opacity = useDerivedValue(() => {
    const r = run.get();
    if (r <= 0) return 0;
    if (r < 0.05) return r / 0.05;
    if (r > 0.92) return Math.max(0, (1 - r) / 0.08);
    return 1;
  });
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Group opacity={opacity}>
        <Path
          path={path}
          style="stroke"
          strokeWidth={7}
          strokeJoin="round"
          color={color.accentHot}
          start={tail}
          end={front}
        >
          <BlurMask blur={5} style="normal" />
        </Path>
        <Path
          path={path}
          style="stroke"
          strokeWidth={2.2}
          strokeJoin="round"
          color={color.text1}
          start={coreTail}
          end={front}
        />
      </Group>
    </Canvas>
  );
}

const LABEL_GAP = 13;
const LABEL_H = 14;

/** A marker's mono label, beside it on the side markerLabels chose. */
function MarkerLabel({
  at,
  place,
  label,
  width,
}: {
  at: Pt;
  place: LabelPlacement;
  label: string;
  width: number;
}) {
  return (
    <Text
      variant="monoSmall"
      numberOfLines={1}
      maxFontSizeMultiplier={1.2}
      style={[
        styles.markerLabel,
        { top: at.y + place.dy - LABEL_H / 2 },
        place.side === 'left'
          ? { right: width - (at.x - LABEL_GAP), textAlign: 'right' }
          : { left: at.x + LABEL_GAP },
      ]}
    >
      {label}
    </Text>
  );
}

/** The scale bar and north arrow, top right, above the route. */
function ScaleCluster({ barPx, label }: { barPx: number; label: string }) {
  return (
    <View style={styles.cluster} pointerEvents="none">
      <View style={styles.scale}>
        <Text variant="monoSmall" maxFontSizeMultiplier={1.2} numberOfLines={1}>
          {label}
        </Text>
        <View style={[styles.bar, { width: barPx }]} />
      </View>
      <View style={styles.north}>
        <Svg width={10} height={11} viewBox="0 0 8 10">
          <SvgPath d="M4 0 L8 10 L4 7.5 L0 10 Z" fill={color.text3} />
        </Svg>
        <Text variant="monoSmall" maxFontSizeMultiplier={1.2}>
          N
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  markerLabel: { position: 'absolute', color: color.text2 },
  cluster: {
    position: 'absolute',
    top: space.sm,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  scale: { alignItems: 'flex-end', gap: 3 },
  // The bar: a bracket open at the top, ticks at both ends.
  bar: {
    height: 5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.text3,
  },
  north: { alignItems: 'center', gap: 1 },
});
