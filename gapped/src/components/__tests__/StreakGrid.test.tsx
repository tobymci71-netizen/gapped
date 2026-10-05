/**
 * The streak grid is one VoiceOver element that says what the 84 squares
 * show, lights only the days that were really driven, and keeps the count
 * white: the lit cells are the lights, the number is not (docs/DESIGN.md).
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text as RNText, View } from 'react-native';
import { dayKey } from '@/state/records';
import { color } from '@/theme/tokens';
import { StreakGrid } from '../StreakGrid';

// Noon on a fixed local day, so the grid never straddles midnight.
const NOW = new Date(2026, 9, 5, 12, 0, 0).getTime();
const daysAgo = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return dayKey(d.getTime());
};

function render(driveDays: string[]): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<StreakGrid driveDays={driveDays} now={NOW} />);
  });
  return tree;
}

const flat = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;

describe('StreakGrid', () => {
  test('reads as one summary of the real drive days', () => {
    // Today, yesterday, and one day long before the grid starts (not counted).
    const tree = render([daysAgo(0), daysAgo(1), daysAgo(200)]);
    const grid = tree.root.findAll(
      (n) => n.type === View && n.props.accessible === true && n.props.accessibilityLabel,
    );
    expect(grid).toHaveLength(1);
    expect(grid[0].props.accessibilityLabel).toBe('Drove on 2 of the last 84 days');
  });

  test('lights exactly the driven days, and only them glow', () => {
    const tree = render([daysAgo(0), daysAgo(3), daysAgo(40)]);
    const cells = tree.root.findAll(
      (n) => n.type === View && flat(n.props.style).aspectRatio === 1.3,
    );
    expect(cells).toHaveLength(84);
    const lit = cells.filter((c) => flat(c.props.style).backgroundColor === color.accentFill);
    expect(lit).toHaveLength(3);
    for (const c of cells) {
      const s = flat(c.props.style);
      if (s.boxShadow) expect(lit).toContain(c);
    }
  });

  test('the streak count is white when alive, grey when not, never red', () => {
    const text = (n: { props: { children?: unknown } }) => [n.props.children].flat().join('');
    const count = (tree: ReactTestRenderer) =>
      tree.root.findAll((n) => n.type === RNText && /^\d+ days?$/.test(text(n)));
    const alive = count(render([daysAgo(0), daysAgo(1)]));
    expect(alive).toHaveLength(1);
    expect(text(alive[0])).toBe('2 days');
    expect(flat(alive[0].props.style).color).toBe(color.text1);
    // Read on its own after the heading, the count says what it counts.
    expect(alive[0].props.accessibilityLabel).toBe('Current streak, 2 days');

    const dead = count(render([daysAgo(5)]));
    expect(text(dead[0])).toBe('0 days');
    expect(flat(dead[0].props.style).color).toBe(color.text3);
  });
});
