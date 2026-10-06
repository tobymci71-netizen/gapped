import { useIsFocused } from 'expo-router';
import React, { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  Ellipse,
  G,
  Image as SvgImage,
  LinearGradient,
  Mask,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useProfile } from '@/state/profile';
import { ambient, duration } from '@/theme/motion';
import { alpha, color, font, type } from '@/theme/tokens';
import { VEHICLE_RENDERS } from '@/vehicles/art/manifest';
import { placeOnGround, pointToPoints, type Placement } from '@/vehicles/art/place';
import type { ViewRender } from '@/vehicles/art/types';
import { inferBodyType, type BodyType } from '@/vehicles/bodyType';

/**
 * The Ranks hero's scene (Nightrun-Ranks): a night road running to the
 * horizon, with the tail lights of the drivers ahead tagged by position and
 * your own vehicle nearest the camera. Every vehicle is a render from behind
 * (docs/VEHICLE_ART.md): yours is your body type; the drivers ahead stand in
 * as a coupé and a saloon (or two bikes, if you ride), since a board row
 * names its vehicle only in free text.
 *
 * Drawn at the mock's own size, 390 × 146, and placed by the hero (`left`) so
 * the vanishing point stays over the right half and the "You" tag never runs
 * under the hero's text (sceneLeft, below). The road's top and bottom fade into
 * the night through a mask, as the mock's mask-image does.
 *
 * Three layers: the road and cars; the tail-light glows, which fade in once
 * and then breathe slowly while the tab is focused (still under Reduce
 * Motion); and the position tags on top. Nothing moves along the road: the
 * scene is a standings picture, not a chase, and on the Top speed and 0–60
 * boards it is drawn with no cars at all.
 *
 * Decorative: the hero around it says the same thing in words.
 */

const W = 390;
const H = 146;
const VIEWBOX = `0 0 ${W} ${H}`;

/** The scene's size in points: the mock's artboard, unscaled. */
export const SCENE = { width: W, height: H } as const;

/** The "You" tag's leftmost point on the artboard (its foot, under the lean). */
export const YOU_TAG_LEFT = 174.6;

/**
 * Where to put the scene in a hero `width` wide so that the "You" tag starts
 * at or right of `clearX`: pinned to the right edge where that already holds
 * (wider phones), nudged right where it does not. The road runs off the right
 * edge either way; nothing on its left half has a hard edge to show.
 */
export function sceneLeft(width: number, clearX: number): number {
  return Math.max(width - W, clearX - YOU_TAG_LEFT);
}

/** The mock's three depths: far (P1), near ahead (the driver directly ahead), you. */
const SLOTS = {
  far: { x: 270.75, y: 29.94, s: 0.1125 },
  mid: { x: 248.53, y: 47.48, s: 0.2115 },
  you: { x: 205.1, y: 81.78, s: 0.405 },
} as const;

/** Each slot's light on the road beneath its tail lights, artboard units. */
const ROAD_GLOW = {
  far: { cx: 282, cy: 45, rx: 13, ry: 2.2, o: 0.5 },
  mid: { cx: 269.7, cy: 75.5, rx: 24, ry: 3.4, o: 0.5 },
  you: { cx: 245.6, cy: 135, rx: 46, ry: 6, o: 0.55 },
} as const;

/**
 * Where each slot's vehicle stands, from the mock's car (200 × 125 units at
 * the slot's scale): centred on it, tyres on its ground line, no wider than
 * it. A metre of height is 70 units at scale 1, so a saloon stands about as
 * tall as the mock's car, a van taller (up to the cap, 1.86 m) and a bike
 * shorter, at the same depth.
 */
function spotFor(slot: keyof typeof SLOTS) {
  const { x, y, s } = SLOTS[slot];
  return {
    cx: x + 100 * s,
    groundY: y + 124 * s,
    perMetre: 70 * s,
    maxWidth: 196 * s,
    maxHeight: 130 * s,
  };
}

/** The drivers ahead, as stand-ins of your kind: the leader, then the one directly ahead. */
const STAND_INS: Record<'car' | 'bike', { far: BodyType; mid: BodyType }> = {
  car: { far: 'coupe', mid: 'saloon' },
  bike: { far: 'sportbike', mid: 'motorbike' },
};

/** A slot's render from behind, placed on the artboard. */
type PlacedVehicle = { r: ViewRender; p: Placement; lights: { x: number; y: number }[] };

function placeVehicle(bodyType: BodyType, slot: keyof typeof SLOTS): PlacedVehicle | null {
  const renders = VEHICLE_RENDERS[bodyType];
  const r = renders?.views.rear;
  if (!r) return null;
  const spot = spotFor(slot);
  const p = placeOnGround(r, { ...spot, vehicleHeight: renders.sizeM[2] * spot.perMetre });
  return { r, p, lights: r.tailLights.map((pt) => pointToPoints(p, pt)) };
}

/** Where each slot's tag sits: its left edge at the top, and the top. */
const TAGS = {
  far: { x: 245.5, y: 30.5 },
  mid: { x: 223.5, y: 53.7 },
  you: { x: 177.6, y: 99 },
} as const;

/** The lane markings, receding: the mock's dashes. */
const DASHES = [
  '297.43,16.80 297.97,16.80 298.86,20.20 298.24,20.20',
  '299.70,26.32 300.46,26.32 301.88,31.76 301.00,31.76',
  '302.95,39.92 304.01,39.92 306.32,48.76 305.06,48.76',
  '307.50,58.96 308.98,58.96 312.18,71.20 310.43,71.20',
  '314.00,86.16 316.08,86.16 321.05,105.20 318.55,105.20',
  '323.75,126.96 326.73,126.96 333.83,154.16 330.25,154.16',
];

/** A tag's plate: 12 tall, leaning right at the logo's slant (3 over 12). */
const TAG_H = 12;
const TAG_LEAN = 3;
/** A tag fits its label (Martian Mono Bold advances ~5 units a character here). */
const tagWidth = (label: string, min: number) => Math.max(min, 8 + label.length * 5);

type Props = {
  /** Where the scene's left edge sits in the hero (sceneLeft). */
  left: number;
  /** The tag over the car directly ahead ("P2"), or null for no car there. */
  ahead: string | null;
  /** The tag over the leader further up the road ("P1"), or null. */
  leader: string | null;
  /** Draw your own vehicle, tagged "You", nearest the camera. */
  you: boolean;
};

export function RoadAhead({ left, ahead, leader, you }: Props): React.JSX.Element {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const kind = useProfile((s) => s.vehicleKind);
  const make = useProfile((s) => s.vehicleMake);
  const model = useProfile((s) => s.vehicleModel);
  const bike = kind === 'motorbike';
  const own = inferBodyType(bike ? 'motorbike' : 'car', make ?? '', model ?? '');
  const standIns = STAND_INS[bike ? 'bike' : 'car'];
  // With one car ahead it takes the nearer slot; the far slot is the leader's.
  const cars: { slot: keyof typeof SLOTS; tag: string; v: PlacedVehicle | null }[] = [];
  if (leader) cars.push({ slot: 'far', tag: leader, v: placeVehicle(standIns.far, 'far') });
  if (ahead) cars.push({ slot: 'mid', tag: ahead, v: placeVehicle(standIns.mid, 'mid') });
  if (you) cars.push({ slot: 'you', tag: 'You', v: placeVehicle(own, 'you') });

  const glow = useSharedValue(reduced ? 1 : 0);
  // An empty road (the speed boards, the absent hero) has no lights to breathe,
  // so nothing runs on the UI thread for it.
  const lit = cars.length > 0;
  useEffect(() => {
    if (reduced || !focused || !lit) {
      // Still frame: lit, not breathing. Also while the tab is out of view.
      cancelAnimation(glow);
      glow.set(1);
      return;
    }
    glow.set(
      withSequence(
        withDelay(
          duration.base,
          withTiming(1, { duration: duration.epic, easing: Easing.out(Easing.quad) }),
        ),
        withRepeat(
          withSequence(
            withTiming(0.8, { duration: ambient.breathe, easing: Easing.inOut(Easing.sin) }),
            withTiming(1, { duration: ambient.breathe, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        ),
      ),
    );
    return () => cancelAnimation(glow);
  }, [reduced, focused, lit, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));

  const fade = (
    <>
      <LinearGradient id={`fade${id}`} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={color.text1} stopOpacity={0} />
        <Stop offset={24 / H} stopColor={color.text1} stopOpacity={1} />
        <Stop offset={120 / H} stopColor={color.text1} stopOpacity={1} />
        <Stop offset="1" stopColor={color.text1} stopOpacity={0} />
      </LinearGradient>
      <Mask id={`mask${id}`} x="0" y="0" width={W} height={H} maskUnits="userSpaceOnUse">
        <Rect x="0" y="0" width={W} height={H} fill={`url(#fade${id})`} />
      </Mask>
    </>
  );

  return (
    <View
      style={[styles.scene, { left }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Road and cars. */}
      <Svg width={W} height={H} viewBox={VIEWBOX}>
        <Defs>
          {fade}
          <LinearGradient
            id={`road${id}`}
            x1="0"
            y1="10"
            x2="0"
            y2={H}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={color.surface2} />
            <Stop offset="0.35" stopColor={color.sky} />
            <Stop offset="1" stopColor={color.surface1} />
          </LinearGradient>
          <RadialGradient id={`hz${id}`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={color.horizon} stopOpacity={0.5} />
            <Stop offset="1" stopColor={color.horizon} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <G mask={`url(#mask${id})`}>
          <Ellipse cx={296} cy={10} rx={190} ry={34} fill={`url(#hz${id})`} />
          <Polygon points="296,10 150,146 510,146" fill={`url(#road${id})`} />
          <Polygon points="296,10 148,146 153,146" fill={alpha(color.text2, 0.22)} />
          <Polygon points="296,10 507,146 512,146" fill={alpha(color.text2, 0.15)} />
          <G fill={alpha(color.text1, 0.5)}>
            {DASHES.map((p) => (
              <Polygon key={p} points={p} />
            ))}
          </G>
          {cars.map(({ slot, v }) =>
            v ? (
              <SvgImage
                key={slot}
                href={v.r.bodySmall}
                x={v.p.left}
                y={v.p.top}
                width={v.p.width}
                height={v.p.height}
                preserveAspectRatio="none"
              />
            ) : null,
          )}
        </G>
      </Svg>

      {/* The lights: fade in once, then breathe while the tab is in view. */}
      {cars.length > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
          <Svg width={W} height={H} viewBox={VIEWBOX}>
            <Defs>
              {fade}
              <RadialGradient id={`tail${id}`} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={color.accentHot} stopOpacity={0.75} />
                <Stop offset="0.45" stopColor={color.accent} stopOpacity={0.25} />
                <Stop offset="1" stopColor={color.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <G mask={`url(#mask${id})`}>
              {cars.map(({ slot, v }) => {
                const road = ROAD_GLOW[slot];
                // Each lamp's halo, a little wider than tall, scaled to the vehicle.
                const halo = v ? v.p.width * 0.13 : 0;
                return (
                  <G key={slot}>
                    <Ellipse
                      cx={road.cx}
                      cy={road.cy}
                      rx={road.rx}
                      ry={road.ry}
                      fill={`url(#tail${id})`}
                      opacity={road.o}
                    />
                    {v
                      ? v.lights.map((l) => (
                          <Ellipse
                            key={`${l.x},${l.y}`}
                            cx={l.x}
                            cy={l.y}
                            rx={halo}
                            ry={halo * 0.55}
                            fill={`url(#tail${id})`}
                          />
                        ))
                      : null}
                    {v ? (
                      <SvgImage
                        href={v.r.lightsSmall}
                        x={v.p.left}
                        y={v.p.top}
                        width={v.p.width}
                        height={v.p.height}
                        preserveAspectRatio="none"
                      />
                    ) : null}
                  </G>
                );
              })}
            </G>
          </Svg>
        </Animated.View>
      ) : null}

      {/* Position tags, over the lights. */}
      {cars.length > 0 ? (
        <Svg width={W} height={H} viewBox={VIEWBOX} style={StyleSheet.absoluteFill}>
          {cars.map(({ slot, tag }) => (
            <Tag key={slot} slot={slot} label={tag} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** A slanted position tag: dark for the drivers ahead, deep red for you. */
function Tag({ slot, label }: { slot: keyof typeof SLOTS; label: string }) {
  const { x, y } = TAGS[slot];
  const you = slot === 'you';
  const base = you ? 28 : 22;
  const w = tagWidth(label, base);
  // The mock's tags are drawn from the top-left corner; a wider label ("P12")
  // grows the plate leftward from the right edge, so it never runs onto the car.
  const right = x + base;
  const left = right - w;
  const foot = y + TAG_H;
  const points = `${left},${y} ${right},${y} ${right - TAG_LEAN},${foot} ${left - TAG_LEAN},${foot}`;
  return (
    <G>
      <Polygon
        points={points}
        fill={you ? color.accentFill : alpha(color.canvas, 0.85)}
        stroke={you ? undefined : color.outline}
        strokeWidth={you ? 0 : 1}
      />
      <SvgText
        x={(left + right - TAG_LEAN) / 2}
        y={y + 9.1}
        fill={you ? color.onAccent : color.text1}
        fontFamily={font.monoBold}
        fontSize={type.monoSmall.size * 0.85}
        textAnchor="middle"
      >
        {label}
      </SvgText>
    </G>
  );
}

const styles = StyleSheet.create({
  scene: { position: 'absolute', top: 0, width: W, height: H },
});
