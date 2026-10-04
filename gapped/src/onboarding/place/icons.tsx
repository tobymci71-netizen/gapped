import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '@/theme/tokens';

/**
 * The small glyphs on the place and focus steps, drawn rather than typed.
 *
 * The reference uses SF Symbols, which React Native cannot reach without a
 * native module, and the app's earlier stand-ins were text characters ("➤")
 * that needed a hand-tuned line height and rotation to sit straight — the
 * clipping the type scale exists to prevent. These are 24-unit line icons
 * with one stroke weight and round joins, so a set of them reads as one
 * family next to the drawn back chevron in OnboardingFrame.
 *
 * All are decorative: the row or button that holds one carries the label.
 */

type IconProps = { size?: number; color?: string };

const STROKE = 2;

function Line({ size = 22, color: c = color.text2, d }: IconProps & { d: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The location arrow, filled — the step's lead glyph. */
export function LocationArrowIcon({ size = 72, color: c = color.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20.6 3.4 3.9 10.3c-.8.3-.7 1.4.1 1.6l6.6 1.5 1.5 6.6c.2.8 1.3.9 1.6.1l6.9-16.7Z" fill={c} />
    </Svg>
  );
}

export function PinIcon(p: IconProps) {
  return (
    <Svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"
        stroke={p.color ?? color.accent}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={10} r={2.4} fill={p.color ?? color.accent} />
    </Svg>
  );
}

export function CheckIcon({ size = 18, color: c = color.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m5 12.5 4.5 4.5L19 7.5" stroke={c} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronDownIcon(p: IconProps) {
  return <Line size={p.size ?? 16} color={p.color} d="m6 9 6 6 6-6" />;
}

export function MagnifierIcon(p: IconProps) {
  return <Line size={p.size ?? 18} color={p.color ?? color.text3} d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.7-1.8L20 20" />;
}

export function CloseIcon(p: IconProps) {
  return <Line size={p.size ?? 14} color={p.color} d="M6 6l12 12M18 6 6 18" />;
}

/** Top speed: a dial with its needle well round. */
export function GaugeIcon(p: IconProps) {
  return <Line {...p} d="M4.2 17.5a9 9 0 1 1 15.6 0M12 13.5l4.5-4.5M12 13.5h.01" />;
}

/** 0–60: a stopwatch. */
export function StopwatchIcon(p: IconProps) {
  return <Line {...p} d="M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm0-11v3.5M10 3h4M18.5 6.5l1.2-1.2" />;
}

/** Local ranking: a trophy. */
export function TrophyIcon(p: IconProps) {
  return (
    <Line
      {...p}
      d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 3.5M16 6h3a3 3 0 0 1-3 3.5M12 13v4M8.5 20h7M10 17h4"
    />
  );
}

/** Beat friends: two people. */
export function PeopleIcon(p: IconProps) {
  return (
    <Line
      {...p}
      d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20a6 6 0 0 1 12 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.5A6 6 0 0 1 21 20"
    />
  );
}

/** Real drive data: a trace. */
export function PulseIcon(p: IconProps) {
  return <Line {...p} d="M3 12h4l2.5-6 5 12L17 12h4" />;
}

/** Progress history: a line that climbs. */
export function TrendIcon(p: IconProps) {
  return <Line {...p} d="M4 19V5M4 19h16M7.5 15l4-4 3 2.5L20 8" />;
}

/** Ranking context: a podium. */
export function PodiumIcon({ size = 22, color: c = color.text2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={9} y={6} width={6} height={14} rx={1} stroke={c} strokeWidth={STROKE} strokeLinejoin="round" />
      <Path
        d="M9 11H4.5a.5.5 0 0 0-.5.5V20h5M15 14h4.5a.5.5 0 0 1 .5.5V20h-5"
        stroke={c}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
