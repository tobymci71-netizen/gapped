import React, { useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { color } from '@/theme/tokens';

/**
 * The tip of one of the logo's red streaks, reused as an arrow: a dart with a
 * notched tail. The primary button's arrow, and the head of every leaderboard
 * bar (StreakBar, below).
 *
 * Geometry is the mockups' `0,1 30,6 0,11 8,6` (button, 30×12) and
 * `0,0 16,3 0,6 5,3` (bar tip, 16×6), normalised: the notch sits at 27–31% of
 * the length and the dart is as tall as its box.
 *
 * Decorative: always hidden from VoiceOver.
 */
export function StreakArrow({
  width = 30,
  height = Math.round(width * 0.4),
  color: ink = color.text1,
  style,
}: {
  width?: number;
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const notch = width * 0.27;
  const inset = height * 0.08;
  return (
    <View
      style={[{ width, height }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polygon
          points={`0,${inset} ${width},${height / 2} 0,${height - inset} ${notch},${height / 2}`}
          fill={ink}
        />
      </Svg>
    </View>
  );
}

type RampStop = { offset: number; color: string; opacity: number };

/** A row's bar: faint at the tail, nearly full at the head (the mock's #rkS). */
const RAMP: readonly RampStop[] = [
  { offset: 0, color: color.accent, opacity: 0.16 },
  { offset: 0.75, color: color.accent, opacity: 0.6 },
  { offset: 1, color: color.accent, opacity: 0.95 },
];

/** A bar below the podium, burning lower: a flatter, fainter ramp (the mock's #rkD). */
const DIM_RAMP: readonly RampStop[] = [
  { offset: 0, color: color.accent, opacity: 0.1 },
  { offset: 1, color: color.accent, opacity: 0.55 },
];
/** The dim bar's tip (the mock's fill-opacity .8). */
const DIM_TIP = 0.8;

/** The viewer's own bar, running hot to a white-hot tip (the mock's #rkY). */
const HOT_RAMP: readonly RampStop[] = [
  { offset: 0, color: color.accentHot, opacity: 0.22 },
  { offset: 0.72, color: color.accentHot, opacity: 0.95 },
  { offset: 1, color: color.accentCore, opacity: 1 },
];

/**
 * A leaderboard bar drawn as a light streak: a taper that brightens toward a
 * StreakArrow head (Nightrun-Ranks). `progress` is the row's share of the
 * leader's value, 0–1; the bar is `width` × progress long. `you` draws the
 * viewer's own row hot: a brighter ramp and a white-hot core in the tip.
 * `dim` burns a bar lower, as the mock does below the podium (`you` wins).
 *
 * Draw the glow, if any, around this (it is a light, so it may have one);
 * the bar itself stays crisp. Decorative: the row's text carries the value.
 */
export function StreakBar({
  width,
  progress,
  you = false,
  dim = false,
  height = 6,
  style,
}: {
  width: number;
  progress: number;
  you?: boolean;
  dim?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const tip = height * (16 / 6);
  const len = Math.max(tip, width * p);
  const mid = height / 2;
  const shaftEnd = len - tip * 0.8;
  const notch = len - tip + tip * 0.31;
  const half = height * 0.23; // the shaft's half-height at its head
  const tail = height * 0.08; // ...and at its tail
  const low = dim && !you;
  const ramp = you ? HOT_RAMP : low ? DIM_RAMP : RAMP;
  return (
    <View
      style={[{ width, height }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={len} height={height} viewBox={`0 0 ${len} ${height}`}>
        <Defs>
          <LinearGradient id={`sb${id}`} x1="0" y1="0" x2="1" y2="0">
            {ramp.map((stop) => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
                stopOpacity={stop.opacity}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Polygon
          points={`0,${mid - tail} ${shaftEnd},${mid - half} ${shaftEnd},${mid + half} 0,${mid + tail}`}
          fill={`url(#sb${id})`}
        />
        <Polygon
          points={`${len - tip},0 ${len},${mid} ${len - tip},${height} ${notch},${mid}`}
          fill={you ? color.accentHot : color.accent}
          fillOpacity={low ? DIM_TIP : 1}
        />
        {you ? (
          <Polygon
            points={`${len - tip * 0.62},${mid - height * 0.18} ${len - tip * 0.12},${mid} ${len - tip * 0.62},${mid + height * 0.18}`}
            fill={color.accentCore}
          />
        ) : null}
      </Svg>
    </View>
  );
}
