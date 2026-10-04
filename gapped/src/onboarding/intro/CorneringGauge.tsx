import {
  BlurMask,
  Canvas,
  Group,
  Path,
  Skia,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';
import { Text } from '@/components/Text';
import { color } from '@/theme/tokens';
import {
  bodyRollDeg,
  GAUGE_LABELS,
  gaugeAngle,
  litEnd,
  litStart,
  pointOnGauge,
} from './introTimeline';
import { buildRearCar } from './rearCar';

/** Largest arc radius; on a 375pt phone the width sets it lower. */
const MAX_RADIUS = 150;
const ARC_STROKE = 4;
/** Room above the arc for the "0" label, and below the ends for "1.0". */
const TOP_PAD = 30;
const BOTTOM_PAD = 14;
/** Labels sit this far outside the arc. */
const LABEL_GAP = 16;
/** Label box: wide enough for "1.0"; its height is legal's line height, for centring. */
const LABEL_BOX = { width: 36, height: 18 };
/** The scale labels are part of the instrument, so they cap with it. */
const LABEL_MAX_SCALE = 1.2;
/** Ticks every 0.1 g; the long ones at 0, 0.5 and 1.0. */
const TICK_STEP_G = 0.1;

/**
 * The cornering scale's colours: green at the centre, through the accent and
 * gold, to orange and red at the ends. All from the palette; the gauge invents
 * none of its own.
 *
 * A sweep gradient starts at 3 o'clock and runs clockwise, and the arc only
 * occupies the top half (9 o'clock through 12 to 3), so the stops live between
 * 0.5 and 1. Each colour sits at the same g on both sides.
 */
const SCALE_COLORS = [
  color.danger,
  color.danger,
  color.warning,
  color.rank1,
  color.accent,
  color.success,
  color.accent,
  color.rank1,
  color.warning,
  color.danger,
];
const SCALE_POSITIONS = [0, 0.5, 0.5625, 0.625, 0.6875, 0.75, 0.8125, 0.875, 0.9375, 1];

type Props = {
  /** Width available; the gauge centres itself in it. */
  width: number;
  /** Signed lateral g, live on the UI thread. Positive is a right-hander. */
  g: SharedValue<number>;
};

/**
 * The cornering G instrument: a half-circle scale (0 at the top, 0.5 and 1.0 g
 * each side), a marker on the live value with the arc lit from zero to it,
 * and a car seen from behind, rolling with the load.
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

    const car = buildRearCar(cx, cy, radius * 1.05);
    return { arc, minor: minor.build(), major: major.build(), marker, car };
  }, [cx, cy, radius]);

  const start = useDerivedValue(() => litStart(g.value));
  const end = useDerivedValue(() => litEnd(g.value));
  const markerTransform = useDerivedValue(() => [{ rotate: gaugeAngle(g.value) }]);
  const rollTransform = useDerivedValue(() => [
    { rotate: (bodyRollDeg(g.value) * Math.PI) / 180 },
  ]);

  const gradient = (
    <SweepGradient c={vec(cx, cy)} colors={SCALE_COLORS} positions={SCALE_POSITIONS} />
  );
  const { car } = geo;

  return (
    <View style={{ width, height }}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* The whole scale, dimmed: the colours read before anything lights. */}
        <Path
          path={geo.arc}
          style="stroke"
          strokeWidth={ARC_STROKE}
          strokeCap="round"
          opacity={0.28}
        >
          {gradient}
        </Path>
        {/* Lit from zero to the marker, with a soft glow under it. */}
        <Path
          path={geo.arc}
          style="stroke"
          strokeWidth={ARC_STROKE * 3}
          strokeCap="round"
          start={start}
          end={end}
          opacity={0.3}
        >
          {gradient}
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
          {gradient}
        </Path>
        <Path path={geo.minor} style="stroke" strokeWidth={1.5} color={color.disabled} />
        <Path path={geo.major} style="stroke" strokeWidth={2} color={color.text3} />

        {/* The car. Tyres are planted; everything above them rolls. */}
        <Path path={car.shadow} style="fill" color={color.text1} opacity={0.1}>
          <BlurMask blur={6} style="normal" />
        </Path>
        {/* Rubber: near-black with a faint edge, so it reads as tyre, not box. */}
        <Path path={car.tyres} style="fill" color={color.surface1} />
        <Path path={car.tyres} style="stroke" strokeWidth={car.hairline} color={color.disabled} />
        <Group transform={rollTransform} origin={car.rollCentre}>
          <Path path={car.body} style="fill" color={color.surface2} />
          <Path
            path={car.body}
            style="stroke"
            strokeWidth={car.stroke}
            strokeJoin="round"
            color={color.text1}
          />
          <Path path={car.glass} style="fill" color={color.canvas} />
          <Path
            path={car.glass}
            style="stroke"
            strokeWidth={car.hairline}
            strokeJoin="round"
            color={color.text3}
          />
          <Path
            path={car.lightBar}
            style="stroke"
            strokeWidth={car.hairline}
            color={color.danger}
            opacity={0.55}
          />
          <Path path={car.lamps} style="fill" color={color.danger} />
          <Path path={car.trim} style="stroke" strokeWidth={car.hairline} color={color.text3} />
        </Group>

        {/* Marker last, so it is never under the car or the ticks. */}
        <Group transform={markerTransform} origin={vec(cx, cy)}>
          <Path
            path={geo.marker}
            style="stroke"
            strokeWidth={6}
            strokeCap="round"
            color={color.text1}
            opacity={0.35}
          >
            <BlurMask blur={5} style="normal" />
          </Path>
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
            variant="legal"
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
