import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { color } from '@/theme/tokens';

/**
 * Tab bar icons, drawn here rather than pulled from an icon library: the set is
 * four glyphs and shipping a font/library for them would cost more than the
 * paths do. Geometry is authored on a 24×24 grid and stroked only — a filled
 * icon reads as a chip against the near-black canvas.
 */

export type TabIconName = 'driving' | 'ranks' | 'garage' | 'you';

const SIZE = 24;
const STROKE = 1.8;

/** Wheel radius, kept in one place so the car's underside gaps line up with it. */
const WHEEL_R = 1.8;

function shape(name: TabIconName, stroke: string): React.JSX.Element {
  switch (name) {
    case 'driving':
      return (
        <>
          {/* Cabin over bonnet, then the underside in three runs so the wheels
              sit in the gaps rather than being drawn over the sill. */}
          <Path
            d="M3 16.4v-2c0-.6.2-1.1.6-1.5l2.1-2.4c.4-.5.9-.7 1.5-.7h9.6c.6 0 1.1.2 1.5.7l2.1 2.4c.4.4.6.9.6 1.5v2"
            stroke={stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M3 16.4h2.2M8.8 16.4h6.4M18.8 16.4H21M6.5 12.6h11"
            stroke={stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={7} cy={16.4} r={WHEEL_R} stroke={stroke} strokeWidth={STROKE} fill="none" />
          <Circle cx={17} cy={16.4} r={WHEEL_R} stroke={stroke} strokeWidth={STROKE} fill="none" />
        </>
      );
    case 'ranks':
      return (
        <>
          <Path
            d="M7.6 4h8.8v4.6a4.4 4.4 0 0 1-8.8 0V4z"
            stroke={stroke}
            strokeWidth={STROKE}
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M7.6 6H5.2v1.1a2.9 2.9 0 0 0 2.6 2.9M16.4 6h2.4v1.1a2.9 2.9 0 0 1-2.6 2.9"
            stroke={stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M12 13.1v2.5M10 17.6h4l.9 2.4H9.1l.9-2.4z"
            stroke={stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      );
    case 'garage':
      return (
        <>
          <Path
            d="M2.8 10.3 12 4.6l9.2 5.7M5.2 10.6V20h13.6v-9.4"
            stroke={stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Up-and-over door, with one panel line so it doesn't read as a window. */}
          <Path
            d="M8.2 20v-5.4h7.6V20M8.2 17.3h7.6"
            stroke={stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      );
    case 'you':
      return (
        <>
          <Circle cx={12} cy={8.2} r={3.5} stroke={stroke} strokeWidth={STROKE} fill="none" />
          <Path
            d="M4.9 20a7.1 7.1 0 0 1 14.2 0"
            stroke={stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
  }
}

export function TabIcon({
  name,
  focused,
}: {
  name: TabIconName;
  focused: boolean;
}): React.JSX.Element {
  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      {shape(name, focused ? color.accent : color.text3)}
    </Svg>
  );
}
