import React, { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge } from '@/components/ProBadge';
import { Text } from '@/components/Text';
import type { LockedHistoryRow } from '@/drive/driveAccess';
import {
  color,
  font,
  italicOverhang,
  maxFontScale,
  space,
  textStyle,
  type,
} from '@/theme/tokens';
import type { DriveRowModel } from './driveTabModel';
import { RouteTile } from './RouteTile';
import type { RouteThumb } from './routeGeometry';

/** Rows run full-bleed with this inset (the Driving mock's 20pt). */
export const ROW_INSET = space.lg + space.xs;

/**
 * Past this text size the three columns stop fitting a phone, so the figures
 * drop under the title instead of squeezing it to nothing.
 */
const STACK_AT_FONT_SCALE = 1.4;

/** The distance on the right: the wide italic at the card-title size (the mock's 20). */
const FIGURE = type.cardTitle;

/**
 * One recent drive: its route as a red light trail, its human title from the
 * real date ("Monday afternoon") and the mono facts under it, the distance in
 * the wide italic on the right with the top speed beneath, and a tick only
 * when the server has verified it. One button to VoiceOver, read as one
 * sentence.
 *
 * Memoised: during a drive the Driving tab re-renders on every position poll
 * while its panel lists every drive, and an unchanged row should not redraw
 * its tile each time. Pass a stable `onPress` (and a stable `model`) for that
 * to hold.
 */
export const DriveRow = memo(function DriveRow({
  model,
  thumb,
  verified,
  onPress,
  first = false,
}: {
  model: DriveRowModel;
  thumb: RouteThumb | null | undefined;
  verified: boolean;
  onPress: () => void;
  /** The first row draws its own top rule (the list's top edge). */
  first?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_AT_FONT_SCALE;
  const figures = (
    <View style={stacked ? styles.figuresStacked : styles.figures}>
      <Text style={styles.distance} maxFontSizeMultiplier={maxFontScale.numeral}>
        {model.distance}
        <Text style={styles.unit} maxFontSizeMultiplier={maxFontScale.numeral}>
          {' '}
          {model.distanceUnit}
        </Text>
      </Text>
      <Text variant="monoSmall">{model.top}</Text>
    </View>
  );
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={model.accessibilityLabel}
      style={[styles.row, first && styles.first]}
    >
      <RouteTile kind="route" thumb={thumb} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodySemibold" numberOfLines={2} style={styles.title}>
            {model.title}
          </Text>
          {verified ? (
            <Icon name="verified" size={14} color={color.text2} strokeWidth={1.9} />
          ) : null}
        </View>
        <Text variant="mono" numberOfLines={2}>
          {model.meta}
        </Text>
        {stacked ? figures : null}
      </View>
      {stacked ? null : figures}
    </PressableScale>
  );
});

/**
 * Every drive past Free's window, as one row (lockedHistoryRow): kept,
 * counted, and leading to Pro rather than opening. The lock is grey — a lock
 * is not a light. Only ever drawn while Pro limits are enforced.
 */
export function LockedDrivesRow({
  row,
  onPress,
  first = false,
}: {
  row: LockedHistoryRow;
  onPress: () => void;
  first?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      style={[styles.row, first && styles.first]}
    >
      <RouteTile kind="locked" />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodySemibold" style={styles.title}>
            {row.title}
          </Text>
          {/* Wrapped so the chip centres on the title instead of pinning to the top. */}
          <View>
            <ProBadge />
          </View>
        </View>
        <Text variant="legal">{row.detail}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={color.text3} />
    </PressableScale>
  );
}

/**
 * Before the first drive: the row the first drive will fill — a dashed trail
 * from a start ring — and how a drive gets recorded. No figures: there are
 * none yet, and none are invented.
 */
export function NoDrivesYet({ detection }: { detection: string }) {
  return (
    <View>
      <View style={[styles.row, styles.first]} accessible accessibilityRole="text">
        <RouteTile kind="ghost" />
        <View style={styles.body}>
          <Text variant="bodySemibold">No drives yet</Text>
          <Text variant="mono">Your first one will land here</Text>
        </View>
      </View>
      <Text variant="caption" style={styles.detection}>
        {detection}
      </Text>
    </View>
  );
}

/**
 * "Recent drives", with "All drives" on the right when there are more than
 * the few shown. It opens the rest in place (and "Show fewer" folds them
 * away), so it is a button with an expanded state, not a link.
 */
export function RecentDrivesHeader({
  toggle,
}: {
  toggle?: { expanded: boolean; onPress: () => void };
}) {
  return (
    <View style={styles.header}>
      <Text variant="title" accessibilityRole="header" numberOfLines={2} style={styles.headerTitle}>
        Recent drives
      </Text>
      {toggle ? (
        <PressableScale
          onPress={toggle.onPress}
          accessibilityRole="button"
          accessibilityLabel={toggle.expanded ? 'Show fewer drives' : 'Show all drives'}
          accessibilityState={{ expanded: toggle.expanded }}
          style={styles.toggle}
        >
          <Text variant="mono" style={styles.toggleLabel}>
            {toggle.expanded ? 'Show fewer' : 'All drives'}
          </Text>
          <View style={toggle.expanded ? styles.flip : null}>
            <Icon name="chevronDown" size={16} color={color.text2} strokeWidth={2} />
          </View>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingLeft: ROW_INSET,
    paddingRight: space.sm,
  },
  headerTitle: { flexShrink: 1 },
  toggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.md,
  },
  toggleLabel: { color: color.text2 },
  flip: { transform: [{ rotate: '180deg' }] },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: ROW_INSET,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  first: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.divider },
  body: { flex: 1, minWidth: 0, gap: 5 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 },
  title: { flexShrink: 1 },
  figures: { alignItems: 'flex-end', gap: space.xs },
  figuresStacked: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space.md,
  },
  distance: {
    fontFamily: font.display,
    ...textStyle(FIGURE),
    paddingRight: italicOverhang(FIGURE.size),
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  unit: { fontFamily: font.body, ...textStyle(type.label), color: color.text3 },
  detection: { paddingHorizontal: ROW_INSET, paddingTop: space.md },
});
