/**
 * A leaderboard bar burns at one of three strengths (Nightrun-Ranks): at
 * rest, hot for your own row, and lower below the podium. Your own row is
 * always hot, whatever its place.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Polygon, Stop } from 'react-native-svg';
import { StreakBar } from '../brand/StreakArrow';

function render(props: { you?: boolean; dim?: boolean }): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<StreakBar width={200} progress={0.6} {...props} />);
  });
  return tree;
}

const stops = (t: ReactTestRenderer) =>
  t.root.findAllByType(Stop).map((s) => s.props.stopOpacity as number);
const tipOpacity = (t: ReactTestRenderer) => t.root.findAllByType(Polygon)[1].props.fillOpacity;

describe('StreakBar', () => {
  test('at rest: faint tail, nearly full head, a full tip', () => {
    const t = render({});
    expect(stops(t)).toEqual([0.16, 0.6, 0.95]);
    expect(tipOpacity(t)).toBe(1);
  });

  test('dim: a flatter, fainter ramp and a lower tip', () => {
    const t = render({ dim: true });
    expect(stops(t)).toEqual([0.1, 0.55]);
    expect(tipOpacity(t)).toBe(0.8);
    expect(Math.max(...stops(t))).toBeLessThan(Math.max(...stops(render({}))));
  });

  test('your own row stays hot even when dim is asked for', () => {
    const t = render({ you: true, dim: true });
    expect(stops(t)).toEqual([0.22, 0.95, 1]);
    expect(tipOpacity(t)).toBe(1);
    // The white-hot core in the tip.
    expect(t.root.findAllByType(Polygon)).toHaveLength(3);
  });
});
