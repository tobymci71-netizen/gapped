import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon } from '@/components/icons';
import { alpha, color, radius } from '@/theme/tokens';
import type { RouteThumb } from './routeGeometry';

/** The tile's side (the Driving mock's 48pt). */
export const ROUTE_TILE = 48;

/**
 * A plotting grid, not a map: evenly spaced, so it cannot be read as streets.
 * The route on it is real; nothing under it pretends to be.
 */
const GRID = 'M0 12H48 M0 24H48 M0 36H48 M12 0V48 M24 0V48 M36 0V48';

/** A placeholder trail for the empty state: dashed and grey, plainly "to come". */
const GHOST_TRAIL = 'M11 37 C15 33 14 27 19 24 C25 21 24 15 31 12 C34 10.8 36.4 10.4 38 10';

type Props =
  /** A drive's route, drawn as a red light trail; undefined while it loads. */
  | { kind: 'route'; thumb: RouteThumb | null | undefined }
  /** The empty state's first row: a dashed trail from a start ring. */
  | { kind: 'ghost' }
  /** Older drives behind Pro: a lock on the grid. */
  | { kind: 'locked' };

/**
 * The dark square at the start of each recent drive's row: the route as a red
 * light trail — a soft wide glow under a hot core — from a white start ring to
 * a white finish dot, on a faint plotting grid. Decorative to VoiceOver: the
 * row's label carries the drive.
 */
export function RouteTile(props: Props) {
  return (
    <View
      style={styles.tile}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={ROUTE_TILE} height={ROUTE_TILE} viewBox={`0 0 ${ROUTE_TILE} ${ROUTE_TILE}`}>
        <Path d={GRID} stroke={color.divider} strokeWidth={1} fill="none" />
        {props.kind === 'route' && props.thumb ? (
          <>
            <Path
              d={props.thumb.d}
              stroke={alpha(color.accent, 0.3)}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d={props.thumb.d}
              stroke={color.accentHot}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {props.thumb.end ? (
              <Circle cx={props.thumb.end.x} cy={props.thumb.end.y} r={2} fill={color.text1} />
            ) : null}
            <Circle
              cx={props.thumb.start.x}
              cy={props.thumb.start.y}
              r={2.2}
              fill={color.canvas}
              stroke={color.text1}
              strokeWidth={1.2}
            />
          </>
        ) : null}
        {props.kind === 'ghost' ? (
          <>
            <Path
              d={GHOST_TRAIL}
              stroke={color.outline}
              strokeWidth={1.4}
              strokeDasharray="2.5 3"
              strokeLinecap="round"
              fill="none"
            />
            <Circle
              cx={11}
              cy={37}
              r={2.2}
              fill={color.canvas}
              stroke={color.text1}
              strokeWidth={1.2}
            />
          </>
        ) : null}
      </Svg>
      {props.kind === 'locked' ? (
        <View style={styles.center}>
          <Icon name="lock" size={18} color={color.text3} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: ROUTE_TILE,
    height: ROUTE_TILE,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: color.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
