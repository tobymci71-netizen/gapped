import React, { useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { Text } from '@/components/Text';
import { alpha, color, space } from '@/theme/tokens';
import { clockLabel, spokenSpeedUnit, tickLabel } from './format';
import { timeTicks, type SpeedTrace as Trace } from './geometry';

/** The plot's frame (pt), from the mock: rules under a 104pt trace, times below. */
const LEFT = 26;
const TOP = 16;
const BASELINE = 88;
const HEIGHT = 108;
/** An inner time label's least width (":05"); longer ones ("2:00 PM") widen. */
const TICK_W = 40;
/**
 * Room a mono time label takes, per character, at the small size and the
 * axis's largest Dynamic Type step (1.15×) — Martian Mono at width 87.5
 * advances about 0.6 em.
 */
const CHAR_W = 6.2 * 1.15;
const LABEL_GAP = 6;

type Props = {
  trace: Trace;
  /** The drive's average speed, display units (distance over time, as the stat). */
  average: number;
  unit: string;
  width: number;
};

/**
 * Speed through the drive, from the drive's own fixes (geometry.speedTrace):
 * a white trace over a faint fill, the average as a dashed rule, and one red
 * light at the fastest moment, labelled with its figure. Rules at round
 * speeds on the left, the clock along the bottom.
 *
 * One element to VoiceOver, described in a sentence.
 */
export function SpeedTrace({ trace, average, unit, width }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const plotW = Math.max(1, width - LEFT);
  const x = (f: number) => LEFT + f * plotW;
  const y = (v: number) => BASELINE - (Math.max(0, v) / trace.yMax) * (BASELINE - TOP);

  const { line, area } = useMemo(() => {
    const pts = trace.points.map((p) => `${(LEFT + p.f * plotW).toFixed(1)} ${(BASELINE - (Math.max(0, p.v) / trace.yMax) * (BASELINE - TOP)).toFixed(1)}`);
    const l = `M${pts.join(' L')}`;
    const first = trace.points[0];
    const last = trace.points[trace.points.length - 1];
    const a = `${l} L${(LEFT + last.f * plotW).toFixed(1)} ${BASELINE} L${(LEFT + first.f * plotW).toFixed(1)} ${BASELINE} Z`;
    return { line: l, area: a };
  }, [trace, plotW]);

  const peakX = x(trace.peak.f);
  const peakY = y(trace.peak.v);
  const avgY = y(average);
  const top = Math.round(trace.peak.v);
  const avg = Math.round(average);

  const start = clockLabel(trace.t0);
  const end = clockLabel(trace.t1);
  // Inner ticks that would print into the end labels are left out.
  const inner = timeTicks(trace.t0, trace.t1).filter((t) => {
    const tx = x((t - trace.t0) / (trace.t1 - trace.t0));
    const half = (tickLabel(t).length * CHAR_W) / 2;
    return (
      tx - half - LABEL_GAP > LEFT + start.length * CHAR_W &&
      tx + half + LABEL_GAP < width - end.length * CHAR_W
    );
  });
  const spokenUnit = spokenSpeedUnit(unit);
  const describe = `Speed through the drive, from ${start} to ${end}: averaging ${avg} ${spokenUnit}, peaking at ${top} ${spokenUnit} at ${clockLabel(trace.peak.t)}.`;

  return (
    <View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Speed
        </Text>
        <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.key}>
            <Svg width={14} height={2}>
              <Path d="M0 1 H14" stroke={color.text3} strokeWidth={1.2} strokeDasharray="3 2" />
            </Svg>
            <Text variant="monoSmall">avg {avg}</Text>
          </View>
          <View style={styles.key}>
            <Svg width={7} height={7}>
              <Circle cx={3.5} cy={3.5} r={3} fill={color.accent} />
            </Svg>
            <Text variant="monoSmall">top {top}</Text>
          </View>
        </View>
      </View>

      <View
        style={{ width, height: HEIGHT, marginTop: space.sm }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={describe}
      >
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id={`area${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color.text1} stopOpacity={0.12} />
              <Stop offset="1" stopColor={color.text1} stopOpacity={0} />
            </LinearGradient>
            <RadialGradient id={`peak${id}`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={color.accent} stopOpacity={0.6} />
              <Stop offset="1" stopColor={color.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {trace.ticks.map((v) => (
            <Path key={v} d={`M${LEFT} ${y(v)} H${width}`} stroke={color.divider} strokeWidth={1} />
          ))}
          <Path d={`M${LEFT} ${BASELINE} H${width}`} stroke={color.hairline} strokeWidth={1} />
          <Path d={area} fill={`url(#area${id})`} />
          <Path
            d={`M${LEFT} ${avgY} H${width}`}
            stroke={color.text3}
            strokeOpacity={0.75}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <Path d={line} fill="none" stroke={color.text1} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          {/* The fastest moment: the one light on the chart. */}
          <Path
            d={`M${peakX} ${peakY + 3} V${BASELINE}`}
            stroke={alpha(color.accent, 0.45)}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <Circle cx={peakX} cy={peakY} r={9} fill={`url(#peak${id})`} />
          <Circle cx={peakX} cy={peakY} r={3.4} fill={color.accent} stroke={color.canvas} strokeWidth={1.2} />
        </Svg>

        {trace.ticks.map((v) => (
          <Text
            key={v}
            variant="monoSmall"
            maxFontSizeMultiplier={1.15}
            style={[styles.yLabel, { top: y(v) - 7 }]}
            numberOfLines={1}
          >
            {v}
          </Text>
        ))}
        <Text
          variant="monoSmall"
          maxFontSizeMultiplier={1.15}
          numberOfLines={1}
          style={[styles.peakLabel, { left: Math.min(width - 48, Math.max(LEFT, peakX - 24)), top: Math.max(0, peakY - 21) }]}
        >
          {top}
        </Text>
        <Text variant="monoSmall" maxFontSizeMultiplier={1.15} numberOfLines={1} style={[styles.xLabel, { left: LEFT }]}>
          {start}
        </Text>
        {inner.map((t) => {
          const label = tickLabel(t);
          const w = Math.max(TICK_W, Math.ceil(label.length * CHAR_W) + 4);
          return (
            <Text
              key={t}
              variant="monoSmall"
              maxFontSizeMultiplier={1.15}
              numberOfLines={1}
              style={[
                styles.xLabel,
                styles.xInner,
                { width: w, left: x((t - trace.t0) / (trace.t1 - trace.t0)) - w / 2 },
              ]}
            >
              {label}
            </Text>
          );
        })}
        <Text
          variant="monoSmall"
          maxFontSizeMultiplier={1.15}
          numberOfLines={1}
          style={[styles.xLabel, styles.xEnd, { right: 0 }]}
        >
          {end}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  yLabel: { position: 'absolute', left: 0 },
  peakLabel: { position: 'absolute', width: 48, textAlign: 'center', color: color.text1 },
  xLabel: { position: 'absolute', top: BASELINE + 4 },
  xInner: { textAlign: 'center' },
  xEnd: { textAlign: 'right' },
});
