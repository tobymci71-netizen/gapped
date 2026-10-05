import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SlantTag, type SlantTagVariant } from '@/components/brand/SlantTag';
import { StreakBar } from '@/components/brand/StreakArrow';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import {
  type RowTag,
  rowSubLine,
  rowTags,
  rowVerified,
  type ValueParts,
} from '@/board/present';
import type { BoardRow } from '@/board/types';
import { duration, stagger, STAGGER_CAP } from '@/theme/motion';
import { color, font, maxFontScale, space, textStyle, type } from '@/theme/tokens';
import { COL_GAP, EDGE, MORE_W, POS_W, POS_W_LARGE, ROW_END } from './layout';

/** How long one bar takes to sweep out (the mock's 1.1 s, on the token scale). */
const SWEEP_ONE = duration.epic;
/** The whole board's sweep: the last staggered bar finishes at this. */
export const SWEEP_TOTAL = SWEEP_ONE + STAGGER_CAP * stagger;
/** The mock's sweep curve: quick out of the origin, a long settle into the tip. */
const SWEEP_EASE = Easing.bezierFn(0.2, 0.7, 0.2, 1);

const TAG: Record<RowTag, { label: string; variant: SlantTagVariant }> = {
  you: { label: 'You', variant: 'red' },
  sample: { label: 'SAMPLE', variant: 'white-outline' },
  benchmark: { label: 'BENCHMARK', variant: 'dark' },
  unverified: { label: 'Unverified', variant: 'dark' },
};

type Props = {
  item: BoardRow;
  /** Its position in the list, which staggers its bar's sweep. */
  index: number;
  value: ValueParts;
  /** The whole row as one VoiceOver sentence (rowAccessibilityLabel). */
  accessibilityLabel: string;
  /** Its bar's share of the board's best, 0–1 (barProgress). */
  progress: number;
  /** The bar track's width (barTrackWidth). */
  track: number;
  /** The board's sweep, 0 → 1, shared by every row (see BoardScreen). */
  sweep: SharedValue<number>;
  /**
   * The large-text layout: the value and tags move under the name instead of
   * competing with it for one line's width.
   */
  stacked: boolean;
  /**
   * The board has rows with a '⋯' button, so every row keeps the column, and
   * values stay aligned whether or not their own row has one.
   */
  menuSlot: boolean;
  /** Opens Report / Hide. Set only on another real driver's row. */
  onMore?: () => void;
};

/**
 * One board row (Nightrun-Ranks): position in the wide italic, the name with
 * its verified tick and tags, the value in mono on the right, and beneath it a
 * red streak bar from a common origin, sized to the value and ending in the
 * logo's streak tip. Your own row sits in a red band with a "You" tag, and its
 * bar runs hot to a white-hot tip.
 *
 * The bars sweep out once, when a new board lands: every row reads one shared
 * value, so a cell FlashList recycles into a new position shows its bar as it
 * stands rather than replaying the sweep.
 */
export function BoardRowView({
  item,
  index,
  value,
  accessibilityLabel,
  progress,
  track,
  sweep,
  stacked,
  menuSlot,
  onMore,
}: Props): React.JSX.Element {
  const you = item.kind === 'you';
  const podium = item.rank >= 1 && item.rank <= 3;
  const tags = rowTags(item);
  // Said in the row's VoiceOver sentence too (rowAccessibilityLabel).
  const sub = rowSubLine(item);

  const tagViews = tags.map((t) => (
    <SlantTag
      key={t}
      label={TAG[t].label}
      variant={TAG[t].variant}
      size="sm"
      decorative
      style={styles.tag}
    />
  ));
  const tick = rowVerified(item) ? (
    <Icon name="verified" size={13} color={you ? color.text2 : color.text3} strokeWidth={2} />
  ) : null;

  const valueText = (
    <Text
      variant="mono"
      numberOfLines={1}
      style={[
        styles.figure,
        you && styles.figureYou,
        !you && item.verification === 'unverified' && styles.figureMuted,
      ]}
    >
      {value.figure}
      <Text variant="mono" style={[styles.unit, you && styles.unitYou]}>
        {` ${value.unit}`}
      </Text>
    </Text>
  );

  // The visible, VoiceOver-reachable way to Report or Hide; the row's long
  // press is the shortcut to the same sheet.
  const more = onMore ? (
    <PressableScale
      silent
      onPress={() => {
        haptic.selection();
        onMore();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Report or hide ${item.username}`}
      style={styles.more}
    >
      <Icon name="more" size={20} color={color.text3} />
    </PressableScale>
  ) : menuSlot ? (
    <View style={styles.more} />
  ) : null;

  const row = (
    <View style={[styles.row, !menuSlot && styles.rowNoMenu]}>
      {you ? <YouBand /> : null}
      {/* Position, name, tags and value are one sentence to VoiceOver; the
          '⋯' button beside them stays its own element. */}
      <View style={styles.content} accessible accessibilityLabel={accessibilityLabel}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={maxFontScale.title}
          style={[
            styles.position,
            stacked && styles.positionLarge,
            { color: podium || you ? color.text1 : color.text3 },
          ]}
        >
          {item.rank}
        </Text>
        <View style={styles.main}>
          {stacked ? (
            <>
              <View style={styles.nameWrap}>
                <Text variant="bodySemibold" style={styles.nameStacked} numberOfLines={2}>
                  {item.username}
                </Text>
                {tagViews}
                {tick}
              </View>
              <View style={styles.valueStacked}>{valueText}</View>
            </>
          ) : (
            <View style={styles.line}>
              <View style={styles.nameRow}>
                <Text
                  variant="bodySemibold"
                  numberOfLines={1}
                  style={[styles.name, item.kind === 'benchmark' && styles.nameMuted]}
                >
                  {item.username}
                </Text>
                {tagViews}
                {tick}
              </View>
              {valueText}
            </View>
          )}
          {sub ? (
            <Text variant="monoSmall" numberOfLines={1} style={styles.sub}>
              {sub}
            </Text>
          ) : null}
          <SweepBar
            sweep={sweep}
            index={index}
            track={track}
            progress={progress}
            you={you}
            dim={!you && item.rank > 3}
          />
        </View>
      </View>
      {more}
    </View>
  );

  if (!onMore) return row;
  // Not accessible itself, so VoiceOver still reaches the row and its '⋯'
  // button one by one; a grouped row would swallow the button. No press
  // styling either: every scroll that starts on a row would flash it.
  return (
    <Pressable
      accessible={false}
      onLongPress={() => {
        haptic.selection();
        onMore();
      }}
    >
      {row}
    </Pressable>
  );
}

/** A row's bar, swept out from its origin by the board's shared `sweep`. */
function SweepBar({
  sweep,
  index,
  track,
  progress,
  you,
  dim,
}: {
  sweep: SharedValue<number>;
  index: number;
  track: number;
  progress: number;
  you: boolean;
  dim: boolean;
}): React.JSX.Element {
  const delay = Math.min(index, STAGGER_CAP) * stagger;
  const style = useAnimatedStyle(() => {
    const local = (sweep.get() * SWEEP_TOTAL - delay) / SWEEP_ONE;
    const t = SWEEP_EASE(Math.min(1, Math.max(0, local)));
    return { opacity: t, transform: [{ scaleX: Math.max(t, 0.001) }] };
  });
  return (
    <Animated.View style={[styles.bar, you && styles.barYou, { width: track }, style]}>
      {/* Below the podium the bars burn lower: StreakBar's dim ramp (the mock's #rkD). */}
      <StreakBar width={track} progress={progress} you={you} dim={dim} />
    </Animated.View>
  );
}

/** Your row's band: a red wash fading right, and a lit edge on the left. */
function YouBand(): React.JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="youBand" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color.accent} stopOpacity={0.17} />
            <Stop offset="0.62" stopColor={color.accent} stopOpacity={0.04} />
            <Stop offset="1" stopColor={color.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#youBand)" />
      </Svg>
      <View style={styles.youEdge} />
    </View>
  );
}

/** A skeleton row the shape of a real one, for the loading board. */
export function BoardRowSkeleton({ index, track }: { index: number; track: number }) {
  // Bars shortening down the board, as a real one does.
  const share = Math.max(0.25, 1 - index * 0.12);
  return (
    <View style={[styles.row, styles.rowNoMenu]}>
      <View style={styles.content}>
        <View style={styles.skPos}>
          <Skeleton style={{ width: 12, height: 14 }} />
        </View>
        <View style={styles.main}>
          <View style={styles.line}>
            <Skeleton style={{ width: 96 + ((index * 37) % 50), height: 12 }} />
            <Skeleton style={{ width: 44, height: 12 }} />
          </View>
          <Skeleton style={{ width: Math.round(track * share), height: 4 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    // The mock's grid: position | name and bar | '⋯', 10pt apart, so the
    // bar track is exactly barTrackWidth().
    gap: COL_GAP,
    paddingLeft: EDGE,
    paddingRight: ROW_END,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.divider,
  },
  rowNoMenu: { paddingRight: EDGE },
  content: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: COL_GAP,
    paddingVertical: space.md,
  },
  position: {
    width: POS_W,
    fontFamily: font.displayBold,
    ...textStyle(type.title),
    fontVariant: ['tabular-nums'],
  },
  positionLarge: { width: POS_W_LARGE },
  main: { flex: 1, minWidth: 0, gap: space.xs + 2 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: COL_GAP,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  name: { flexShrink: 1 },
  nameMuted: { color: color.text2 },
  // Tags pin themselves to the top of their line; these sit on the name's middle.
  tag: { alignSelf: 'center' },
  nameWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  nameStacked: { flexShrink: 1 },
  valueStacked: { flexDirection: 'row' },
  figure: {
    fontFamily: font.monoMedium,
    ...textStyle(type.legal),
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  figureYou: { fontFamily: font.monoBold },
  figureMuted: { color: color.text2 },
  unit: { fontFamily: font.mono, ...textStyle(type.small), color: color.text3 },
  unitYou: { color: color.text2 },
  sub: { color: color.text3, marginTop: -2 },
  bar: { height: 6, transformOrigin: 'left center' },
  // Your bar is a light, so it may glow: a CALayer shadow on a clear view
  // follows the bar's own alpha, which is the mock's drop-shadow.
  barYou: Platform.select({
    ios: {
      shadowColor: color.accent,
      shadowOpacity: 0.9,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 0 },
    },
    default: {},
  }),
  more: { width: MORE_W, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  youEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: color.accent,
  },
  skPos: { width: POS_W, paddingTop: 4 },
});
