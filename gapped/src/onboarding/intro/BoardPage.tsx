import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Entrance } from '@/components/Entrance';
import { Skeleton } from '@/components/Skeleton';
import { Numeral, OnSurface, Text } from '@/components/Text';
import { fetchBoard } from '@/board/boards';
import { speedForDisplay, type UnitPref } from '@/drive/units';
import { useProfile } from '@/state/profile';
import { color, font, glyph, radius, space, textStyle, type } from '@/theme/tokens';
import { IntroPage } from './IntroPage';
import {
  boardAttempts,
  GLOBAL_LABEL,
  type IntroBoard,
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
const ROW_MIN_HEIGHT = 56;
const AVATAR = 32;
const LIVE_DOT = 8;
/** The SAMPLE chip is a badge, not reading text (as on the Board tab). */
const CHIP_MAX_SCALE = 2;
/** Rank and speed are display figures in a fixed-width card; they cap here. */
const FIGURE_MAX_SCALE = 2;

/**
 * Text scale above which the row stops fitting one line, the Board tab's own
 * threshold (iOS AX1 is ~1.79). Past it, the scope label drops under the
 * card's title and each row stacks its speed under the name, without the
 * avatar. At the largest size the one-line layout gave the title a letter's
 * width, so "Top speed" ran down the card one letter per line.
 */
const LARGE_TEXT = 1.5;

const RANK_COLOR: Record<number, string> = {
  1: color.rank1,
  2: color.rank2,
  3: color.rank3,
};

/**
 * The real top-speed board, verified runs only (the Board tab's default and
 * the pitch on page one: "Verified, then ranked"), else the sample. Never
 * rejects: an error, a timeout or no backend at all is the sample.
 */
async function loadIntroBoard(country: string | null): Promise<IntroBoard> {
  const deadline = Date.now() + BOARD_WAIT_MS;
  for (const attempt of boardAttempts(country)) {
    const result = await settleWithin(
      fetchBoard(
        { metric: 'top_speed', scope: attempt.scope, period: 'all', verifiedOnly: true },
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
 * Page 2, "See where you stack up": a "Top speed" card with three rows.
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
            accessibilityLabel={`Top speed, ${scopeLabel === GLOBAL_LABEL ? 'global' : scopeLabel}${
              board?.sample ? ', sample board' : ''
            }`}
          >
            {/* Lime only over real rows: a "live" light on a sample board, or
                on one still loading, would claim what the SAMPLE chips deny. */}
            <View style={[styles.liveDot, board && !board.sample ? styles.liveDotOn : null]} />
            <Text variant="caption" style={styles.cardTitle}>
              Top speed
            </Text>
            <Text variant="legal" style={[styles.scope, large && styles.scopeLarge]}>
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
                    <BoardRowView row={row} unitPref={unitPref} first={i === 0} large={large} />
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

function BoardRowView({
  row,
  unitPref,
  first,
  large,
}: {
  row: IntroBoardRow;
  unitPref: UnitPref;
  first: boolean;
  /** Stacked layout for large text (see LARGE_TEXT). */
  large: boolean;
}) {
  const speed = speedForDisplay(row.speed, unitPref);
  const value = Math.round(speed.value);
  const tint = RANK_COLOR[row.rank] ?? color.text1;
  const unitWords = speed.unit === 'mph' ? 'miles per hour' : 'kilometres per hour';
  const figure = (
    <View style={large ? styles.valueInline : styles.value}>
      <Numeral size={type.cardTitle.size} color={tint} maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
        {value}
      </Numeral>
      <Text variant="legal" style={styles.unit} maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
        {speed.unit.toUpperCase()}
      </Text>
    </View>
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
        row.sample ? 'sample' : null,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <Text
        variant="caption"
        maxFontSizeMultiplier={FIGURE_MAX_SCALE}
        style={[styles.rank, large && styles.rankLarge, { color: tint }]}
      >
        #{row.rank}
      </Text>
      {large ? null : <Avatar />}
      <View style={styles.who}>
        {/* One line beside the figure; two once the figure has moved below. */}
        <Text variant="bodyMedium" numberOfLines={large ? 2 : 1}>
          {row.name}
        </Text>
        {/* The chip rides on the second line: beside the name it took the
            width the name needed, and every sample name truncated. */}
        {row.detail || row.sample ? (
          <View style={styles.detailLine}>
            {row.detail ? (
              <Text variant="legal" numberOfLines={1} style={styles.detail}>
                {row.detail}
              </Text>
            ) : null}
            {row.sample ? (
              // The Board tab's SAMPLE chip, in text2 rather than its text3:
              // this card is surface2, where text3 falls under 4.5:1.
              <View style={styles.chip}>
                <Text style={styles.chipText} maxFontSizeMultiplier={CHIP_MAX_SCALE}>
                  SAMPLE
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {large ? figure : null}
      </View>
      {large ? null : figure}
    </View>
  );
}

/** A generic driver: the board has no photos, and the card does not invent any. */
function Avatar() {
  return (
    <View style={styles.avatar}>
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Circle cx={8} cy={5.25} r={3} fill={color.text3} />
        <Path d="M2.5 14.5c0-3.1 2.5-5.25 5.5-5.25s5.5 2.15 5.5 5.25z" fill={color.text3} />
      </Svg>
    </View>
  );
}

function SkeletonRow({ first }: { first: boolean }) {
  return (
    <View style={[styles.row, !first && styles.rowRule]}>
      <View style={styles.rankSlot} />
      <View style={styles.avatar} />
      <View style={styles.who}>
        <Skeleton style={styles.skelName} />
      </View>
      <Skeleton style={styles.skelValue} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface2,
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
  liveDot: {
    width: LIVE_DOT,
    height: LIVE_DOT,
    borderRadius: LIVE_DOT / 2,
    backgroundColor: color.text3,
  },
  liveDotOn: { backgroundColor: color.accent },
  cardHeaderLarge: { flexWrap: 'wrap' },
  cardTitle: { flexGrow: 1, flexShrink: 1, fontFamily: font.bodySemibold, color: color.text1 },
  scope: { textTransform: 'uppercase', letterSpacing: 0.6 },
  // Its own line, under the title.
  scopeLarge: { flexBasis: '100%' },
  rows: { minHeight: ROW_MIN_HEIGHT * INTRO_BOARD_SIZE },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: space.sm,
  },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  rankSlot: { width: 24 },
  rank: { minWidth: 24, fontFamily: font.bodySemibold },
  // Stacked rows top-align, so the rank sits level with the name.
  rankLarge: { alignSelf: 'flex-start' },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: { flex: 1, minWidth: 0 },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  detail: { flexShrink: 1 },
  chip: {
    borderWidth: 1,
    borderColor: color.text2,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  chipText: {
    fontFamily: font.bodySemibold,
    ...textStyle(glyph.xs),
    color: color.text2,
    letterSpacing: 1,
  },
  value: { alignItems: 'flex-end' },
  valueInline: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginTop: space.xs },
  unit: { letterSpacing: 0.6, marginTop: -2 },
  skelName: { width: '70%', height: 14 },
  skelValue: { width: 44, height: 20 },
});
