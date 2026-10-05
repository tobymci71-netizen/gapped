import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { color } from '@/theme/tokens';

/**
 * Stroke glyphs only the You tab draws: the four manoeuvres and the 0–60
 * stopwatch. Same grid and weight as the shared set (components/icons.tsx: a
 * 24-unit box, 1.7 stroke, round caps and joins), kept here because nothing
 * else uses them. They replace the old emoji arrows and tinted tiles.
 *
 * Decorative: the figure beside each one carries the meaning.
 */
export type YouIconName = 'turnLeft' | 'turnRight' | 'hardBrake' | 'laneChange' | 'stopwatch';

function shape(name: YouIconName): React.ReactNode {
  switch (name) {
    case 'turnLeft':
      // Up the lane, then hard left.
      return <Path d="M16 20v-8.5a3.5 3.5 0 0 0-3.5-3.5H6M9.5 4.5L6 8l3.5 3.5" />;
    case 'turnRight':
      return <Path d="M8 20v-8.5A3.5 3.5 0 0 1 11.5 8H18M14.5 4.5L18 8l-3.5 3.5" />;
    case 'hardBrake':
      // The brake warning lamp: a disc in its two arcs, with the stroke of an
      // exclamation in it.
      return (
        <>
          <Circle cx={12} cy={12} r={5.6} />
          <Path d="M5.3 6.3a8.8 8.8 0 0 0 0 11.4M18.7 6.3a8.8 8.8 0 0 1 0 11.4M12 9.2v3.2M12 14.9h.01" />
        </>
      );
    case 'laneChange':
      // A dashed lane line, and a path crossing it.
      return <Path d="M12 3.5v2.5M12 10.75v2.5M12 18v2.5M6 20.5c0-6.5 12-6 12-13.5M15 9.5l3-3 3 3" />;
    case 'stopwatch':
      return (
        <>
          <Circle cx={12} cy={13.5} r={7} />
          <Path d="M12 13.5V10M10 3h4M12 3v3.5M18 7.2l1.3-1.3" />
        </>
      );
  }
}

export function YouIcon({
  name,
  size = 22,
  color: ink = color.text2,
  strokeWidth = 1.7,
}: {
  name: YouIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}): React.JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={ink}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {shape(name)}
    </Svg>
  );
}
