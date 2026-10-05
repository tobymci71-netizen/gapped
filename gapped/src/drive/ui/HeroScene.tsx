import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Path,
  PathOp,
  RadialGradient,
  Rect,
  RoundedRect,
  Skia,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGradient, Rect as SvgRect, Stop } from 'react-native-svg';
import { FilmGrain } from '@/components/brand/FilmGrain';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { ambient } from '@/theme/motion';
import { alpha, color } from '@/theme/tokens';
import {
  ART_WIDTH,
  BAY_BOX,
  BAYS,
  BIKE,
  CAR,
  CITY_GLOW,
  CONE,
  CONE_BOX,
  CRANE,
  CRANE_TIP,
  FADE,
  FAR_CITY,
  GROUND_END,
  GROUND_TOP,
  HAZE,
  LIGHTS_BOX,
  NEAR_CITY,
  POOL,
  RAIN_BOX,
  RAIN_FADE,
  RAIN_TILE,
  rainPath,
  SKY_BOTTOM,
  STAGE_TOP,
  WARNING_LIGHT,
  WINDOW_SIZE,
  WINDOWS,
  type Ellipse,
  type VehicleArt,
  type VehicleLayer,
} from './heroArt';

/**
 * The artwork's own colours, from Nightrun-Drive.dc.html. Illustration only —
 * shades of the night between the tokens, for a sky, a skyline and a car's
 * paint — never UI: nothing tappable or readable is drawn in them. Where the
 * mock used a token's value, the token is used.
 */
const ART = {
  skyMid: '#0A0E1B',
  skyLow: '#151F3D',
  farCity: '#111830',
  crane: '#0B1020',
  nearCity: '#080B15',
  haze: '#1A2547',
  hazeLow: '#22305C',
  lamp: '#C8D6FF',
  pool: '#A9B8E6',
  bay: '#E4E9F5',
  rain: '#DCE5FF',
  groundMid: '#0C1020',
  bodyTop: '#1A2033',
  bodyLow: '#050508',
  glassTop: '#16203A',
  glassLow: '#07090F',
  sheen: '#9FB0E0',
  roof: '#A9B8E6',
  shoulder: '#7F90C0',
  flank: '#8C9DCC',
  tyre: '#030305',
  trim: '#0B0E15',
  bumper: '#040406',
  plate: '#0A0D14',
  fins: '#161A25',
  exhaust: '#010102',
  exhaustRim: '#4A5266',
  /** A tail light's lens, a step deeper than the racing red it glows in. */
  lens: '#D9252A',
  /** A lit lens's filament: the light at its hottest. */
  filament: '#FFB3B4',
  shadow: '#000000',
} as const;

const EDGE: Record<'roof' | 'shoulder' | 'flank', string> = {
  roof: alpha(ART.roof, 0.8),
  shoulder: alpha(ART.shoulder, 0.45),
  flank: alpha(ART.flank, 0.5),
};

/** The breathing tail lights' dimmest (the mock's breathe: .55 → 1). */
const BREATHE_LOW = 0.55;
/** The warning light between blinks. */
const BLINK_LOW = 0.2;

type Props = {
  /** The hero's measured size. Every canvas is sized to its own part of it. */
  width: number;
  height: number;
  /**
   * Where the stage (the space between the title and the button) starts, in
   * the hero's points. The scene slides so the car stands in it.
   */
  stageTop: number;
  vehicle: 'car' | 'motorbike';
  /** Hold the still frame: the hero has been scrolled out of sight. */
  paused?: boolean;
};

/**
 * The parked hero, Nightrun-Drive: the car (or bike) from behind under a
 * street light, drizzle in the light's cone, tail lights breathing on the
 * wet ground, a hazy skyline with one blinking mast light.
 *
 * Three canvases, so that what moves is cheap:
 *  - the scene itself, drawn once (blurs and all) and only again on layout;
 *  - the tail lights and their reflections, a small canvas whose VIEW fades
 *    in and out — the breathe is compositor opacity, never a redraw;
 *  - the drizzle, the one thing redrawn every frame: a path of short
 *    strokes, clipped to the cone less the vehicle (it falls behind it, as
 *    in the mock), sized to the cone.
 * The mast light is a plain view. Every loop runs on the UI thread, pauses
 * whenever the tab is not focused or the hero is scrolled away (`paused`),
 * and under Reduce Motion the scene is its still frame (lights full, rain
 * hanging, mast light on).
 *
 * Decorative: hidden from VoiceOver; the title beside it names the vehicle.
 */
export function HeroScene({ width, height, stageTop, vehicle, paused = false }: Props) {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const live = focused && !reduced && !paused;
  const art = vehicle === 'motorbike' ? BIKE : CAR;

  const scale = width / ART_WIDTH;
  // Slides the artboard so its stage lines up with the screen's.
  const dy = stageTop - STAGE_TOP * scale;

  const breathe = useSharedValue(1);
  const rainY = useSharedValue(0);
  const blink = useSharedValue(1);

  useEffect(() => {
    if (!live) {
      cancelAnimation(breathe);
      cancelAnimation(rainY);
      cancelAnimation(blink);
      // The still frame, and the state a loop restarts cleanly from.
      breathe.set(1);
      rainY.set(0);
      blink.set(1);
      return;
    }
    const inOut = Easing.inOut(Easing.ease);
    breathe.set(
      withRepeat(withTiming(BREATHE_LOW, { duration: ambient.breathe, easing: inOut }), -1, true),
    );
    rainY.set(-RAIN_TILE.h);
    rainY.set(
      withRepeat(withTiming(0, { duration: ambient.rain, easing: Easing.linear }), -1, false),
    );
    // The mock's keyframes: dim, flash at 6%, hold to 20%, dim by 28%.
    const T = ambient.blink;
    const lin = { easing: Easing.linear };
    blink.set(BLINK_LOW);
    blink.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: T * 0.06, ...lin }),
          withTiming(1, { duration: T * 0.14, ...lin }),
          withTiming(BLINK_LOW, { duration: T * 0.08, ...lin }),
          withTiming(BLINK_LOW, { duration: T * 0.72, ...lin }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(rainY);
      cancelAnimation(blink);
    };
  }, [live, breathe, rainY, blink]);

  const lightsStyle = useAnimatedStyle(() => ({ opacity: breathe.get() }));
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.get() }));

  if (width <= 0 || height <= 0) return null;

  const lights = {
    left: LIGHTS_BOX.x * scale,
    top: dy + LIGHTS_BOX.y * scale,
    width: LIGHTS_BOX.w * scale,
    height: LIGHTS_BOX.h * scale,
  };
  const rain = {
    left: RAIN_BOX.x * scale,
    top: dy + RAIN_BOX.y * scale,
    width: RAIN_BOX.w * scale,
    height: RAIN_BOX.h * scale,
  };
  const halo = WARNING_LIGHT.halo * scale;
  const core = WARNING_LIGHT.core * scale;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <StaticScene width={width} height={height} scale={scale} dy={dy} art={art} />
      <Animated.View style={[styles.layer, lights, lightsStyle]}>
        <Lights width={lights.width} height={lights.height} scale={scale} art={art} />
      </Animated.View>
      <Rain
        left={rain.left}
        top={rain.top}
        width={rain.width}
        height={rain.height}
        scale={scale}
        art={art}
        offset={rainY}
      />
      <Animated.View
        style={[
          styles.layer,
          {
            left: WARNING_LIGHT.cx * scale - halo,
            top: dy + WARNING_LIGHT.cy * scale - halo,
            width: halo * 2,
            height: halo * 2,
          },
          blinkStyle,
        ]}
      >
        <View style={[styles.round, styles.halo, { borderRadius: halo }]} />
        <View
          style={[
            styles.round,
            styles.core,
            {
              width: core * 2,
              height: core * 2,
              borderRadius: core,
              left: halo - core,
              top: halo - core,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

/** How far up from the hero's foot the grain fades out. */
const GRAIN_FADE = 72;

/**
 * Film grain over the hero, fading out at its foot so the texture does not
 * stop on a line above the drives list. Lay it after HeroScene and before
 * the hero's text and buttons: the fade paints the night's own colour, under
 * them.
 */
export function HeroGrain({ paused = false }: { paused?: boolean }) {
  return (
    <>
      <FilmGrain opacity={0.09} animated={!paused} />
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.grainFade}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <SvgGradient id="heroGrainFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color.canvas} stopOpacity={0} />
              <Stop offset="1" stopColor={color.canvas} stopOpacity={1} />
            </SvgGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#heroGrainFade)" />
        </Svg>
      </View>
    </>
  );
}

/** An ellipse lit from its centre: `tint` at `opacity`, fading to clear at the rim. */
function EllipseGlow({ e, tint, opacity }: { e: Ellipse; tint: string; opacity: number }) {
  return (
    <Oval x={e.cx - e.rx} y={e.cy - e.ry} width={e.rx * 2} height={e.ry * 2}>
      <RadialGradient
        c={vec(e.cx, e.cy)}
        r={e.rx}
        colors={[alpha(tint, opacity), alpha(tint, 0)]}
        // Squashed to the ellipse, as SVG's objectBoundingBox radial is.
        transform={[{ scaleY: e.ry / e.rx }]}
        origin={vec(e.cx, e.cy)}
      />
    </Oval>
  );
}

/**
 * Memoised on its (primitive) props: the screen re-renders on every status
 * or position change, and a re-render here would be a full redraw.
 */
const StaticScene = memo(function StaticScene({
  width,
  height,
  scale,
  dy,
  art,
}: {
  width: number;
  height: number;
  scale: number;
  dy: number;
  art: VehicleArt;
}) {
  // The artboard rows the canvas shows: the sky reaches its top, the faded
  // ground its bottom, whatever the title and the notes did to the layout.
  const topY = Math.min(0, -dy / scale);
  const bottomY = Math.max(GROUND_END, (height - dy) / scale);
  const p = art.placement;
  return (
    <Canvas style={[styles.layer, { left: 0, top: 0, width, height }]}>
      <Group transform={[{ translateY: dy }, { scale }]}>
        {/* Sky, down to the horizon. Above the artboard it stays night. */}
        <Rect x={0} y={topY} width={ART_WIDTH} height={SKY_BOTTOM - topY}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, SKY_BOTTOM)}
            colors={[color.canvas, ART.skyMid, ART.skyLow]}
            positions={[0, 0.55, 1]}
          />
        </Rect>
        <EllipseGlow e={CITY_GLOW} tint={color.horizon} opacity={0.45} />
        <Path path={FAR_CITY} color={ART.farCity} />
        <Path path={CRANE} style="stroke" strokeWidth={1.3} color={ART.crane} />
        <Path path={NEAR_CITY} color={ART.nearCity} />
        <Rect x={HAZE.x} y={HAZE.y} width={HAZE.w} height={HAZE.h}>
          <LinearGradient
            start={vec(0, HAZE.y)}
            end={vec(0, HAZE.y + HAZE.h)}
            colors={[alpha(ART.haze, 0), alpha(ART.haze, 0.22), alpha(ART.hazeLow, 0.62)]}
            positions={[0, 0.6, 1]}
          />
        </Rect>
        {WINDOWS.map(([x, y]) => (
          <Rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={WINDOW_SIZE}
            height={WINDOW_SIZE}
            color={alpha(ART.lamp, 0.3)}
          />
        ))}
        <Circle
          cx={CRANE_TIP.cx}
          cy={CRANE_TIP.cy}
          r={CRANE_TIP.r}
          color={alpha(color.accentHot, 0.8)}
        />

        {/* The wet ground, the light's cone and its pool, the bay lines. */}
        <Rect x={0} y={GROUND_TOP} width={ART_WIDTH} height={bottomY - GROUND_TOP}>
          <LinearGradient
            start={vec(0, GROUND_TOP)}
            end={vec(0, GROUND_END)}
            colors={[color.surface2, ART.groundMid, color.canvas]}
            positions={[0, 0.25, 1]}
          />
        </Rect>
        <Path path={CONE}>
          <LinearGradient
            start={vec(0, CONE_BOX.top)}
            end={vec(0, CONE_BOX.bottom)}
            colors={[alpha(ART.lamp, 0.13), alpha(ART.lamp, 0.04), alpha(ART.lamp, 0)]}
            positions={[0, 0.7, 1]}
          />
          <BlurMask blur={14} style="normal" />
        </Path>
        <EllipseGlow e={POOL} tint={ART.pool} opacity={0.22} />
        {BAYS.map((d) => (
          <Path key={d} path={d}>
            <LinearGradient
              start={vec(0, BAY_BOX.top)}
              end={vec(0, BAY_BOX.bottom)}
              colors={[alpha(ART.bay, 0), alpha(ART.bay, 0.2), alpha(ART.bay, 0)]}
              positions={[0, 0.3, 1]}
            />
          </Path>
        ))}

        {/* The vehicle, all but its tail lights. */}
        <Group transform={[{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }]}>
          <Oval
            x={art.shadow.cx - art.shadow.rx}
            y={art.shadow.cy - art.shadow.ry}
            width={art.shadow.rx * 2}
            height={art.shadow.ry * 2}
            color={alpha(ART.shadow, 0.9)}
          >
            <BlurMask blur={4} style="normal" />
          </Oval>
          {art.layers.map((layer, i) => (
            <Layer key={i} layer={layer} art={art} />
          ))}
        </Group>

        {/* The ground fades to night under the button. */}
        <Rect x={0} y={FADE.top} width={ART_WIDTH} height={bottomY - FADE.top}>
          <LinearGradient
            start={vec(0, FADE.top)}
            end={vec(0, FADE.bottom)}
            colors={[alpha(color.canvas, 0), alpha(color.canvas, 0.85), color.canvas]}
            positions={[0, 0.6, 1]}
          />
        </Rect>
      </Group>
    </Canvas>
  );
});

function Layer({ layer, art }: { layer: VehicleLayer; art: VehicleArt }) {
  switch (layer.kind) {
    case 'solid':
      return <Path path={layer.d} color={ART[layer.tone]} />;
    case 'body':
      return (
        <Path path={layer.d}>
          <LinearGradient
            start={vec(0, art.bodyBox[0])}
            end={vec(0, art.bodyBox[1])}
            colors={[ART.bodyTop, color.surface1, ART.bodyLow]}
            positions={[0, 0.42, 1]}
          />
        </Path>
      );
    case 'glass': {
      const box = art.glassBox ?? art.bodyBox;
      return (
        <Path path={layer.d}>
          <LinearGradient
            start={vec(0, box[0])}
            end={vec(0, box[1])}
            colors={[ART.glassTop, ART.glassLow]}
          />
        </Path>
      );
    }
    case 'sheen':
      return <Path path={layer.d} color={alpha(ART.sheen, 0.08)} />;
    case 'edge':
      return (
        <Path path={layer.d} style="stroke" strokeWidth={layer.width} color={EDGE[layer.tone]} />
      );
    case 'tint':
      return (
        <Oval
          x={layer.e.cx - layer.e.rx}
          y={layer.e.cy - layer.e.ry}
          width={layer.e.rx * 2}
          height={layer.e.ry * 2}
          color={alpha(color.accent, 0.06)}
        />
      );
    case 'plate':
      return (
        <Group>
          <RoundedRect
            x={layer.x}
            y={layer.y}
            width={layer.w}
            height={layer.h}
            r={layer.r}
            color={ART.plate}
          />
          <RoundedRect
            x={layer.x}
            y={layer.y}
            width={layer.w}
            height={layer.h}
            r={layer.r}
            style="stroke"
            strokeWidth={0.6}
            color={color.hairline}
          />
        </Group>
      );
    case 'fins':
      return <Path path={layer.d} style="stroke" strokeWidth={0.8} color={ART.fins} />;
    case 'exhaust':
      return (
        <Group>
          <Circle cx={layer.cx} cy={layer.cy} r={layer.r} color={ART.exhaust} />
          <Circle
            cx={layer.cx}
            cy={layer.cy}
            r={layer.r}
            style="stroke"
            strokeWidth={0.9}
            color={ART.exhaustRim}
          />
        </Group>
      );
  }
}

/**
 * The reflections' fall, with the scene's ground fade already in it: the
 * lights layer sits over the static canvas, so the fade that dims them in
 * the mock is multiplied into the stops here (0.42 × what the fade leaves).
 */
const REFLECTION = {
  top: 384,
  bottom: 470,
  colors: [
    alpha(color.accentPress, 0.37),
    alpha(color.accent, 0.22),
    alpha(color.accent, 0.1),
    alpha(color.accent, 0.03),
    alpha(color.accent, 0),
  ],
  positions: [0, 0.244, 0.5, 0.744, 1],
};

/** The tail lights and their reflections: the part that breathes. Memoised, as above. */
const Lights = memo(function Lights({
  width,
  height,
  scale,
  art,
}: {
  width: number;
  height: number;
  scale: number;
  art: VehicleArt;
}) {
  const p = art.placement;
  return (
    <Canvas style={{ width, height }}>
      <Group transform={[{ scale }, { translateX: -LIGHTS_BOX.x }, { translateY: -LIGHTS_BOX.y }]}>
        {art.reflections.map((d) => (
          <Path key={d} path={d}>
            <LinearGradient
              start={vec(0, REFLECTION.top)}
              end={vec(0, REFLECTION.bottom)}
              colors={REFLECTION.colors}
              positions={REFLECTION.positions}
            />
            <BlurMask blur={3} style="normal" />
          </Path>
        ))}
        <Group transform={[{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }]}>
          {art.lights.halos.map((h) => (
            <Oval
              key={`${h.cx}`}
              x={h.cx - h.rx}
              y={h.cy - h.ry}
              width={h.rx * 2}
              height={h.ry * 2}
              color={alpha(color.accent, 0.3)}
            >
              <BlurMask blur={10} style="normal" />
            </Oval>
          ))}
          {art.lights.lenses.map((d) => (
            <Path key={`glow${d}`} path={d} color={color.accentPress} opacity={0.8}>
              <BlurMask blur={4} style="normal" />
            </Path>
          ))}
          {art.lights.lenses.map((d) => (
            <Path key={d} path={d} color={ART.lens} />
          ))}
          {art.lights.filaments.map((d) => (
            <Path
              key={d}
              path={d}
              style="stroke"
              strokeWidth={1}
              strokeCap="round"
              strokeJoin="round"
              color={ART.filament}
            />
          ))}
        </Group>
      </Group>
    </Canvas>
  );
});

/** The vehicle's layers that hide what is behind them (the rest are marks on these). */
const OPAQUE: ReadonlySet<VehicleLayer['kind']> = new Set(['body', 'solid', 'glass', 'plate']);

/**
 * The light's cone less the vehicle standing in it, on the artboard: where
 * drizzle can be seen. Worked out once per vehicle. If Skia cannot combine
 * the shapes, the cone alone (the drizzle then falls over the vehicle too).
 */
function rainClip(art: VehicleArt): SkPath | null {
  let clip = Skia.Path.MakeFromSVGString(CONE);
  if (!clip) return null;
  const { x, y, scale } = art.placement;
  // The vehicle's drawing space onto the artboard (row-major 3×3).
  const place = [scale, 0, x, 0, scale, y, 0, 0, 1];
  // One difference per shape, not one union of them: overlapping contours
  // wound opposite ways (the glass inside the body) would cancel to a hole.
  for (const layer of art.layers) {
    if (!OPAQUE.has(layer.kind)) continue;
    const local =
      layer.kind === 'plate'
        ? Skia.Path.RRect(
            Skia.RRectXY(Skia.XYWHRect(layer.x, layer.y, layer.w, layer.h), layer.r, layer.r),
          )
        : 'd' in layer
          ? Skia.Path.MakeFromSVGString(layer.d)
          : null;
    if (!local) continue;
    const shape = Skia.PathBuilder.MakeFromPath(local).transform(place).detach();
    clip = Skia.Path.MakeFromOp(clip, shape, PathOp.Difference) ?? clip;
  }
  return clip;
}

/**
 * The drizzle: one path of short strokes sliding down a tile per cycle,
 * clipped to the light's cone with the vehicle cut out of it — the rain falls
 * behind the car, as in the mock, never across its body or its lit tail
 * lights. Its fade is a gradient pinned to the cone — the gradient is
 * counter-moved against the slide, so the drops fade in and out as they fall
 * through it rather than carrying their brightness with them (no offscreen
 * mask layer needed).
 */
const Rain = memo(function Rain({
  left,
  top,
  width,
  height,
  scale,
  art,
  offset,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  art: VehicleArt;
  offset: SharedValue<number>;
}) {
  const paths = useMemo<{ cone: SkPath | null; rain: SkPath | null }>(
    () => ({
      cone: rainClip(art),
      rain: Skia.Path.MakeFromSVGString(rainPath()),
    }),
    [art],
  );
  const fall = useDerivedValue(() => [{ translateY: offset.get() }]);
  const pin = useDerivedValue(() => [{ translateY: -offset.get() }]);
  if (!paths.cone || !paths.rain) return null;
  return (
    <Canvas style={[styles.layer, { left, top, width, height }]}>
      <Group transform={[{ scale }, { translateX: -RAIN_BOX.x }, { translateY: -RAIN_BOX.y }]}>
        <Group clip={paths.cone} opacity={0.2}>
          <Path
            path={paths.rain}
            style="stroke"
            strokeWidth={0.7}
            strokeCap="round"
            transform={fall}
          >
            <LinearGradient
              start={vec(0, CONE_BOX.top)}
              end={vec(0, CONE_BOX.bottom)}
              colors={RAIN_FADE.opacity.map((o) => alpha(ART.rain, o))}
              positions={[...RAIN_FADE.stops]}
              transform={pin}
            />
          </Path>
        </Group>
      </Group>
    </Canvas>
  );
});

const styles = StyleSheet.create({
  layer: { position: 'absolute' },
  round: { position: 'absolute' },
  halo: { left: 0, top: 0, right: 0, bottom: 0, backgroundColor: alpha(color.accent, 0.25) },
  core: { backgroundColor: color.accentHot },
  grainFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: GRAIN_FADE },
});
