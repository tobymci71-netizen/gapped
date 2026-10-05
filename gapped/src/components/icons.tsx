import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '@/theme/tokens';

/**
 * Nightrun's stroke icons. Drawn here rather than pulled from a library: the
 * set is small, and a filled or emoji glyph reads as a sticker against the
 * night. Every icon is authored on a 24×24 grid, stroked, round caps and
 * joins, 1.7pt at 24 (the mockups' weight), and scales with `size`.
 *
 * Decorative by default: whatever row or button holds an icon carries the
 * label. Pass `accessibilityLabel` only when the icon is the whole meaning
 * (the verified mark beside a name, say).
 *
 *     <Icon name="settings" size={22} color={color.text2} />
 */

export type IconName =
  // navigation and actions
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronDown'
  | 'close'
  | 'more'
  | 'settings'
  | 'share'
  | 'check'
  | 'verified'
  | 'plus'
  // settings rows
  | 'units'
  | 'globe'
  | 'chart'
  | 'friends'
  | 'location'
  | 'hidden'
  | 'shield'
  | 'noAds'
  | 'flag'
  | 'idCard'
  | 'lock'
  | 'document'
  | 'feedback'
  | 'mail'
  | 'package'
  | 'pencil'
  | 'trash'
  // the four tabs
  | 'driving'
  | 'ranks'
  | 'garage'
  | 'you';

type Props = {
  name: IconName;
  /** Box size in points. Default 22. */
  size?: number;
  color?: string;
  /** Stroke width at the 24-unit grid. Default 1.7. */
  strokeWidth?: number;
  accessibilityLabel?: string;
};

function shape(name: IconName): React.ReactNode {
  switch (name) {
    case 'chevronRight':
      return <Path d="M9 6l6 6-6 6" />;
    case 'chevronLeft':
      return <Path d="M14.5 5l-7 7 7 7" />;
    case 'chevronDown':
      return <Path d="M7 10l5 5 5-5" />;
    case 'close':
      return <Path d="M6 6l12 12M18 6L6 18" />;
    case 'more':
      // Three dots, drawn as zero-length round-capped strokes so they share
      // the stroke colour logic of every other icon.
      return <Path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.4} />;
    case 'settings':
      // Sliders, from the Driving mock's header.
      return (
        <>
          <Path d="M4 7h9M18 7h2M4 17h3M12 17h8" />
          <Circle cx={15.5} cy={7} r={2.3} />
          <Circle cx={9.5} cy={17} r={2.3} />
        </>
      );
    case 'share':
      return <Path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M7 11H5v10h14V11h-2" />;
    case 'check':
      return <Path d="M4.5 12.6l5 5L19.5 6.8" />;
    case 'verified':
      return (
        <>
          <Circle cx={12} cy={12} r={10.3} />
          <Path d="M7.4 12.3l3.3 3.3 6.2-6.7" />
        </>
      );
    case 'plus':
      return <Path d="M12 5v14M5 12h14" />;
    case 'units':
      // A ruler, ticks along one edge.
      return (
        <>
          <Path d="M3.5 15.5L15.5 3.5l5 5-12 12z" />
          <Path d="M7.2 11.8l1.8 1.8M10 9l2.6 2.6M12.8 6.2l1.8 1.8" />
        </>
      );
    case 'globe':
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
        </>
      );
    case 'chart':
      return <Path d="M3 20h18M4 16l5-5 4 3 7-8M16 6h4v4" />;
    case 'friends':
      return (
        <>
          <Circle cx={9} cy={8.5} r={3.3} />
          <Path d="M3 19.5c.7-3.4 3.1-5 6-5s5.3 1.6 6 5" />
          <Path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.8 14.7c1.6.6 2.8 2.1 3.2 4.8" />
        </>
      );
    case 'location':
      return (
        <>
          <Path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
          <Circle cx={12} cy={10} r={2.4} />
        </>
      );
    case 'hidden':
      // An eye with a stroke through it.
      return (
        <>
          <Path d="M3 12s3.3-6 9-6c1.6 0 3 .5 4.2 1.1M21 12s-3.3 6-9 6c-1.6 0-3-.5-4.2-1.1" />
          <Path d="M9.9 14.1a3 3 0 0 1 4.2-4.2M4 20L20 4" />
        </>
      );
    case 'shield':
      return (
        <>
          <Path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
          <Path d="M8.8 12.2l2.2 2.2 4.2-4.6" />
        </>
      );
    case 'noAds':
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M5.6 5.6l12.8 12.8" />
        </>
      );
    case 'flag':
      // A chequered flag's pole and cloth, outline only.
      return (
        <>
          <Path d="M5 21V4M5 4.5c4-2 6 1.6 10 0s4-1 4-1v9s-1-.6-4 1-6-2-10 0" />
          <Path d="M9.5 4.6v9.1M14 4.7v9" />
        </>
      );
    case 'idCard':
      return (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={2} />
          <Circle cx={8.5} cy={11} r={2} />
          <Path d="M5.8 16c.5-1.5 1.5-2.2 2.7-2.2s2.2.7 2.7 2.2M14 10h4M14 13.5h3" />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect x={5} y={10.5} width={14} height={10} rx={2} />
          <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.4" />
        </>
      );
    case 'document':
      return (
        <>
          <Path d="M6 3h8l4 4v14H6z" />
          <Path d="M14 3v4h4M9 12h6M9 15.5h6" />
        </>
      );
    case 'feedback':
      return (
        <>
          <Path d="M4 5h16v11H9.5L5 20v-4H4z" />
          <Path d="M8 9.5h8M8 12.5h5" />
        </>
      );
    case 'mail':
      return (
        <>
          <Rect x={3} y={5.5} width={18} height={13} rx={2} />
          <Path d="M3.5 7l8.5 6 8.5-6" />
        </>
      );
    case 'package':
      return (
        <>
          <Path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2z" />
          <Path d="M4 7.2l8 4.3 8-4.3M12 11.5V21M8 5.1l8 4.3" />
        </>
      );
    case 'pencil':
      return (
        <>
          <Path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z" />
          <Path d="M13.5 7l3 3" />
        </>
      );
    case 'trash':
      return (
        <>
          <Path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14" />
          <Path d="M10 10.5v6M14 10.5v6" />
        </>
      );
    case 'driving':
      // A steering wheel (the mock's Driving tab).
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Circle cx={12} cy={12} r={2.4} />
          <Path d="M3.3 10.6c3-.9 6-.6 6.5.9M20.7 10.6c-3-.9-6-.6-6.5.9M12 14.4V21" />
        </>
      );
    case 'ranks':
      return <Path d="M3 20h18M4.5 20v-6h5v6M9.5 20V8h5v12M14.5 20v-4h5v4" />;
    case 'garage':
      return <Path d="M3 9.5L12 4l9 5.5M5 8.6V20h14V8.6M8 20v-8h8v8M8 15h8M8 17.6h8" />;
    case 'you':
      return (
        <>
          <Circle cx={12} cy={8.5} r={3.6} />
          <Path d="M5 20c.8-3.8 3.6-5.5 7-5.5s6.2 1.7 7 5.5" />
        </>
      );
  }
}

export function Icon({
  name,
  size = 22,
  color: ink = color.text2,
  strokeWidth = 1.7,
  accessibilityLabel,
}: Props): React.JSX.Element {
  const labelled = accessibilityLabel != null;
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
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
    >
      {shape(name)}
    </Svg>
  );
}
