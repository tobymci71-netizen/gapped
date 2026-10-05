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
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Mask,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { ambient, duration } from '@/theme/motion';
import { alpha, color, font, type } from '@/theme/tokens';

/**
 * The Ranks hero's scene (Nightrun-Ranks): a night road running to the
 * horizon, with the tail lights of the drivers ahead tagged by position and
 * your own car nearest the camera.
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

/** Each slot's lamps (two halos) and its light on the road beneath, artboard units. */
const GLOWS = {
  far: {
    lamps: [
      { cx: 274.6, cy: 36.5, rx: 7, ry: 7 },
      { cx: 289.4, cy: 36.5, rx: 7, ry: 7 },
    ],
    road: { cx: 282, cy: 45, rx: 13, ry: 2.2, o: 0.5 },
  },
  mid: {
    lamps: [
      { cx: 255.7, cy: 59.7, rx: 12, ry: 7 },
      { cx: 283.6, cy: 59.7, rx: 12, ry: 7 },
    ],
    road: { cx: 269.7, cy: 75.5, rx: 24, ry: 3.4, o: 0.5 },
  },
  you: {
    lamps: [
      { cx: 218.9, cy: 105.3, rx: 24, ry: 11 },
      { cx: 272.3, cy: 105.3, rx: 24, ry: 11 },
    ],
    road: { cx: 245.6, cy: 135, rx: 46, ry: 6, o: 0.55 },
  },
} as const;

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

/** The car from behind, on a 200 × 125 grid (the mock's path). */
const BODY =
  'M6 104 C3 92 1 78 2 66 C3 57 8 51 18 49 L42 46 L60 15 C62 11 66 9 72 9 L128 9 C134 9 138 11 140 15 L158 46 L182 49 C192 51 197 57 198 66 C199 78 197 92 194 104 Z';
const ROOF = 'M60 15 C62 11 66 9 72 9 L128 9 C134 9 138 11 140 15';
const LAMP_L = '8,55 58,52 62,56.5 60,62.5 34,63.5 32,59.5 9,61.5';
const LAMP_R = '192,55 142,52 138,56.5 140,62.5 166,63.5 168,59.5 191,61.5';

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
  /** Draw your own car, tagged "You", nearest the camera. */
  you: boolean;
};

export function RoadAhead({ left, ahead, leader, you }: Props): React.JSX.Element {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  // With one car ahead it takes the nearer slot; the far slot is the leader's.
  const cars: { slot: keyof typeof SLOTS; tag: string }[] = [];
  if (leader) cars.push({ slot: 'far', tag: leader });
  if (ahead) cars.push({ slot: 'mid', tag: ahead });
  if (you) cars.push({ slot: 'you', tag: 'You' });

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
          <LinearGradient id={`body${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.surface3} />
            <Stop offset="0.45" stopColor={color.surface1} />
            <Stop offset="1" stopColor={color.canvas} />
          </LinearGradient>
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
          {cars.map(({ slot }) => (
            <Car key={slot} slot={slot} bodyFill={`url(#body${id})`} />
          ))}
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
              {cars.map(({ slot }) => {
                const g = GLOWS[slot];
                return (
                  <G key={slot}>
                    <Ellipse
                      cx={g.road.cx}
                      cy={g.road.cy}
                      rx={g.road.rx}
                      ry={g.road.ry}
                      fill={`url(#tail${id})`}
                      opacity={g.road.o}
                    />
                    {g.lamps.map((l) =>
                      l.rx === l.ry ? (
                        <Circle key={l.cx} cx={l.cx} cy={l.cy} r={l.rx} fill={`url(#tail${id})`} />
                      ) : (
                        <Ellipse
                          key={l.cx}
                          cx={l.cx}
                          cy={l.cy}
                          rx={l.rx}
                          ry={l.ry}
                          fill={`url(#tail${id})`}
                        />
                      ),
                    )}
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

/** One car from behind, at its slot's depth. The nearer two show their glass. */
function Car({ slot, bodyFill }: { slot: keyof typeof SLOTS; bodyFill: string }) {
  const { x, y, s } = SLOTS[slot];
  const near = slot === 'you';
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Rect x={11} y={86} width={35} height={39} rx={6} fill={color.canvas} />
      <Rect x={154} y={86} width={35} height={39} rx={6} fill={color.canvas} />
      <Path d={BODY} fill={bodyFill} />
      {slot !== 'far' ? <Path d="M66 16 L134 16 L152 44 L48 44 Z" fill={color.surface2} /> : null}
      <Path
        d={ROOF}
        fill="none"
        stroke={alpha(color.text2, near ? 0.75 : 0.55)}
        strokeWidth={near ? 1 : 0.85}
        vectorEffect="non-scaling-stroke"
      />
      {near ? (
        <>
          <Path
            d="M3 72 C3 59 9 51 19 49.5 L43 46.6 M197 72 C197 59 191 51 181 49.5 L157 46.6"
            fill="none"
            stroke={alpha(color.text2, 0.4)}
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
          />
          <Rect x={80} y={68} width={40} height={11} rx={1.5} fill={color.surface1} />
          <Path d="M24 92 L176 92 L171 106 L29 106 Z" fill={color.canvas} />
        </>
      ) : null}
      <Polygon points={LAMP_L} fill={color.accent} />
      <Polygon points={LAMP_R} fill={color.accent} />
      {near ? (
        // The lamps' white-hot filaments: the one car close enough to see them.
        <>
          <Polyline
            points="12,57.6 56,54.8 58.5,57.6 56.8,60.6 37,61.2"
            fill="none"
            stroke={color.accentCore}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Polyline
            points="188,57.6 144,54.8 141.5,57.6 143.2,60.6 163,61.2"
            fill="none"
            stroke={color.accentCore}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
    </G>
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
