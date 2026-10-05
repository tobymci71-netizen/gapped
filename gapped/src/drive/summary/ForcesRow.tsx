import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ProLockedStat } from '@/components/ProLockedStat';
import { Text } from '@/components/Text';
import type { PeakGView } from '@/drive/driveAccess';
import { alpha, color, slant, space } from '@/theme/tokens';
import { Figure } from './Figure';
import { gRing } from './geometry';

const G_LABEL = 'Peak g-force';
const ZERO_TO_SIXTY_LABEL = '0–60 mph';

type Props = {
  peakG: PeakGView;
  /** The drive's peak g, when there is one (for the ring's scale). */
  maxG: number | null;
  zeroTo60S: number | null;
  /** Where a locked Peak g-force leads (useGoPro). */
  onGoPro: () => void;
};

/**
 * Peak g-force and 0–60, side by side under the speed trace.
 *
 * Peak g-force keeps its Pro lock exactly (peakGView): locked, the PRO chip
 * stands in its place and leads to Pro; with no motion data, it says so
 * rather than drawing an empty ring. 0–60 is shown only when one was timed,
 * and otherwise says plainly that it was not, and why.
 */
export function ForcesRow({ peakG, maxG, zeroTo60S, onGoPro }: Props) {
  return (
    <View style={styles.row}>
      {peakG.kind === 'locked' ? (
        <ProLockedStat label={G_LABEL} onPress={onGoPro} />
      ) : peakG.kind === 'value' ? (
        <View style={styles.g}>
          <GCircle maxG={maxG ?? Number(peakG.value)} />
          <Figure
            label={G_LABEL}
            value={peakG.value}
            unit={peakG.unit}
            spoken={`${peakG.value} g`}
            style={styles.gFigure}
          />
        </View>
      ) : (
        <View
          style={styles.slot}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${G_LABEL}, not recorded. No motion sensor data on this drive.`}
        >
          <Text variant="mono">{G_LABEL}</Text>
          <Text variant="bodySemibold">Not recorded</Text>
          <Text variant="label">No motion sensor data</Text>
        </View>
      )}

      {zeroTo60S != null ? (
        <Figure
          label={ZERO_TO_SIXTY_LABEL}
          value={zeroTo60S.toFixed(2)}
          unit="s"
          spoken={`${zeroTo60S.toFixed(2)} seconds`}
          divider
        />
      ) : (
        <View
          style={[styles.slot, styles.withDivider]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${ZERO_TO_SIXTY_LABEL}, not measured. Needs a standing start.`}
        >
          <View style={styles.divider} />
          <Text variant="mono">{ZERO_TO_SIXTY_LABEL}</Text>
          <Text variant="bodySemibold">Not measured</Text>
          <Text variant="label">Needs a standing start</Text>
        </View>
      )}
    </View>
  );
}

const SIZE = 48;
const R = 22;

/**
 * The g-circle: rings at the scale and half of it, a crosshair, and the peak
 * as a lit ring at its own radius. A ring, not a dot at an angle: the phone
 * measured how hard the car pulled, not which way its axes faced in the car,
 * so a friction-circle dot would claim a direction nobody recorded.
 */
function GCircle({ maxG }: { maxG: number }) {
  const ring = gRing(maxG);
  const r = Math.max(2, R * ring.fraction);
  return (
    // Decorative: the figure beside it says the value.
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle cx={24} cy={24} r={R} fill="none" stroke={color.hairline} strokeWidth={1} />
        <Circle cx={24} cy={24} r={R / 2} fill="none" stroke={color.surface3} strokeWidth={1} />
        <Path d="M24 2 V46 M2 24 H46" stroke={color.surface3} strokeWidth={1} />
        <Circle cx={24} cy={24} r={r} fill="none" stroke={alpha(color.accent, 0.25)} strokeWidth={4} />
        <Circle cx={24} cy={24} r={r} fill="none" stroke={color.accent} strokeWidth={1.4} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  g: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  gFigure: { flex: 1 },
  slot: { flex: 1, gap: 2, paddingVertical: space.xs },
  withDivider: { paddingLeft: 18 },
  divider: {
    position: 'absolute',
    left: 0,
    top: 2,
    bottom: 2,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: color.hairline,
    transform: slant.transform,
  },
});
