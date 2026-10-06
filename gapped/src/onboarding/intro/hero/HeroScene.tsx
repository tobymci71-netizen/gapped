import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Line,
  LinearGradient,
  Oval,
  Path,
  RadialGradient,
  Rect,
  Skia,
  type SkPath,
  type Transforms3d,
  vec,
} from '@shopify/react-native-skia';
import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { FilmGrain } from '@/components/brand/FilmGrain';
import { GappedMark } from '@/components/brand/GappedMark';
import { Text } from '@/components/Text';
import { color } from '@/theme/tokens';
import { SkiaVehicleImage, useSkiaVehicle, type SkiaVehicle } from '@/vehicles/art/SkiaVehicle';
import type { BodyType } from '@/vehicles/bodyType';
import { wordmarkOpacity } from '../introTimeline';
import {
  approachOpacity,
  approachScale,
  blinkAt,
  breatheAt,
  carInAt,
  driftAt,
  flareAt,
  igniteAt,
  INTRO,
  lockAt,
  MARK_BOX,
  markRiseAt,
  type HeroFit,
  type Runner,
  RUNNERS,
  runnerPhase,
  SCENE,
  shimmerAt,
  trailReach,
} from './heroMath';
import type { HeroClock } from './useHeroClock';
import { pigment, tint } from './pigments';

const VP = vec(SCENE.vp.x, SCENE.vp.y);

/** A polygon from flat x, y pairs, as an SVG path. */
const poly = (pts: readonly number[]): string => {
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += ` L${pts[i]} ${pts[i + 1]}`;
  return `${d} Z`;
};

/**
 * How far the road's static rays (its lit edges) are carried past the mock's
 * 390-wide frame, so a phone wider than the scene's scale sees the road run
 * on to its edges. Three times out is past the edge of any phone. The light
 * trails, which burst out, run exactly as far as the phone needs instead
 * (trailReach).
 */
const REACH = 3;

/** A wedge from an apex, its far corners carried `k` times as far out. */
function wedge(apex: readonly [number, number], corners: readonly number[], k = REACH): string {
  const [ax, ay] = apex;
  const pts = [ax, ay];
  for (let i = 0; i < corners.length; i += 2) {
    pts.push(ax + (corners[i] - ax) * k, ay + (corners[i + 1] - ay) * k);
  }
  return poly(pts);
}

const fromVP = (corners: readonly number[], k = REACH) =>
  wedge([SCENE.vp.x, SCENE.vp.y], corners, k);

/** The mock's light trails: far edges of each wedge at the scene's sides. */
const TRAILS = {
  softWhite: [
    [390, 312, 390, 317],
    [390, 318, 390, 324],
  ],
  softRedLeft: [
    [0, 336, 0, 342],
    [0, 345.5, 0, 353],
    [0, 354, 0, 360],
  ],
  softRedRight: [
    [390, 343, 390, 349],
    [390, 350.5, 390, 357],
  ],
  white: [
    { c: [390, 313, 390, 315.6], o: 1 },
    { c: [390, 319, 390, 322.4], o: 1 },
    { c: [390, 326, 390, 328.2], o: 0.7 },
  ],
  redLeft: [
    { c: [0, 338, 0, 341], o: 1 },
    { c: [0, 347, 0, 351.4], o: 1 },
    { c: [0, 355.4, 0, 358.6], o: 1 },
    { c: [0, 361.4, 0, 363], o: 0.55 },
  ],
  redRight: [
    { c: [390, 344.4, 390, 347.6], o: 1 },
    { c: [390, 351.6, 390, 355.6], o: 1 },
    { c: [390, 359, 390, 361.4], o: 0.7 },
  ],
} as const;

/**
 * The vehicle on the road ahead (scene coordinates): which render stands in
 * for a car or a bike before the person has chosen theirs (as on the "Built"
 * page), where its tyres meet the road, and the room it may take.
 */
const INTRO_BODY: Record<'car' | 'motorbike', BodyType> = { car: 'coupe', motorbike: 'motorbike' };
const VEHICLE_SPOT = { cx: 195, groundY: 481, perMetre: 97, maxWidth: 186, maxHeight: 104 } as const;
/** It rises the last few points onto the road as it fades in. */
const CAR_IN_RISE = 12;
/** The reticle locks on round the vehicle, with this much room. */
const RETICLE_PAD = { x: 12, top: 10 } as const;
/** Before the render has decoded: the car's frame. */
const RETICLE_FALLBACK = { left: 95, right: 295, top: 362 } as const;
const RETICLE_BOTTOM = 498;
const LOCK_ORIGIN = vec(195, 430);

/** The caption under the reticle, and its dot. */
const GPS_Y = 497;

function reticlePath({ left, right, top }: { left: number; right: number; top: number }): string {
  const t = top;
  const b = RETICLE_BOTTOM;
  const a = 12;
  return (
    `M${left} ${t + a} V${t} H${left + a} M${right - a} ${t} H${right} V${t + a} ` +
    `M${right} ${b - a} V${b} H${right - a} M${left + a} ${b} H${left} V${b - a}`
  );
}

/**
 * Horizontal stripes over the wet road, for the ripple in its reflections:
 * the mock masks them with an 8×3 pattern, a 1.2pt bright row then 1.8pt at
 * 62%. Drawn as a clip, once per mount.
 */
function rippleStripes(): SkPath {
  const b = Skia.PathBuilder.Make();
  for (let y = 300; y < 760; y += 3) b.addRect(Skia.XYWHRect(-800, y, 2000, 1.2));
  return b.build();
}

type Props = {
  width: number;
  height: number;
  fit: HeroFit;
  /** Window y where the night closes over the road (fadeTopFor). */
  fadeTop: number;
  kind: 'car' | 'motorbike';
  clock: HeroClock;
  reduced: boolean;
  /**
   * True when the splash brings the mark here (it travels in and lands on
   * `markRef`); false when the mark rises out of the vanishing point itself.
   */
  markFromSplash: boolean;
  /** 0 until the splash mark has landed. */
  markShown: SharedValue<number>;
  markRef: React.RefObject<View | null>;
  /** The pager's offset, in points: the scene slides away with the first page. */
  scrollX: SharedValue<number>;
  /** The carousel's reveal under the splash, 0 → 1. */
  reveal: SharedValue<number>;
  /** Film grain may jitter (the scene is running). */
  grain: boolean;
};

/**
 * The welcome hero (Nightrun-Welcome): a UK motorway at night seen from just
 * behind a car — red tail-light trails on our carriageway, white headlights
 * on the far one, lane dashes, studs and lamp posts rushing past in true
 * perspective, the tail lights catching and shining on the wet road, a
 * reticle locking on, and the G mark rising out of the vanishing point with
 * its red glow. A slow push-in, a thin flare along the horizon, film grain.
 *
 * Two Skia canvases, both the size of the window. The lower one holds what
 * only the opening burst moves (sky, ground, the trails, their reflections)
 * and reads one timing value, so once the burst has landed it never draws
 * again. The upper one holds everything that keeps moving and reads the hero
 * clock (./useHeroClock) on the UI thread; that clock only runs while the
 * scene is on screen and focused, and Reduce Motion stops it on a still
 * frame. The push-in is a native transform on both, so it costs no drawing.
 *
 * Decoration from end to end: hidden from VoiceOver and takes no touches. The
 * page's copy says what it means.
 */
export const HeroScene = memo(function HeroScene({
  width,
  height,
  fit,
  fadeTop,
  kind,
  clock,
  reduced,
  markFromSplash,
  markShown,
  markRef,
  scrollX,
  reveal,
  grain,
}: Props) {
  const { t, burst } = clock;
  const sceneTransform = useMemo<Transforms3d>(
    () => [{ translateX: fit.tx }, { translateY: fit.ty }, { scale: fit.s }],
    [fit],
  );
  const vpScreen = { x: fit.tx + SCENE.vp.x * fit.s, y: fit.ty + SCENE.vp.y * fit.s };
  const reach = trailReach(fit, width);

  // The scene slides off with the first page and fades in under the splash.
  const slide = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateX: -Math.min(Math.max(scrollX.value, 0), width) }],
  }));
  // The camera's push-in, about the vanishing point. Native: no redraw.
  const drift = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : driftAt(t.value) }],
  }));

  const markWidth = MARK_BOX.width * fit.s;
  const markStyle = useAnimatedStyle(() => {
    const away = wordmarkOpacity(width > 0 ? scrollX.value / width : 0);
    if (markFromSplash || reduced) {
      return { opacity: markShown.value * away, transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    const rise = markRiseAt(t.value);
    return {
      opacity: rise.opacity * away,
      transform: [{ translateY: 30 * (1 - rise.e) }, { scale: 0.5 + 0.5 * rise.e }],
    };
  });

  const lock = useDerivedValue(() => lockAt(t.value));
  const gpsStyle = useAnimatedStyle(() => ({
    opacity: lock.value,
    transform: [{ translateY: 4 * (1 - lock.value) }],
  }));
  const gpsDot = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : blinkAt(t.value, INTRO.gpsBlink.period, INTRO.gpsBlink.delay),
  }));

  // The caption is centred on the scene's centreline, which heroFit keeps
  // on the window's.
  const gpsY = fit.ty + GPS_Y * fit.s;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // Clipped: the camera push-in scales the scene past the window's
      // edges, and without this the overhang stayed on screen as a strip
      // down the left of page 2 after the scene had slid away.
      style={[StyleSheet.absoluteFill, styles.clip, slide]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { transformOrigin: [vpScreen.x, vpScreen.y, 0] }, drift]}
      >
        <Canvas style={{ width, height }}>
          <Group transform={sceneTransform}>
            <StaticScene burst={burst} reach={reach} />
          </Group>
        </Canvas>
        <Canvas style={[StyleSheet.absoluteFill, { width, height }]}>
          <LiveScene
            t={t}
            burst={burst}
            kind={kind}
            sceneTransform={sceneTransform}
            width={width}
            height={height}
            fadeTop={fadeTop}
          />
        </Canvas>
        <Animated.View style={[styles.gps, { top: gpsY - 7 }, gpsStyle]}>
          <Animated.View style={[styles.gpsDot, gpsDot]} />
          <Text variant="monoSmall" style={styles.gpsText} maxFontSizeMultiplier={1.2}>
            GPS lock
          </Text>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          styles.mark,
          {
            left: fit.tx + MARK_BOX.x * fit.s,
            top: fit.ty + MARK_BOX.y * fit.s,
            // The mark grows out of the vanishing point: its own box's
            // (115, 196) in the mock is the scene's (195, 300).
            transformOrigin: [115 * fit.s, 196 * fit.s, 0],
          },
          markStyle,
        ]}
      >
        <View ref={markRef} collapsable={false}>
          <GappedMark size={markWidth} glow />
        </View>
      </Animated.View>

      <FilmGrain opacity={0.1} animated={grain} />
    </Animated.View>
  );
});

// ─── The static canvas: night, road, trails ─────────────────────────────────

/**
 * Memoised, like the live scene: the carousel re-renders on every page change,
 * and a re-render here would hand Skia fresh gradient props and redraw a
 * canvas that has nothing new to show.
 */
const StaticScene = memo(function StaticScene({
  burst,
  reach,
}: {
  burst: SharedValue<number>;
  /** How far the trails run, in mock lengths (trailReach). */
  reach: number;
}) {
  const stripes = useMemo(() => rippleStripes(), []);
  const burstTransform = useDerivedValue(() => [{ scale: 0.03 + 0.97 * burst.value }]);

  return (
    <>
      {/* Sky: night overhead, deepening to blue at the horizon. */}
      <Rect x={-800} y={-600} width={2000} height={600} color={pigment.night} />
      <Rect x={-800} y={0} width={2000} height={302}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, 302)}
          colors={[pigment.night, pigment.skyMid, pigment.skyLow, pigment.skyHorizon]}
          positions={[0, 0.5, 0.86, 1]}
        />
      </Rect>
      {/* City light on low cloud, along the horizon. */}
      <Oval x={195 - 330} y={298 - 120} width={660} height={240}>
        <EllipseGlow
          cx={195}
          cy={298}
          rx={330}
          ry={120}
          colors={[
            tint(pigment.horizon, 0.6),
            tint(pigment.horizonMid, 0.26),
            tint(pigment.horizonEdge, 0),
          ]}
          positions={[0, 0.45, 1]}
        />
      </Oval>
      {/* Low cloud, lit from below. */}
      <Oval x={70 - 150} y={214 - 16} width={300} height={32} color={tint(pigment.cloud, 0.34)}>
        <BlurMask blur={16} style="normal" />
      </Oval>
      <Oval x={330 - 140} y={186 - 13} width={280} height={26} color={tint(pigment.cloud, 0.26)}>
        <BlurMask blur={16} style="normal" />
      </Oval>
      <Oval x={220 - 210} y={256 - 12} width={420} height={24} color={tint(pigment.cloud, 0.3)}>
        <BlurMask blur={16} style="normal" />
      </Oval>
      {/* A radio mast on the skyline (its warning light blinks on the live canvas). */}
      <Line p1={vec(60.2, 296)} p2={vec(60.2, 238)} strokeWidth={1.4} color={pigment.mast} />
      <Path
        path="M60.2 244 L44 296 M60.2 244 L76 296"
        style="stroke"
        strokeWidth={0.6}
        color={pigment.mast}
      />
      {/* Treelines either side, carried on past the frame. */}
      <Path
        path="M-800 300 V285 L0 284 C12 282 22 285 34 283 C46 281 54 286 66 285 C80 284 88 288 100 289 C118 291 136 293 150 295 C166 297 178 299 190 300 Z"
        color={pigment.treeline}
      />
      <Path
        path="M1200 300 V281 L390 280 C378 279 368 283 356 282 C342 281 332 285 318 286 C300 288 284 290 268 292 C248 295 222 298 200 300 Z"
        color={pigment.treeline}
      />
      {/* The ground: the horizon's blue going back to night toward the camera. */}
      <Rect x={-800} y={300} width={2000} height={1100}>
        <LinearGradient
          start={vec(0, 300)}
          end={vec(0, 844)}
          colors={[pigment.groundHorizon, pigment.groundNear, pigment.groundFar, pigment.night]}
          positions={[0, 0.07, 0.34, 1]}
        />
      </Rect>
      <Oval x={195 - 270} y={356 - 84} width={540} height={168}>
        <EllipseGlow
          cx={195}
          cy={356}
          rx={270}
          ry={84}
          colors={[tint(pigment.cloud, 0.6), tint(pigment.cloud, 0)]}
          positions={[0, 1]}
        />
      </Oval>
      {/* The road's edges catching the light. */}
      <Path path={fromVP([0, 363.4, 0, 366.8])} color={tint(pigment.roadEdge, 0.22)} />
      <Path path={fromVP([390, 363.4, 390, 366.8])} color={tint(pigment.roadEdge, 0.16)} />
      <Path path={fromVP([390, 337.6, 390, 340.4])} color={tint(pigment.roadEdgeDim, 0.85)} />

      {/* The trails, bursting out of the vanishing point. */}
      <Group transform={burstTransform} origin={VP} opacity={burst}>
        <Group opacity={0.9}>
          {TRAILS.softWhite.map((c) => (
            <Path key={c.join()} path={fromVP(c, reach)}>
              <TrailWhite />
              <BlurMask blur={4} style="normal" />
            </Path>
          ))}
          {TRAILS.softRedLeft.map((c) => (
            <Path key={c.join()} path={fromVP(c, reach)}>
              <TrailRed toX={0} />
              <BlurMask blur={4} style="normal" />
            </Path>
          ))}
          {TRAILS.softRedRight.map((c) => (
            <Path key={c.join()} path={fromVP(c, reach)}>
              <TrailRed toX={390} />
              <BlurMask blur={4} style="normal" />
            </Path>
          ))}
        </Group>
        {TRAILS.white.map(({ c, o }) => (
          <Path key={c.join()} path={fromVP(c, reach)} opacity={o}>
            <TrailWhite />
          </Path>
        ))}
        {TRAILS.redLeft.map(({ c, o }) => (
          <Path key={c.join()} path={fromVP(c, reach)} opacity={o}>
            <TrailRed toX={0} />
          </Path>
        ))}
        {TRAILS.redRight.map(({ c, o }) => (
          <Path key={c.join()} path={fromVP(c, reach)} opacity={o}>
            <TrailRed toX={390} />
          </Path>
        ))}
        {/* Where every trail starts: red haze round a white-hot point. */}
        <Oval x={195 - 78} y={300 - 15} width={156} height={30}>
          <EllipseGlow cx={195} cy={300} rx={78} ry={15} {...RED_HAZE} />
        </Oval>
        <Oval x={195 - 28} y={300 - 5} width={56} height={10}>
          <EllipseGlow
            cx={195}
            cy={300}
            rx={28}
            ry={5}
            colors={[
              tint(pigment.white, 0.95),
              tint(pigment.hazeCore, 0.45),
              tint(pigment.hazeCore, 0),
            ]}
            positions={[0, 0.4, 1]}
          />
        </Oval>
        {/* Distant lights, out of focus. */}
        <Circle cx={150} cy={296} r={3} color={tint(pigment.red, 0.5)}>
          <BlurMask blur={2} style="normal" />
        </Circle>
        <Circle cx={236} cy={293} r={2.4} color={tint(pigment.glintRedHalo, 0.45)}>
          <BlurMask blur={2} style="normal" />
        </Circle>
        <Circle cx={262} cy={297} r={4} color={tint(pigment.red, 0.3)}>
          <BlurMask blur={2} style="normal" />
        </Circle>
        <Circle cx={122} cy={291} r={2} color={tint(pigment.headlight, 0.35)}>
          <BlurMask blur={2} style="normal" />
        </Circle>
        <Circle cx={300} cy={303} r={5} color={tint(pigment.white, 0.16)}>
          <BlurMask blur={2} style="normal" />
        </Circle>
        <Circle cx={86} cy={307} r={6} color={tint(pigment.red, 0.16)}>
          <BlurMask blur={2} style="normal" />
        </Circle>
        <Circle cx={332} cy={309} r={7} color={tint(pigment.red, 0.13)}>
          <BlurMask blur={2} style="normal" />
        </Circle>
      </Group>

      {/* The trails on the wet road, rippled. */}
      <Rippled stripes={stripes}>
        <Path path={wedge([195, 303], [0, 350, 0, 430], 2.5)} opacity={0.75}>
          <ReflectRed top={303} bottom={430} />
          <BlurMask blur={2} style="normal" />
        </Path>
        <Path path={wedge([195, 303], [390, 356, 390, 440], 2.5)} opacity={0.7}>
          <ReflectRed top={303} bottom={440} />
          <BlurMask blur={2} style="normal" />
        </Path>
        <Path path={wedge([195, 303], [390, 320, 390, 372], 2.5)} opacity={0.8}>
          <LinearGradient
            start={vec(0, 303)}
            end={vec(0, 372)}
            colors={[tint(pigment.reflectCool, 0.35), tint(pigment.reflectCool, 0)]}
          />
          <BlurMask blur={2} style="normal" />
        </Path>
      </Rippled>
    </>
  );
});

// ─── The live canvas: everything that keeps moving ──────────────────────────

const LiveScene = memo(function LiveScene({
  t,
  burst,
  kind,
  sceneTransform,
  width,
  height,
  fadeTop,
}: {
  t: SharedValue<number>;
  burst: SharedValue<number>;
  kind: 'car' | 'motorbike';
  sceneTransform: Transforms3d;
  width: number;
  height: number;
  fadeTop: number;
}) {
  const stripes = useMemo(() => rippleStripes(), []);
  const blink = useDerivedValue(() => blinkAt(t.value, INTRO.blink.period));
  const shimmer = useDerivedValue(() => shimmerAt(t.value));
  const burstTransform = useDerivedValue(() => [{ scale: 0.03 + 0.97 * burst.value }]);
  const lit = useDerivedValue(() => igniteAt(t.value));
  const halo = useDerivedValue(() => breatheAt(t.value));
  const carIn = useDerivedValue(() => carInAt(t.value));
  const carTransform = useDerivedValue(() => [{ translateY: CAR_IN_RISE * (1 - carIn.value) }]);
  // The halo breathes the lights between full and a soft glow.
  const glow = useDerivedValue(() => lit.value * (0.7 + 0.3 * halo.value));
  const lock = useDerivedValue(() => lockAt(t.value));
  const lockTransform = useDerivedValue(() => [{ scale: 1.14 - 0.14 * lock.value }]);
  const flare = useDerivedValue(() => 0.62 * flareAt(t.value));
  const vehicle = useSkiaVehicle(INTRO_BODY[kind], 'rear', VEHICLE_SPOT);
  const reticle = useMemo(() => reticleFor(vehicle), [vehicle]);
  const reflections = useMemo(() => roadReflections(vehicle, kind), [vehicle, kind]);

  return (
    <>
      <Group transform={sceneTransform}>
        {/* The mast's warning light. */}
        <Group opacity={blink}>
          <Circle cx={60.2} cy={236.5} r={7}>
            <RadialGradient c={vec(60.2, 236.5)} r={7} {...RED_HAZE} />
          </Circle>
          <Circle cx={60.2} cy={236.5} r={1.3} color={pigment.redHot} />
        </Group>

        {/* Lamp posts on the hard shoulder, rushing past. */}
        {RUNNERS.lamps.map((r) => (
          <Approach key={`l${r.lead}`} runner={r} t={t}>
            <Path
              path="M209.4 291.4 L206.4 306 L212.4 306 Z"
              color={tint(pigment.lampCone, 0.022)}
            />
            <Line
              p1={vec(214.2, 306)}
              p2={vec(214.2, 290.8)}
              strokeWidth={0.26}
              color={pigment.lampPole}
            />
            <Line
              p1={vec(214.2, 290.8)}
              p2={vec(209.4, 291.1)}
              strokeWidth={0.2}
              color={pigment.lampPole}
            />
            <Circle cx={209.4} cy={291.4} r={2.4} color={tint(pigment.lampCone, 0.1)} />
            <Circle cx={209.4} cy={291.4} r={1} color={tint(pigment.lampHalo, 0.35)} />
            <Circle cx={209.4} cy={291.35} r={0.38} color={pigment.white} />
          </Approach>
        ))}
        {/* Red studs on the edge line. */}
        {RUNNERS.studs.map((r) => (
          <Approach key={`s${r.lead}`} runner={r} t={t}>
            <Circle cx={177} cy={306} r={1} color={tint(pigment.red, 0.3)} />
            <Circle cx={177} cy={306} r={0.3} color={pigment.stud} />
          </Approach>
        ))}
        {/* Lane dashes either side of our lane. */}
        {RUNNERS.dashes.map((r) => (
          <Approach key={`d${r.lead}`} runner={r} t={t}>
            <Path
              path="M208.58 314 L209.42 314 L212.51 317 L211.49 317 Z"
              color={tint(pigment.dash, 0.85)}
            />
            <Path
              path="M181.42 314 L180.58 314 L177.49 317 L178.51 317 Z"
              color={tint(pigment.dash, 0.85)}
            />
          </Approach>
        ))}
        {/* Glints running along the trails: white out, red back. */}
        {RUNNERS.whiteGlints.map((r, i) => {
          const g = WHITE_GLINTS[i];
          return (
            <Approach key={`w${r.lead}`} runner={r} t={t}>
              <Path path={poly(g.tri)} color={pigment.white} />
              <Circle cx={g.dot[0]} cy={g.dot[1]} r={g.dot[2]} color={tint(pigment.white, 0.3)} />
            </Approach>
          );
        })}
        {RUNNERS.redGlints.map((r, i) => {
          const g = RED_GLINTS[i];
          return (
            <Approach key={`r${r.lead}`} runner={r} t={t}>
              <Path path={poly(g.tri)} color={pigment.glintRed} />
              <Circle cx={g.dot[0]} cy={g.dot[1]} r={g.dot[2]} color={tint(pigment.redHot, 0.4)} />
            </Approach>
          );
        })}

        {/* The thin flare along the horizon. */}
        <Group transform={burstTransform} origin={VP} opacity={burst}>
          <Group opacity={shimmer}>
            <Rect x={0} y={296.5} width={390} height={7} opacity={0.3}>
              <Anamorphic />
              <BlurMask blur={2} style="normal" />
            </Rect>
            <Rect x={0} y={299.55} width={390} height={0.9}>
              <Anamorphic />
            </Rect>
          </Group>
        </Group>

        {/* The tail lights on the wet road under the car. */}
        <Group opacity={lit}>
          <Rippled stripes={stripes}>
            {reflections.map((pts) => (
              <Path key={pts.join()} path={poly(pts)}>
                <ReflectRed top={490} bottom={600} />
                <BlurMask blur={2} style="normal" />
              </Path>
            ))}
          </Rippled>
        </Group>

        {vehicle ? (
          <Group transform={carTransform} opacity={carIn}>
            <SkiaVehicleImage vehicle={vehicle} lit={glow} streak={shimmer} />
          </Group>
        ) : null}

        <Group transform={lockTransform} origin={LOCK_ORIGIN} opacity={lock}>
          <Path
            path={reticlePath(reticle)}
            style="stroke"
            strokeWidth={1}
            color={tint(color.text1, 0.5)}
          />
        </Group>

        {/* The red glow the mark rises through. */}
        <Oval x={205 - 178} y={166 - 74} width={356} height={148} opacity={flare}>
          <EllipseGlow cx={205} cy={166} rx={178} ry={74} {...RED_HAZE} />
        </Oval>
      </Group>

      {/* The night closing over the road under the copy, and the lens's vignette. */}
      <Rect x={-width} y={fadeTop} width={width * 3} height={height * 2}>
        <LinearGradient
          start={vec(0, fadeTop)}
          end={vec(0, height)}
          colors={[
            tint(color.canvas, 0),
            tint(color.canvas, 0.5),
            tint(color.canvas, 0.88),
            color.canvas,
          ]}
          positions={[0, 0.34, 0.58, 1]}
        />
      </Rect>
      <Rect x={-width} y={-height} width={width * 3} height={height * 3}>
        <RadialGradient
          c={vec(0, 0)}
          r={1}
          transform={[
            { translateX: width / 2 },
            { translateY: height * 0.4 },
            { scaleX: width * 0.78 },
            { scaleY: height * 0.78 },
          ]}
          colors={[tint(pigment.shadow, 0), tint(pigment.shadow, 0.72)]}
          positions={[0.55, 1]}
        />
      </Rect>
    </>
  );
});

// ─── Pieces ──────────────────────────────────────────────────────────────────

/** The reticle's corners, round the vehicle once its render has decoded. */
function reticleFor(vehicle: SkiaVehicle | null) {
  if (!vehicle) return RETICLE_FALLBACK;
  const { box } = vehicle;
  return {
    left: box.x - RETICLE_PAD.x,
    right: box.x + box.w + RETICLE_PAD.x,
    top: box.y - RETICLE_PAD.top,
  };
}

/**
 * Where each tail light lands on the wet road: long and thin, as a
 * reflection on wet tarmac stretches toward the camera, with a brighter core.
 */
function roadReflections(vehicle: SkiaVehicle | null, kind: 'car' | 'motorbike'): number[][] {
  if (!vehicle) return [];
  const w = kind === 'motorbike' ? 17 : 21;
  const top = VEHICLE_SPOT.groundY + 2;
  return vehicle.tailLights.flatMap(({ x }) => [
    [x - w, top, x + w, top, x + w * 0.62, 600, x - w * 0.62, 600],
    [x - 3, top, x + 3, top, x + 3, 576, x - 3, 576],
  ]);
}

/** One road light rushing from the vanishing point past the camera. */
function Approach({
  runner,
  t,
  children,
}: {
  runner: Runner;
  t: SharedValue<number>;
  children: React.ReactNode;
}) {
  const transform = useDerivedValue(() => [{ scale: approachScale(runnerPhase(runner, t.value)) }]);
  const opacity = useDerivedValue(() => approachOpacity(runnerPhase(runner, t.value)));
  return (
    <Group transform={transform} origin={VP} opacity={opacity}>
      {children}
    </Group>
  );
}

/**
 * Reflections on wet tarmac: drawn once in full on the bright rows of the
 * ripple and once at 78% between them, so the light breaks into the fine
 * horizontal ripple a wet road gives it.
 */
function Rippled({ stripes, children }: { stripes: SkPath; children: React.ReactNode }) {
  return (
    <>
      <Group clip={stripes}>{children}</Group>
      <Group clip={stripes} invertClip opacity={0.78}>
        {children}
      </Group>
    </>
  );
}

/** A radial gradient stretched to an ellipse, as SVG draws one in its bounding box. */
function EllipseGlow({
  cx,
  cy,
  rx,
  ry,
  colors,
  positions,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  colors: string[];
  positions: number[];
}) {
  return (
    <RadialGradient
      c={vec(0, 0)}
      r={1}
      transform={[{ translateX: cx }, { translateY: cy }, { scaleX: rx }, { scaleY: ry }]}
      colors={colors}
      positions={positions}
    />
  );
}

/** The mock's #wRedHaze: the halo round any red light. */
const RED_HAZE = {
  colors: [tint(pigment.red, 0.45), tint(pigment.red, 0.13), tint(pigment.red, 0)],
  positions: [0, 0.5, 1],
};

function TrailRed({ toX }: { toX: number }) {
  return (
    <LinearGradient
      start={VP}
      end={vec(toX, 352)}
      colors={[pigment.trailCore, pigment.redHot, tint(pigment.red, 0.92)]}
      positions={[0, 0.1, 1]}
    />
  );
}

function TrailWhite() {
  return (
    <LinearGradient
      start={VP}
      end={vec(390, 321)}
      colors={[pigment.white, pigment.headlight, tint(pigment.headlightFar, 0.85)]}
      positions={[0, 0.25, 1]}
    />
  );
}

function ReflectRed({ top, bottom }: { top: number; bottom: number }) {
  return (
    <LinearGradient
      start={vec(0, top)}
      end={vec(0, bottom)}
      colors={[tint(pigment.redBright, 0.55), tint(pigment.red, 0.2), tint(pigment.red, 0)]}
      positions={[0, 0.4, 1]}
    />
  );
}

function Anamorphic() {
  return (
    <LinearGradient
      start={vec(0, 0)}
      end={vec(390, 0)}
      colors={[
        tint(pigment.anamorphicEdge, 0),
        tint(pigment.anamorphicBlue, 0.35),
        pigment.white,
        tint(pigment.anamorphicBlue, 0.35),
        tint(pigment.anamorphicEdge, 0),
      ]}
      positions={[0, 0.28, 0.5, 0.72, 1]}
    />
  );
}

/** The mock's glints, in the order RUNNERS lists them. */
const WHITE_GLINTS = [
  { tri: [204.8, 300.95, 210.6, 301.3, 210.6, 301.75], dot: [210.6, 301.5, 0.9] },
  { tri: [204.8, 300.7, 210.6, 301, 210.6, 301.3], dot: [210.6, 301.15, 0.8] },
  { tri: [203, 300.85, 209, 301.29, 209, 301.69], dot: [209, 301.49, 0.8] },
] as const;
const RED_GLINTS = [
  { tri: [185.25, 302.45, 179.4, 303.75, 179.4, 304.15], dot: [179.4, 303.95, 0.9] },
  { tri: [204.75, 302.7, 210.6, 304.1, 210.6, 304.5], dot: [210.6, 304.3, 0.9] },
  { tri: [185.25, 302.2, 179.4, 303.1, 179.4, 303.45], dot: [179.4, 303.3, 0.8] },
  { tri: [186, 301.82, 180, 302.84, 180, 303.24], dot: [180, 303.04, 0.8] },
  { tri: [187, 302.34, 181, 303.89, 181, 304.29], dot: [181, 304.09, 0.9] },
  { tri: [204, 302.47, 210, 303.92, 210, 304.32], dot: [210, 304.12, 0.9] },
] as const;

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  mark: { position: 'absolute' },
  gps: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  gpsDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: color.text1 },
  gpsText: { color: color.text2 },
});
