/**
 * The Ranks UI pieces render what the presenter decided, and VoiceOver hears
 * them as the presenter says: one sentence per row, the '⋯' button only on
 * another real driver's row, the hero as one summary.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text as RNText } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { metres } from '@/types/units';
import { METERS_PER_MILE } from '@/drive/units';
import { heroView, rowAccessibilityLabel, valueParts } from '../present';
import type { BoardRow } from '../types';
import { BoardHero } from '../ui/BoardHero';
import { BoardRowView } from '../ui/BoardRow';
import { MetricTabs, Segments, VerifiedToggle } from '../ui/controls';

jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  // The mock's bezierFn is an identity on its first argument, not a curve.
  return { ...mock, Easing: { ...mock.Easing, bezierFn: () => (t: number) => t } };
});
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/components/brand/FilmGrain', () => ({ FilmGrain: () => null }));
jest.mock('@/lib/haptics', () => ({ haptic: { selection: jest.fn(), press: jest.fn() } }));
jest.mock('@/components/BottomSheet', () => ({ BottomSheet: () => null }));

const miles = (n: number) => metres(n * METERS_PER_MILE);

function row(over: Partial<BoardRow> & { id: string }): BoardRow {
  return {
    rank: 1,
    username: over.id,
    country: 'GB',
    vehicle: null,
    verification: 'verified',
    kind: 'user',
    metric: 'distance',
    value: miles(10),
    ...over,
  } as BoardRow;
}

function Row({ item, onMore }: { item: BoardRow; onMore?: () => void }) {
  const sweep = useSharedValue(1);
  return (
    <BoardRowView
      item={item}
      index={0}
      value={valueParts(item, 'imperial')}
      accessibilityLabel={rowAccessibilityLabel(item, 'imperial')}
      progress={0.8}
      track={272}
      sweep={sweep}
      stacked={false}
      menuSlot
      onMore={onMore}
    />
  );
}

const texts = (r: ReactTestRenderer) =>
  r.root
    .findAllByType(RNText)
    .map((t) => [t.props.children].flat().join(''))
    .join(' | ');

const labels = (r: ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel != null)
    .map((n) => n.props.accessibilityLabel as string);

describe('BoardRowView', () => {
  test("another driver's row: one sentence, and its own Report or hide button", () => {
    const onMore = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<Row item={row({ id: 'jayden_r', rank: 2, profileId: 'p' })} onMore={onMore} />);
    });
    expect(labels(r)).toEqual(
      expect.arrayContaining(['2, jayden_r, verified, 10.0 miles', 'Report or hide jayden_r']),
    );
    expect(texts(r)).toContain('10.0');
  });

  test('your row wears the You tag and has no menu', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<Row item={row({ id: 'toby', rank: 3, kind: 'you' })} />);
    });
    expect(texts(r)).toContain('You');
    expect(labels(r).some((l) => l.startsWith('Report or hide'))).toBe(false);
  });

  test('a SAMPLE row says so', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <Row item={row({ id: 'sample_driver_1', kind: 'sample', verification: 'unverified' })} />,
      );
    });
    expect(texts(r)).toContain('SAMPLE');
    expect(texts(r)).not.toContain('Unverified');
  });
});

describe('BoardHero', () => {
  const rows = [
    row({ id: 'm061087', rank: 1, value: miles(41.2) }),
    row({ id: 'jayden_r', rank: 2, value: miles(38.5) }),
    row({ id: 'toby', rank: 3, kind: 'you', value: miles(33.8) }),
  ];

  test('placed on Distance: P3, the value, the gap', () => {
    const view = heroView(
      rows,
      { metric: 'distance', period: 'week', scopeName: 'World', isSample: false, verifiedShown: true },
      'imperial',
    );
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<BoardHero {...view!} compact={false} />);
    });
    const shown = texts(r);
    expect(shown).toContain('P3');
    expect(shown).toContain('33.8 mi');
    expect(shown).toContain('4.7 mi behind jayden_r');
  });

  test('absent: the invitation', () => {
    const view = heroView(
      rows.filter((x) => x.kind !== 'you'),
      { metric: 'distance', period: 'week', scopeName: 'World', isSample: false, verifiedShown: true },
      'imperial',
    );
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<BoardHero {...view!} compact />);
    });
    expect(texts(r)).toContain('Record a verified drive to join the board');
  });
});

describe('controls', () => {
  const byLabel = (r: ReactTestRenderer, label: string) =>
    r.root.find((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label);

  test('"Verified drives only" is a checkbox that reports the real filter', () => {
    const onPress = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<VerifiedToggle on disabled={false} onPress={onPress} />);
    });
    const box = byLabel(r, 'Verified drives only');
    expect(box.props.accessibilityRole).toBe('checkbox');
    expect(box.props.accessibilityState).toEqual({ checked: true, disabled: false });
    act(() => {
      r.update(<VerifiedToggle on={false} disabled onPress={onPress} />);
    });
    expect(byLabel(r, 'Verified drives only').props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
    });
  });

  test('metric tabs are tabs, the chosen one selected; segments are radios', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <>
          <MetricTabs
            options={[
              { key: 'distance', label: 'Distance' },
              { key: 'zero_to_60', label: '0–60', accessibilityLabel: '0 to 60 mph' },
            ]}
            value="distance"
            onChange={jest.fn()}
          />
          <Segments
            options={[
              { key: 'global', label: 'World' },
              { key: 'country', label: 'Country', accessibilityLabel: 'Country, United Kingdom' },
            ]}
            value="country"
            onChange={jest.fn()}
          />
        </>,
      );
    });
    expect(byLabel(r, 'Distance').props.accessibilityState).toEqual({ selected: true });
    expect(byLabel(r, '0 to 60 mph').props.accessibilityRole).toBe('tab');
    const country = byLabel(r, 'Country, United Kingdom');
    expect(country.props.accessibilityRole).toBe('radio');
    expect(country.props.accessibilityState).toEqual({ checked: true, disabled: false });
  });
});
