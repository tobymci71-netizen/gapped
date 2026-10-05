/**
 * A Stat is one VoiceOver element that says its label and its figure as a
 * sentence, with the unit in words: "Top speed, 47 miles per hour", not
 * "Top speed", "47", "mph" as three stops (docs/DESIGN.md, Components).
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';
import { Stat } from '../Stat';

function spoken(element: React.ReactElement): string[] {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree.root
    .findAll((n) => n.type === View && n.props.accessible === true)
    .map((n) => n.props.accessibilityLabel as string);
}

describe('Stat', () => {
  test('reads as one sentence, the unit in words', () => {
    expect(spoken(<Stat label="Top speed" value="47" unit="mph" />)).toEqual([
      'Top speed, 47 miles per hour',
    ]);
    expect(spoken(<Stat label="Longest drive" value="12.4" unit="km" divider />)).toEqual([
      'Longest drive, 12.4 kilometres',
    ]);
  });

  test('a figure not had yet is said as such, not as a dash', () => {
    expect(spoken(<Stat label="Top speed" value="—" />)).toEqual(['Top speed, none yet']);
  });

  test('spoken overrides the figure, never the label', () => {
    expect(
      spoken(<Stat label="Total time" value="2h 13m" spoken="2 hours 13 minutes" />),
    ).toEqual(['Total time, 2 hours 13 minutes']);
  });
});
