import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SlantTag } from '@/components/brand/SlantTag';
import { StreakBar } from '@/components/brand/StreakArrow';
import { Entrance } from '@/components/Entrance';
import { Icon } from '@/components/icons';
import { Skeleton } from '@/components/Skeleton';
import { OnSurface, Text } from '@/components/Text';
import { fetchBoard } from '@/board/boards';
import { distanceForDisplay, type UnitPref } from '@/drive/units';
import { useProfile } from '@/state/profile';
import { SlantLight } from '@/onboarding/ui/choice';
import {
  color,
  font,
  gutter,
  italicOverhang,
  radius,
  space,
  textStyle,
  type,
} from '@/theme/tokens';
import { raw } from '@/types/units';
import { IntroPage } from './IntroPage';
import {
  boardAttempts,
  GLOBAL_LABEL,
  type IntroBoard,
  INTRO_BOARD_METRIC,
  type IntroBoardRow,
  INTRO_BOARD_SIZE,
  ordinal,
  realBoardRows,
  sampleIntroBoard,
  settleWithin,
} from './introBoard';
import type { IntroPageCopy } from './introTimeline';

/**
 * How long the card waits for the server before settling on the sample. The
 * fetch starts under the splash, two seconds before the first page is even
 * readable, so a reachable server has long answered by the time anyone gets
 * here; this only bounds a slow or silent one.
 */
const BOARD_WAIT_MS = 4000;

/** Rows grow with Dynamic Type; this is their height at the default size. */
const ROW_MIN_HEIGHT = 64;
/** Position and distance are figures in a fixed-width card; they cap here. */
const FIGURE_MAX_SCALE = 2;

/**
 * Text scale above which the row stops fitting one line, the Board tab's own
 * threshold (iOS AX1 is ~1.79). Past it, the scope label drops under the
 * card's title and each row stacks its distance under the name. At the
 * largest size the one-line layout gave the title a letter's width, so the
 * title ran down the card one letter per line.
 */
const LARGE_TEXT = 1.5;

/**
 * The real distance board, verified drives only (the board the Ranks tab
 * opens on, and the welcome's promise: a drive is checked before it counts),
 * else the sample. Never rejects: an error, a timeout or no backend at all is
 * the sample.
 */
async function loadIntroBoard(country: string | null): Promise<IntroBoard> {
  const deadline = Date.now() + BOARD_WAIT_MS;
  for (const attempt of boardAttempts(country)) {
    const result = await settleWithin(
      fetchBoard(
        { metric: INTRO_BOARD_METRIC, scope: attempt.scope, period: 'all', verifiedOnly: true },
        null,
        country,
      ),
      deadline - Date.now(),
    );
    const rows = realBoardRows(result);
    if (rows) return { scopeLabel: attempt.label, rows, sample: false };
  }
  // Sample rows are nobody's, so they are not labelled with anybody's country.
  return sampleIntroBoard(GLOBAL_LABEL);
}

type Props = {
  copy: IntroPageCopy;
  width: number;
  hidden: boolean;
  /** Passed to IntroPage: a vertical drag began here. */
  onVerticalDrag?: () => void;
  /** This page has been on screen at least once: the rows can make their entrance. */
  seen: boolean;
};

/**
 * Page 2, "See where you stack up": a "Distance" card with three rows, each
 * a driver's longest verified drive (./introBoard explains why distance),
 * set as the Ranks tab sets its board (Nightrun-Ranks).
 *
 * Real rows when the server has three or more on the board, otherwise the
 * Board tab's own sample rows wearing its SAMPLE treatment (docs/ONBOARDING.md
 * rule 1: no invented numbers). The answer is fetched once, as the carousel
 * mounts, and the card never swaps one set of rows for another in view: rows
 * appear once, when the answer is in and the page has been seen.
 */
export function BoardPage({ copy, width, hidden, seen, onVerticalDrag }: Props) {
  const unitPref = useProfile((s) => s.unitPref);
  const [board, setBoard] = useState<IntroBoard | null>(null);
  const large = useWindowDimensions().fontScale > LARGE_TEXT;

  useEffect(() => {
    let live = true;
    // Read once, not subscribed: the card is decided as the carousel mounts.
    // Anything unexpected on the way (a malformed row, say) is the sample,
    // not a skeleton that never resolves.
    loadIntroBoard(useProfile.getState().country)
      .catch(() => sampleIntroBoard(GLOBAL_LABEL))
      .then((b) => {
        if (live) setBoard(b);
      });
    return () => {
      live = false;
    };
  }, []);

  const scopeLabel = board?.scopeLabel ?? GLOBAL_LABEL;

  // The bars run under the name and figure columns, the card's width less
  // its padding and the position column.
  const barWidth = Math.max(0, width - gutter * 2 - space.lg * 2 - POSITION_WIDTH - space.md);
  const leader = board ? Math.max(...board.rows.map((r) => raw(r.distance))) : 0;

  return (
    <IntroPage
      copy={copy}
      width={width}
      hidden={hidden}
      onVerticalDrag={onVerticalDrag}
    >
      <View style={styles.card}>
        <OnSurface>
          <View
            style={[styles.cardHeader, large && styles.cardHeaderLarge]}
            accessible
            accessibilityRole="header"
            accessibilityLabel={`Distance, ${scopeLabel === GLOBAL_LABEL ? 'global' : scopeLabel}${
              board?.sample ? ', sample board' : ''
            }`}
          >
            {/* A live light only over real rows: lit on a sample board, or on
                one still loading, it would claim what the SAMPLE tags deny. */}
            {board && !board.sample ? <SlantLight /> : null}
            <Text variant="title" style={styles.cardTitle}>
              Distance
            </Text>
            <Text variant="mono" style={[styles.scope, large && styles.scopeLarge]}>
              {scopeLabel}
            </Text>
          </View>
          <View
            style={styles.rows}
            // The skeleton has nothing to read, so while it pulses VoiceOver
            // hears that the rows are on their way rather than nothing at all.
            accessible={seen && !board}
            accessibilityLabel={seen && !board ? 'Loading the board' : undefined}
            accessibilityState={{ busy: seen && !board }}
          >
            {/* Nothing is drawn off screen: the rows enter as the page slides
                in, and a skeleton only pulses if the answer is still out. */}
            {seen && board
              ? board.rows.map((row, i) => (
                  <Entrance key={row.key} index={i}>
                    <BoardRowView
                      row={row}
                      unitPref={unitPref}
                      first={i === 0}
                      large={large}
                      barWidth={barWidth}
                      share={leader > 0 ? raw(row.distance) / leader : 0}
                    />
                  </Entrance>
                ))
              : null}
            {seen && !board
              ? Array.from({ length: INTRO_BOARD_SIZE }, (_, i) => (
                  <SkeletonRow key={i} first={i === 0} />
                ))
              : null}
          </View>
        </OnSurface>
      </View>
    </IntroPage>
  );
}

/**
 * One row, as the Ranks tab sets it (Nightrun-Ranks): the position in the
 * wide italic, the name, the figure in mono, and under them a light streak
 * as long as the row's share of the leader's distance. A real row carries
 * the verified mark (the board is verified drives only); a sample row
 * carries SAMPLE instead, and never the mark.
 */
function BoardRowView({
  row,
  unitPref,
  first,
  large,
  barWidth,
  share,
}: {
  row: IntroBoardRow;
  unitPref: UnitPref;
  first: boolean;
  /** Stacked layout for large text (see LARGE_TEXT). */
  large: boolean;
  barWidth: number;
  /** The row's distance over the leader's, 0–1. */
  share: number;
}) {
  const distance = distanceForDisplay(row.distance, unitPref);
  const value = distance.value.toFixed(1);
  // In words: VoiceOver reads "mi" and "km" letter by letter.
  const unitWords = `${distance.unit === 'mi' ? 'mile' : 'kilometre'}${value === '1.0' ? '' : 's'}`;
  const figure = (
    <Text style={styles.value} maxFontSizeMultiplier={FIGURE_MAX_SCALE} numberOfLines={1}>
      {value}
      <Text style={styles.unit}> {distance.unit}</Text>
    </Text>
  );
  return (
    <View
      style={[styles.row, !first && styles.rowRule]}
      accessible
      accessibilityLabel={[
        ordinal(row.rank),
        row.name,
        row.detail,
        `${value} ${unitWords}`,
        row.sample ? 'sample' : 'verified',
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={styles.rowLine}>
        <Text style={styles.position} maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
          {row.rank}
        </Text>
        <View style={styles.who}>
          <View style={styles.nameLine}>
            <Text variant="bodySemibold" numberOfLines={large ? 2 : 1} style={styles.name}>
              {row.name}
            </Text>
            {row.sample ? null : <Icon name="verified" size={14} color={color.text3} />}
          </View>
          {/* The tag rides on the second line: beside the name it took the
              width the name needed, and every sample name truncated. */}
          {row.detail || row.sample ? (
            <View style={styles.detailLine}>
              {row.detail ? (
                <Text variant="legal" numberOfLines={1} style={styles.detail}>
                  {row.detail}
                </Text>
              ) : null}
              {row.sample ? <SlantTag label="SAMPLE" size="sm" decorative /> : null}
            </View>
          ) : null}
          {large ? figure : null}
        </View>
        {large ? null : figure}
      </View>
      <StreakBar width={barWidth} progress={share} style={styles.bar} />
    </View>
  );
}

function SkeletonRow({ first }: { first: boolean }) {
  return (
    <View style={[styles.row, !first && styles.rowRule]}>
      <View style={styles.rowLine}>
        <View style={styles.positionSlot} />
        <View style={styles.who}>
          <Skeleton style={styles.skelName} />
        </View>
        <Skeleton style={styles.skelValue} />
      </View>
    </View>
  );
}

/** The position column: wide enough for "3" in the wide italic at its cap. */
const POSITION_WIDTH = 28;

const styles = StyleSheet.create({
  // A night panel: the board is a real object on the page.
  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingBottom: space.sm,
  },
  cardHeaderLarge: { flexWrap: 'wrap' },
  cardTitle: { flexGrow: 1, flexShrink: 1 },
  scope: { color: color.text3 },
  // Its own line, under the title.
  scopeLarge: { flexBasis: '100%' },
  rows: { minHeight: ROW_MIN_HEIGHT * INTRO_BOARD_SIZE },
  row: { minHeight: ROW_MIN_HEIGHT, paddingVertical: space.md, gap: space.sm },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.divider },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  position: {
    width: POSITION_WIDTH,
    fontFamily: font.displayBlack,
    ...textStyle(type.cardTitle),
    paddingRight: italicOverhang(type.cardTitle.size),
    color: color.text1,
  },
  positionSlot: { width: POSITION_WIDTH },
  who: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { flexShrink: 1 },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  detail: { flexShrink: 1 },
  value: {
    fontFamily: font.monoMedium,
    ...textStyle(type.caption),
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  unit: { fontFamily: font.mono, color: color.text3 },
  // Under the name and figure, past the position column.
  bar: { marginLeft: POSITION_WIDTH + space.md },
  skelName: { width: '70%', height: 14 },
  skelValue: { width: 56, height: 16 },
});
