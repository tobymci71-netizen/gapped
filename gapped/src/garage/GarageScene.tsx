import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { alpha, color } from '@/theme/tokens';

/**
 * The garage at night, the bay the person's vehicle parks in (GarageHero
 * stands its render on the floor): one strip light, a roller door behind,
 * the city's glow low on the back wall. Nightrun-Drive's lighting, moved
 * indoors.
 *
 * Drawn in a 390 × 300 design box (the mockups' phone width) and scaled to
 * the view's width, anchored to its bottom edge, on one canvas that never
 * redraws. Artwork only, hidden from VoiceOver.
 */

export const SCENE_W = 390;
export const SCENE_H = 300;

/** Where the floor meets the back wall, in design units. */
const FLOOR_Y = 190;

/** Where a vehicle's tyres meet the floor, in design units. */
export const SCENE_GROUND_Y = 266;

/** The roller door's slats: faint rules lit from above. */
const SLATS = Array.from({ length: 16 }, (_, i) => {
  const y = 50 + i * 8.5;
  return `M66 ${y} H324`;
}).join(' ');

type Props = {
  width: number;
  height: number;
};

export function GarageScene({ width, height }: Props): React.JSX.Element | null {
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
    </View>
  );
}
