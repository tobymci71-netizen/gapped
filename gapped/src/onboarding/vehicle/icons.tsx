import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { color } from '@/theme/tokens';

/**
 * The vehicle steps' small glyphs, drawn rather than typed — the same call the
 * frame's back chevron made: a "✓" or "⌄" character sits on its font's
 * baseline, needs a hand-tuned size to centre, and renders at a different
 * weight on every platform font. Decorative: each sits inside a control that
 * carries the accessible label, so none is exposed to VoiceOver itself.
 *
 * White by default: a check or a plus is not a light, so it is never red.
 */

type IconProps = { size?: number; color?: string };

const STROKE = {
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
} as const;

export function CheckIcon({ size = 18, color: c = color.text1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" accessible={false}>
      <Path d="M4 10.5 L8.2 14.5 L16 5.8" stroke={c} strokeWidth={2.4} {...STROKE} />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 16, color: c = color.text3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" accessible={false}>
      <Path d="M5 7.5 L10 12.5 L15 7.5" stroke={c} strokeWidth={2.2} {...STROKE} />
    </Svg>
  );
}

export function PlusIcon({ size = 18, color: c = color.text1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" accessible={false}>
      <Path d="M10 4 V16 M4 10 H16" stroke={c} strokeWidth={2.4} {...STROKE} />
    </Svg>
  );
}

export function CloseIcon({ size = 14, color: c = color.text2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" accessible={false}>
      <Path d="M5 5 L15 15 M15 5 L5 15" stroke={c} strokeWidth={2.4} {...STROKE} />
    </Svg>
  );
}
