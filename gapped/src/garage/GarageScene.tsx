import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { ambient } from '@/theme/motion';
import { alpha, color } from '@/theme/tokens';

/**
 * The garage at night: a bay under one strip light, a roller door behind,
 * the city's glow low on the back wall, and the car parked tail-out with its
 * lights on. Nightrun-Drive's rear car and lighting, moved indoors.
 *
 * Drawn in a 390 × 300 design box (the mockups' phone width) and scaled to
 * the view's width, anchored to its bottom edge. Two canvases, both sized to
 * the view: the scene, which never redraws, and the car's lights over it,
 * whose slow breathe (ambient.breathe) is a native opacity on their layer, so
 * the loop costs no Skia redraw at all. The breathe stops, lights full on,
 * under Reduce Motion and whenever the tab is not focused.
 *
 * Artwork only, hidden from VoiceOver. No manufacturer shapes: the car is the
 * mockups' generic coupé from behind.
 */

export const SCENE_W = 390;
export const SCENE_H = 300;

/** Where the floor meets the back wall, in design units. */
const FLOOR_Y = 190;

/** The car's mock coordinates (a 200-wide box) → the scene: centred, tyres at y≈272. */
const CAR_SCALE = 1.15;
const CAR_X = (SCENE_W - 200 * CAR_SCALE) / 2;
const CAR_Y = 124;

/** Where the car's tyres meet the floor (design units), for a side profile on the same floor. */
export const SCENE_GROUND_Y = CAR_Y + 129 * CAR_SCALE - 6;

// The mock's paths (Nightrun-Drive.dc.html, the parked car), in its 200-wide box.
const BODY =
  'M6 104 C3 92 1 78 2 66 C3 57 8 51 18 49 L42 46 L60 15 C62 11 66 9 72 9 L128 9 C134 9 138 11 140 15 L158 46 L182 49 C192 51 197 57 198 66 C199 78 197 92 194 104 Z';
const GLASS = 'M66 16 L134 16 L152 44 L48 44 Z';
const GLASS_SHEEN = 'M86 16 L99 16 L79 44 L64 44 Z';
const MIRRORS =
  'M20 49 L5 44.5 Q2 44 2.5 47.5 L4 51 Z M180 49 L195 44.5 Q198 44 197.5 47.5 L196 51 Z';
const ROOF_RIM = 'M60 15 C62 11 66 9 72 9 L128 9 C134 9 138 11 140 15';
const BELT = 'M44 47.5 Q100 43.5 156 47.5';
const SHOULDERS = 'M3 72 C3 59 9 51 19 49.5 L43 46.6 M197 72 C197 59 191 51 181 49.5 L157 46.6';
const DIFFUSER = 'M24 92 L176 92 L171 106 L29 106 Z';
const DIFFUSER_FINS = 'M84 93.5 V105 M92 93.5 V105 M108 93.5 V105 M116 93.5 V105';
const LAMPS =
  'M8 55 L58 52 L62 56.5 L60 62.5 L34 63.5 L32 59.5 L9 61.5 Z M192 55 L142 52 L138 56.5 L140 62.5 L166 63.5 L168 59.5 L191 61.5 Z';
const FILAMENTS =
  'M12 57.6 L56 54.8 L58.5 57.6 L56.8 60.6 L37 61.2 M188 57.6 L144 54.8 L141.5 57.6 L143.2 60.6 L163 61.2';
/**
 * The lamps' red on the polished floor: short, so it is spent before the
 * nameplate under the scene, and soft-edged.
 */
const FLOOR_RED = 'M10.4 129 L60.9 129 L57 142 L14 142 Z M139.1 129 L189.6 129 L186 142 L143 142 Z';

/** The roller door's slats: faint rules lit from above. */
const SLATS = Array.from({ length: 16 }, (_, i) => {
  const y = 50 + i * 8.5;
  return `M66 ${y} H324`;
}).join(' ');

const CAR_TRANSFORM = [{ translateX: CAR_X }, { translateY: CAR_Y }, { scale: CAR_SCALE }];

type Props = {
  width: number;
  height: number;
  /** Draw the parked car. False for an empty bay (no vehicle) or a bike drawn over it. */
  car?: boolean;
};

export function GarageScene({ width, height, car = true }: Props): React.JSX.Element | null {
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const live = car && focused && !reduced;
  const lights = useSharedValue(1);

  useEffect(() => {
    if (!live) {
      cancelAnimation(lights);
      lights.set(1);
      return;
    }
    lights.set(
      withRepeat(
        withTiming(0.55, { duration: ambient.breathe, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(lights);
  }, [live, lights]);

  const lightsStyle = useAnimatedStyle(() => ({ opacity: lights.get() }));

  if (width <= 0 || height <= 0) return null;
  const s = width / SCENE_W;
  const frame = [{ translateY: height - SCENE_H * s }, { scale: s }];
  const size = { width, height };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={size}>
        <Group transform={frame}>
          {/* Back wall: night falling to the faint blue of the city behind it. */}
          <Rect x={0} y={0} width={SCENE_W} height={FLOOR_Y}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, FLOOR_Y)}
              colors={[alpha(color.canvas, 0), color.sky, color.surface2]}
              positions={[0, 0.62, 1]}
            />
          </Rect>
          {/* The horizon glow low on the wall, as behind every Nightrun scene. */}
          <Group transform={[{ scaleY: 0.2 }]} origin={vec(SCENE_W / 2, FLOOR_Y)}>
            <Circle cx={SCENE_W / 2} cy={FLOOR_Y} r={280}>
              <RadialGradient
                c={vec(SCENE_W / 2, FLOOR_Y)}
                r={280}
                colors={[alpha(color.horizon, 0.42), alpha(color.horizon, 0)]}
              />
            </Circle>
          </Group>
          {/* Roller door. */}
          <Path path={SLATS} style="stroke" strokeWidth={1} color={alpha(color.text2, 0.05)} />
          <Path
            path={`M62 ${FLOOR_Y} V40 H328 V${FLOOR_Y}`}
            style="stroke"
            strokeWidth={1.5}
            color={color.hairline}
          />

          {/* Floor. */}
          <Rect x={0} y={FLOOR_Y} width={SCENE_W} height={SCENE_H - FLOOR_Y}>
            <LinearGradient
              start={vec(0, FLOOR_Y)}
              end={vec(0, SCENE_H)}
              colors={[color.surface2, color.surface1, color.canvas]}
              positions={[0, 0.3, 1]}
            />
          </Rect>
          <Path
            path={`M0 ${FLOOR_Y} H${SCENE_W}`}
            style="stroke"
            strokeWidth={1}
            color={alpha(color.horizon, 0.35)}
          />

          {/* The strip light and its cone. */}
          <Path path="M146 12 L244 12 L384 300 L6 300 Z">
            <LinearGradient
              start={vec(0, 12)}
              end={vec(0, SCENE_H)}
              colors={[alpha(color.text2, 0.16), alpha(color.text2, 0.05), alpha(color.text2, 0)]}
              positions={[0, 0.7, 1]}
            />
            <BlurMask blur={14} style="normal" />
          </Path>
          <RoundedRect x={140} y={8} width={110} height={4} r={1.5} color={alpha(color.text2, 0.5)}>
            <BlurMask blur={10} style="normal" />
          </RoundedRect>
          <RoundedRect x={140} y={8} width={110} height={4} r={1.5} color={color.text1} />

          {/* The pool of light on the floor, and the bay's lines. */}
          <Group transform={[{ scaleY: 0.15 }]} origin={vec(SCENE_W / 2, 270)}>
            <Circle cx={SCENE_W / 2} cy={270} r={205}>
              <RadialGradient
                c={vec(SCENE_W / 2, 270)}
                r={205}
                colors={[alpha(color.text2, 0.2), alpha(color.text2, 0)]}
              />
            </Circle>
          </Group>
          <Path
            path={`M148 ${FLOOR_Y} L-90 ${SCENE_H} M242 ${FLOOR_Y} L480 ${SCENE_H}`}
            style="stroke"
            strokeWidth={1.2}
            color={alpha(color.text1, 0.14)}
          />

          {car ? (
            <Group transform={CAR_TRANSFORM}>
              <Oval x={-6} y={118} width={212} height={11} color={alpha(color.canvas, 0.95)}>
                <BlurMask blur={4} style="normal" />
              </Oval>
              <RoundedRect x={11} y={86} width={35} height={39} r={6} color={color.canvas} />
              <RoundedRect x={154} y={86} width={35} height={39} r={6} color={color.canvas} />
              <Path path={MIRRORS} color={color.surface1} />
              <Path path={BODY}>
                <LinearGradient
                  start={vec(0, 9)}
                  end={vec(0, 104)}
                  colors={[color.surface3, color.surface1, color.canvas]}
                  positions={[0, 0.42, 1]}
                />
              </Path>
              <Path path={GLASS}>
                <LinearGradient
                  start={vec(0, 16)}
                  end={vec(0, 44)}
                  colors={[color.surface2, color.canvas]}
                />
              </Path>
              <Path path={GLASS_SHEEN} color={alpha(color.text2, 0.08)} />
              {/* Rim light from the strip above: the roof edge catches it most. */}
              <Path path={ROOF_RIM} style="stroke" strokeWidth={1.1} color={alpha(color.text2, 0.8)} />
              <Path path={BELT} style="stroke" strokeWidth={1} color={alpha(color.text2, 0.45)} />
              <Path path={SHOULDERS} style="stroke" strokeWidth={1} color={alpha(color.text2, 0.5)} />
              {/* The lamps' red washing the tail. */}
              <Oval x={2} y={56} width={196} height={32} color={alpha(color.accent, 0.06)} />
              <RoundedRect x={80} y={68} width={40} height={11} r={1.5} color={color.surface1} />
              <RoundedRect
                x={80}
                y={68}
                width={40}
                height={11}
                r={1.5}
                style="stroke"
                strokeWidth={0.6}
                color={color.hairline}
              />
              <Path path={DIFFUSER} color={color.canvas} />
              <Path path={DIFFUSER_FINS} style="stroke" strokeWidth={0.8} color={color.divider} />
              {[41, 53, 147, 159].map((cx) => (
                <Circle key={cx} cx={cx} cy={99} r={4.3} color={color.canvas} />
              ))}
              {[41, 53, 147, 159].map((cx) => (
                <Circle
                  key={`r${cx}`}
                  cx={cx}
                  cy={99}
                  r={4.3}
                  style="stroke"
                  strokeWidth={0.9}
                  color={color.outline}
                />
              ))}
            </Group>
          ) : null}

          {/* The bay fades back into the night under whatever sits below it. */}
          <Rect x={0} y={248} width={SCENE_W} height={SCENE_H - 248}>
            <LinearGradient
              start={vec(0, 248)}
              end={vec(0, SCENE_H)}
              colors={[alpha(color.canvas, 0), alpha(color.canvas, 0.85), color.canvas]}
              positions={[0, 0.6, 1]}
            />
          </Rect>
        </Group>
      </Canvas>

      {car ? (
        <Animated.View style={[StyleSheet.absoluteFill, lightsStyle]}>
          <Canvas style={size}>
            <Group transform={frame}>
              <Group transform={CAR_TRANSFORM}>
                {/* Red on the polished floor, under each lamp. */}
                <Path path={FLOOR_RED}>
                  <LinearGradient
                    start={vec(0, 129)}
                    end={vec(0, 142)}
                    colors={[alpha(color.accentPress, 0.36), alpha(color.accent, 0)]}
                  />
                  <BlurMask blur={4} style="normal" />
                </Path>
                {/* Each lamp: a wide halo, a hot bloom, the lens, the filament. */}
                <Oval x={-6} y={44} width={80} height={28} color={alpha(color.accent, 0.3)}>
                  <BlurMask blur={10} style="normal" />
                </Oval>
                <Oval x={126} y={44} width={80} height={28} color={alpha(color.accent, 0.3)}>
                  <BlurMask blur={10} style="normal" />
                </Oval>
                <Path path={LAMPS} color={alpha(color.accentPress, 0.8)}>
                  <BlurMask blur={4} style="normal" />
                </Path>
                <Path path={LAMPS} color={color.accentFill} />
                <Path
                  path={FILAMENTS}
                  style="stroke"
                  strokeWidth={1}
                  strokeCap="round"
                  strokeJoin="round"
                  color={color.accentCore}
                />
              </Group>
            </Group>
          </Canvas>
        </Animated.View>
      ) : null}
    </View>
  );
}
