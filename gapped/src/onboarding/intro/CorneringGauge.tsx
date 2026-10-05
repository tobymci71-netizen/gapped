import {
  BlurMask,
  Canvas,
  Group,
  Path,
  Skia,
  SweepGradient,
  type Transforms3d,
  vec,
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';
import { Text } from '@/components/Text';
import { alpha, color, type } from '@/theme/tokens';
import { NightVehicleRear } from './hero/NightVehicle';
import {
  bodyRollDeg,
  GAUGE_LABELS,
  gaugeAngle,
  litEnd,
  litStart,
  pointOnGauge,
} from './introTimeline';

/** Largest arc radius; on a 375pt phone the width sets it lower. */
const MAX_RADIUS = 150;
const ARC_STROKE = 4;
/** Room above the arc for the "0" label, and below the ends for "1.0". */
const TOP_PAD = 30;
const BOTTOM_PAD = 14;
/** Labels sit this far outside the arc. */
const LABEL_GAP = 16;
/**
 * Label box: wide enough for "1.0"; its height is the mono label's line
 * height, for centring. The scale is an instrument's data, so it is set in
 * Martian Mono like every figure's label.
 */
const LABEL_BOX = { width: 36, height: type.monoSmall.lineHeight };
/** The scale labels are part of the instrument, so they cap with it. */
const LABEL_MAX_SCALE = 1.2;
/** Ticks every 0.1 g; the long ones at 0, 0.5 and 1.0. */
const TICK_STEP_G = 0.1;

/**
 * The lit stretch of the scale is a light, so it is red: dim near zero,
 * brightening to the white-hot edge of a light at 1 g, the same at the same
 * g on both sides. All from the palette.
 *
 * A sweep gradient starts at 3 o'clock and runs clockwise, and the arc only
 * occupies the top half (9 o'clock through 12 to 3), so the stops live between
 * 0.5 and 1.
 */
const LIT_COLORS = [
  color.accentCore,
  color.accentCore,
  color.accentHot,
  color.accent,
  alpha(color.accent, 0.45),
  color.accent,
  color.accentHot,
  color.accentCore,
];
const LIT_POSITIONS = [0, 0.5, 0.56, 0.64, 0.75, 0.86, 0.94, 1];

/** The car's own frame (./hero/NightVehicle): 200 wide, ground at 125. */
const CAR_FRAME = { width: 200, ground: 125 };

type Props = {
  /** Width available; the gauge centres itself in it. */
  width: number;
  /** Signed lateral g, live on the UI thread. Positive is a right-hander. */
  g: SharedValue<number>;
};

/**
 * The cornering G instrument: a half-circle scale (0 at the top, 0.5 and 1.0 g
 * each side), a marker on the live value with the arc lit red from zero to
 * it, and the welcome's night car seen from behind, tail lights on, rolling
 * with the load.
 *
 * Everything that moves reads one shared value, so the marker, the lit arc and
 * the body roll cannot drift apart. Geometry is built once per size; per frame
 * it is three derived numbers.
 */
export function CorneringGauge({ width, g }: Props) {
  const radius = Math.min(MAX_RADIUS, Math.round(width * 0.38));
  const height = TOP_PAD + radius + BOTTOM_PAD;
  const cx = width / 2;
  const cy = TOP_PAD + radius;

  const geo = useMemo(() => {
    const arc = Skia.PathBuilder.Make()
      .addArc(Skia.XYWHRect(cx - radius, cy - radius, radius * 2, radius * 2), 180, 180)
      .build();

    const minor = Skia.PathBuilder.Make();
    const major = Skia.PathBuilder.Make();
    const steps = Math.round(1 / TICK_STEP_G);
    for (let i = -steps; i <= steps; i++) {
      const tickG = i * TICK_STEP_G;
      const isMajor = i % (steps / 2) === 0;
      const outer = pointOnGauge(cx, cy, radius - 7, tickG);
      const inner = pointOnGauge(cx, cy, radius - (isMajor ? 17 : 12), tickG);
      (isMajor ? major : minor).moveTo(outer.x, outer.y).lineTo(inner.x, inner.y);
    }

    // Drawn at 12 o'clock and rotated into place, crossing the arc.
    const marker = Skia.Path.Line(vec(cx, cy - radius - 9), vec(cx, cy - radius + 9));

    // The car, as wide as the old drawing (1.05 radii), standing on the
    // gauge's centre line.
    const k = (radius * 1.05) / CAR_FRAME.width;
    const car = [
      { translateX: cx - (CAR_FRAME.width / 2) * k },
      { translateY: cy - CAR_FRAME.ground * k },
      { scale: k },
    ];
    return { arc, minor: minor.build(), major: major.build(), marker, car };
  }, [cx, cy, radius]);

  const start = useDerivedValue(() => litStart(g.value));
  const end = useDerivedValue(() => litEnd(g.value));
  const markerTransform = useDerivedValue(() => [{ rotate: gaugeAngle(g.value) }]);
  const rollTransform = useDerivedValue<Transforms3d>(() => [
    { rotate: (bodyRollDeg(g.value) * Math.PI) / 180 },
  ]);

  const lit = <SweepGradient c={vec(cx, cy)} colors={LIT_COLORS} positions={LIT_POSITIONS} />;

  return (
    <View style={{ width, height }}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* The whole scale, unlit: a dark track on the night. */}
        <Path
          path={geo.arc}
          style="stroke"
          strokeWidth={ARC_STROKE}
          strokeCap="round"
          color={color.surface3}
        />
        {/* Lit from zero to the marker: a light, so it glows. */}
        <Path
          path={geo.arc}
          style="stroke"
          strokeWidth={ARC_STROKE * 3}
          strokeCap="round"
          start={start}
          end={end}
          opacity={0.35}
        >
          {lit}
          <BlurMask blur={8} style="normal" />
        </Path>
        <Path
          path={geo.arc}
          style="stroke"
          strokeWidth={ARC_STROKE}
          strokeCap="round"
          start={start}
          end={end}
        >
          {lit}
        </Path>
        <Path path={geo.minor} style="stroke" strokeWidth={1.5} color={color.outline} />
        <Path path={geo.major} style="stroke" strokeWidth={2} color={color.text3} />

        {/* The car. Tyres are planted; everything above them rolls. */}
        <Group transform={geo.car}>
          <NightVehicleRear kind="car" roll={rollTransform} streak={0.6} outline />
        </Group>

        {/* Marker last, so it is never under the car or the ticks. A needle,
            not a light: white, no glow. */}
        <Group transform={markerTransform} origin={vec(cx, cy)}>
          <Path
            path={geo.marker}
            style="stroke"
            strokeWidth={3}
            strokeCap="round"
            color={color.text1}
          />
        </Group>
      </Canvas>

      {GAUGE_LABELS.map((l) => {
        const p = pointOnGauge(cx, cy, radius + LABEL_GAP, l.g);
        return (
          <Text
            key={l.g}
            variant="monoSmall"
            maxFontSizeMultiplier={LABEL_MAX_SCALE}
            style={[
              styles.label,
              { left: p.x - LABEL_BOX.width / 2, top: p.y - LABEL_BOX.height / 2 },
            ]}
          >
            {l.text}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // No fixed height: at the label's largest scale its line outgrows the box,
  // and a height would clip it.
  label: { position: 'absolute', width: LABEL_BOX.width, textAlign: 'center' },
});
