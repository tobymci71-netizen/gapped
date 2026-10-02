import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { countryByCode } from '@/data/countries';
import { BottomSheet } from '@/components/BottomSheet';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import {
  fetchBoard,
  fetchBrackets,
  BoardResult,
  Bracket,
  sameBrackets,
  settleBoard,
} from '@/board/boards';
import { BoardMetric, BoardPeriod, BoardRow, BoardScope } from '@/board/types';
import { useDriveStore } from '@/drive/recorder';
import { formatDistance, formatSpeed } from '@/drive/units';
import { bracketLabel } from '@/vehicles/brackets';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/state/profile';
import { color, glyph as glyphSize, radius, space, textStyle } from '@/theme/tokens';

/**
 * `glyph` is the leading mark shown on the pill and beside the sheet row.
 * `detail` is a trailing note that must stay readable however long the label
 * runs — the class picker's driver count.
 */
type Option<T extends string> = { key: T; label: string; glyph?: string; detail?: string };

const METRICS: Option<BoardMetric>[] = [
  { key: 'top_speed', label: 'Top speed' },
  { key: 'distance', label: 'Distance' },
  { key: 'trip_count', label: 'Drives' },
  { key: 'zero_to_60', label: '0–60 mph' },
];
// Rolling windows, labelled as what they are. Both the local board and
// board_top count back from now, so "Today" listed last night's 22:00 run on
// this morning's board — see periodStart in src/board/boards.ts.
const PERIODS: Option<BoardPeriod>[] = [
  { key: 'day', label: '24 hours' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
  { key: 'all', label: 'All-time' },
];

/** Literal table, not toLocaleString: the subtitle must read identically on
 *  every device, whatever ICU data the platform shipped with. */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function currentMonthLabel(): string {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Text scale (iOS AX1 is ~1.79) above which the default layout stops fitting
 * a small phone. The fixed header — headline, pills, toggle, sample banner —
 * grew until the list beneath it had room for less than one row, and the
 * rank, chip and value beside each name could not shrink, so the name went to
 * zero width and the value ran off the edge. Past this scale the header
 * scrolls with the list and each row stacks its value and chips under the
 * name. Below it, nothing changes.
 */
const LARGE_TEXT = 1.5;

/**
 * Ceiling on how far the 9pt row chips scale. They are badges rather than
 * reading text, and at AX5 "UNVERIFIED" alone was wider than the row.
 */
const CHIP_MAX_SCALE = 2;

/** Fallback glyph when the profile carries no country. */
const NO_FLAG = '🏳️';

/** One stable empty list for the loading state, rather than a new [] per render. */
const NO_ROWS: BoardRow[] = [];

function labelFor<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.key === value)?.label ?? '';
}

/** Compact dropdown trigger: glyph, current value, chevron. */
function Pill({
  glyph,
  label,
  onPress,
  disabled,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  /** Dimmed and inert — a filter we cannot honour must not look live. */
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <PressableScale
      silent
      disabled={disabled}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      style={[styles.pill, disabled === true && styles.pillOff]}
    >
      <Text style={styles.pillGlyph}>{glyph}</Text>
      <Text variant="caption" style={styles.pillLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.pillChevron}>▾</Text>
    </PressableScale>
  );
}

function OptionSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: Option<T>[];
  value: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}): React.JSX.Element {
  // Past LARGE_TEXT a row's detail moves under its label. Beside it, the
  // driver count — which never shrinks — left the class name a few characters
  // a line at AX sizes on a small phone.
  const stacked = useWindowDimensions().fontScale >= LARGE_TEXT;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} heightFraction={0.5}>
      {/* Scrolls, because the sheet is a fixed half-screen that clips: the
          class list has a row per class with drivers in it (up to sixty), and
          at accessibility text sizes even the four metrics outgrow it. The
          sheet's drag-to-dismiss lives on its header, so the two gestures
          never compete. */}
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetBody}
        alwaysBounceVertical={false}
      >
        {options.map((o) => (
          <PressableScale
            key={o.key}
            silent
            onPress={() => {
              haptic.selection();
              onSelect(o.key);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: o.key === value }}
            style={styles.option}
          >
            <View style={styles.optionBody}>
              {o.glyph ? <Text style={styles.optionGlyph}>{o.glyph}</Text> : null}
              <View style={stacked ? styles.optionTextStacked : styles.optionText}>
                {/* Two lines before an ellipsis: "All drivetrains · Stock · Open
                    class" is the commonest class and is wider than one line.
                    Stacked, nothing is cut: the sheet scrolls. */}
                <Text
                  variant="bodyMedium"
                  numberOfLines={stacked ? undefined : 2}
                  style={[
                    stacked ? null : styles.optionLabel,
                    { color: o.key === value ? color.accent : color.text1 },
                  ]}
                >
                  {o.label}
                </Text>
                {o.detail ? (
                  <Text variant="caption" style={stacked ? null : styles.optionDetail}>
                    {o.detail}
                  </Text>
                ) : null}
              </View>
            </View>
            {o.key === value ? <Text style={styles.tick}>✓</Text> : null}
          </PressableScale>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

/**
 * One board row. `stacked` is the large-text layout: value and chips move
 * under the name instead of competing with it for one line's width.
 */
function BoardRowView({
  item,
  value,
  stacked,
}: {
  item: BoardRow;
  value: string;
  stacked: boolean;
}): React.JSX.Element {
  const chips = (
    <>
      {item.kind === 'benchmark' ? (
        <View style={styles.chip}>
          <Text style={styles.chipText} maxFontSizeMultiplier={CHIP_MAX_SCALE}>
            BENCHMARK
          </Text>
        </View>
      ) : null}
      {item.kind === 'sample' ? (
        <View style={[styles.chip, { borderColor: color.text3 }]}>
          <Text
            style={[styles.chipText, { color: color.text3 }]}
            maxFontSizeMultiplier={CHIP_MAX_SCALE}
          >
            SAMPLE
          </Text>
        </View>
      ) : null}
      {/* A run's verification state is per-row, so it is shown per
          row — the filter chip alone cannot say which is which. */}
      {(item.kind === 'you' || item.kind === 'user') && item.verification === 'unverified' ? (
        <View style={[styles.chip, { borderColor: color.unverified }]}>
          <Text
            style={[styles.chipText, { color: color.unverified }]}
            maxFontSizeMultiplier={CHIP_MAX_SCALE}
          >
            UNVERIFIED
          </Text>
        </View>
      ) : null}
    </>
  );
  const valueText = (
    <Text
      variant="bodyMedium"
      style={{
        color:
          item.kind === 'you'
            ? color.accent
            : item.verification === 'verified'
              ? color.text1
              : color.text2,
      }}
    >
      {value}
    </Text>
  );

  return (
    <View
      style={[
        styles.row,
        item.kind === 'you' && styles.rowYou,
        item.kind === 'benchmark' && styles.rowBenchmark,
      ]}
    >
      <Text variant="bodyMedium" style={styles.rank}>
        {item.rank}
      </Text>
      <View style={styles.rowBody}>
        <Text
          variant="bodyMedium"
          style={item.kind === 'benchmark' ? { color: color.text2 } : undefined}
          numberOfLines={stacked ? 2 : 1}
        >
          {item.username}
        </Text>
        {item.vehicle || item.note ? (
          <Text variant="caption" numberOfLines={1}>
            {item.vehicle ?? item.note}
          </Text>
        ) : null}
        {stacked ? (
          <View style={styles.rowStacked}>
            {valueText}
            {chips}
          </View>
        ) : null}
      </View>
      {stacked ? null : (
        <>
          {chips}
          {valueText}
        </>
      )}
    </View>
  );
}

export default function BoardScreen() {
  const router = useRouter();
  const { username, country, unitPref } = useProfile();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= LARGE_TEXT;
  const [metric, setMetric] = useState<BoardMetric>('top_speed');
  const [scope, setScope] = useState<BoardScope>('global');
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  // null = open board across every class.
  const [bracket, setBracket] = useState<string | null>(null);
  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [sheet, setSheet] = useState<'scope' | 'metric' | 'period' | 'bracket' | null>(null);
  // Refreshed on focus, not frozen at mount: the tab is never unmounted, so a
  // label computed once still read "Sep" in October.
  const [monthLabel, setMonthLabel] = useState(currentMonthLabel);

  // The reference labels its scope options with flags; ours names the user's
  // own country rather than a generic "Country".
  const countryEntry = useMemo(() => countryByCode(country), [country]);
  const scopes: Option<BoardScope>[] = useMemo(
    () => [
      { key: 'global', label: 'World', glyph: '🌍' },
      {
        key: 'country',
        label: countryEntry?.name ?? 'Country',
        glyph: countryEntry?.flag ?? NO_FLAG,
      },
      { key: 'friends', label: 'Friends', glyph: '👥' },
    ],
    [countryEntry],
  );
  const scopeGlyph = scopes.find((o) => o.key === scope)?.glyph ?? '🌍';

  // Driver counts are shown because a class of two is a different claim than a
  // class of two hundred, and the label alone hides that. The count is its
  // own text rather than a suffix on the label: appended, it was the first
  // thing the ellipsis took.
  const bracketOptions: Option<string>[] = useMemo(
    () => [
      { key: 'all', label: 'All classes', glyph: '🌐' },
      ...brackets.map((b) => ({
        key: b.key,
        label: bracketLabel(b.key),
        detail: `${b.drivers} driver${b.drivers === 1 ? '' : 's'}`,
        glyph: '🏁',
      })),
    ],
    [brackets],
  );

  // Only the newest request may commit, so a slow response for an earlier
  // filter cannot overwrite a newer one. This used to carry a second job —
  // rows were formatted using the screen's current metric, so a late response
  // would be labelled with the wrong unit — but rows now carry their own
  // metric and format correctly regardless of arrival order. What remains is
  // ordering alone.
  const requestId = useRef(0);
  // The slice the rows on screen answer, so a refetch can tell a new filter
  // (clear to the skeleton: the old rows answer a different question) from
  // the same one again on refocus (refresh in place).
  const shownQuery = useRef<string | null>(null);
  // `live`: a local board holds only this device's drives, so scope and
  // verification are server concepts and those controls are shown inert
  // rather than lying. Held beside `result` rather than derived from it so the
  // controls do not flicker while `result` is null during a reload.
  const [board, setBoard] = useState<{ result: BoardResult | null; live: boolean }>({
    result: null,
    live: false,
  });
  const { result, live: filtersLive } = board;
  const load = useCallback(async () => {
    const key = JSON.stringify([metric, scope, period, verifiedOnly, bracket, username, country]);
    const quiet = key === shownQuery.current;
    shownQuery.current = key;
    const seq = ++requestId.current;
    if (!quiet) setBoard((b) => (b.result == null ? b : { ...b, result: null }));
    const r = await fetchBoard({ metric, scope, period, verifiedOnly, bracket }, username, country);
    if (seq !== requestId.current) return;
    setBoard((b) => {
      const next = settleBoard(b.result, r, quiet);
      return next === b.result ? b : { result: next, live: next.source === 'server' };
    });
    // `country` is a real input now that it scopes the query — without it here
    // a country change would leave the previous country's board on screen.
  }, [metric, scope, period, verifiedOnly, username, country, bracket]);

  // On focus as well as on filter change. Tab screens stay mounted, so a
  // mount-only load kept the SAMPLE board up after the first drive, and a
  // friend added through "Manage friends" never appeared on return. The
  // refocus fetch is quiet (see `load`), so switching tabs neither flashes
  // the skeleton nor replays the row entrances.
  //
  // Focus is not the only way back to a board that is showing, so while it is
  // focused it also refreshes on return to the foreground and when a drive
  // finishes with no navigation (auto-end with the phone left on this tab) —
  // the same triggers as the You tab. Focus alone left an app parked on Ranks
  // overnight showing yesterday's board, and on the 1st still reading last
  // month.
  useFocusEffect(
    useCallback(() => {
      const refresh = () => {
        setMonthLabel(currentMonthLabel());
        void load();
      };
      refresh();
      const appState = AppState.addEventListener('change', (s) => {
        if (s === 'active') refresh();
      });
      const unsubscribeDrives = useDriveStore.subscribe((s, prev) => {
        if (s.lastSummary !== prev.lastSummary) void load();
      });
      return () => {
        appState.remove();
        unsubscribeDrives();
      };
    }, [load]),
  );

  // Only classes that actually contain drivers are offered — a combinatorial
  // menu of empty brackets would be mostly dead ends. Counted over the same
  // slice the board shows, so the scope and verification filters are inputs
  // here too; refetched on focus for the same reason as the board.
  useFocusEffect(
    useCallback(() => {
      let current = true;
      // Two asks can overlap (focus, then a return to the foreground); only
      // the newest may commit.
      let asked = 0;
      const ask = () => {
        const n = ++asked;
        fetchBrackets({ metric, scope, period, verifiedOnly }, country).then((b) => {
          // null: the server could not be asked. Keep the classes on offer.
          if (!current || n !== asked || b == null) return;
          setBrackets((prev) => (sameBrackets(prev, b) ? prev : b));
          // A class with nobody left in this slice (the window moved on, or the
          // scope narrowed past it) must not stay selected, or the board shows
          // nothing under a picker that no longer lists the class.
          setBracket((cur) => (cur && !b.some((x) => x.key === cur) ? null : cur));
        });
      };
      ask();
      // The window moves on while the app sits in the background, too.
      const appState = AppState.addEventListener('change', (s) => {
        if (s === 'active') ask();
      });
      return () => {
        current = false;
        appState.remove();
      };
    }, [metric, period, scope, verifiedOnly, country]),
  );

  // A lit chip over rows nothing has verified would assert the filter applied.
  const verifiedShown = filtersLive && verifiedOnly;

  /**
   * Formats a row's value in the unit that row's metric is measured in.
   *
   * Two things changed here when BoardRow.value became a discriminated union.
   *
   * The unit no longer has to be asserted: `row.metric` narrows `row.value` to
   * a single branded type, so `formatSpeed` can only ever be handed m/s. The
   * smart-constructor calls that used to re-brand a bare number are gone, and
   * with them the possibility that this switch and the one in boards.ts drift
   * apart — they now share a discriminant, and adding a fifth metric fails to
   * compile in both files until both handle it.
   *
   * More importantly, this switched on `metric` — the screen's *current*
   * selection — rather than on the row. Rows fetched for one metric and still
   * on screen when the pill changed were formatted in the new metric's units:
   * a 0-60 time rendered as "4 m", a distance rendered as a speed. Switching
   * on `row.metric` makes the row carry its own unit, so a stale row formats
   * correctly no matter what the pill says.
   */
  const formatValue = (row: BoardRow): string => {
    switch (row.metric) {
      case 'top_speed':
        return formatSpeed(row.value, unitPref);
      case 'distance':
        return formatDistance(row.value, unitPref);
      case 'trip_count':
        return `${Math.round(row.value)}`;
      case 'zero_to_60':
        return `${row.value.toFixed(2)} s`;
      default: {
        const unhandled: never = row;
        return unhandled;
      }
    }
  };

  const header = (
    <View style={styles.header}>
      <Text variant="headline">Ranks</Text>
      {/* The display face is upright by house rule — the reference sets this
          subtitle in italic; we set it in the caption face instead. */}
      <Text variant="caption" style={styles.subtitle}>
        {monthLabel}
      </Text>

      {/* Pills size to their content inside a scroller. At flex: 1 the fourth
          pill left roughly 14pt for a label, so "Top speed" and "All-time"
          rendered as one glyph and an ellipsis. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillsScroll}
        contentContainerStyle={styles.pills}
      >
        {/* Inert on a local board — but never while a narrower scope is
            still applied, or a board that fell back offline could hold the
            screen on Friends with no way back to World. */}
        <Pill
          glyph={scopeGlyph}
          label={labelFor(scopes, scope)}
          onPress={() => setSheet('scope')}
          disabled={!filtersLive && scope === 'global'}
        />
        <Pill glyph="⚡" label={labelFor(METRICS, metric)} onPress={() => setSheet('metric')} />
        <Pill glyph="📅" label={labelFor(PERIODS, period)} onPress={() => setSheet('period')} />
        {brackets.length > 0 ? (
          <Pill
            glyph="🏁"
            label={bracket ? bracketLabel(bracket) : 'All classes'}
            onPress={() => setSheet('bracket')}
            disabled={!filtersLive && bracket == null}
          />
        ) : null}
      </ScrollView>

      <View style={styles.toggleRow}>
        {/* The press target is the full 44pt; the bordered box drawn inside
            it keeps its compact size. */}
        <PressableScale
          silent
          disabled={!filtersLive}
          onPress={() => {
            haptic.selection();
            setVerifiedOnly((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: verifiedShown, disabled: !filtersLive }}
          accessibilityLabel="Verified runs only"
          style={styles.verifiedHit}
        >
          <View
            style={[
              styles.verifiedToggle,
              verifiedShown && styles.verifiedToggleOn,
              !filtersLive && styles.pillOff,
            ]}
          >
            <Text
              variant="caption"
              style={[
                styles.verifiedLabel,
                { color: verifiedShown ? color.verified : color.text3 },
              ]}
            >
              VERIFIED
            </Text>
          </View>
        </PressableScale>
      </View>

      {result?.isSample ? (
        <View style={styles.sampleBanner}>
          <Text variant="caption" style={{ color: color.onAccent }}>
            SAMPLE BOARD — record your first drive to start the real one
          </Text>
        </View>
      ) : null}

      {/* The friends board is only ever as full as you make it, so the way to
          fill it belongs right here rather than buried in Settings. */}
      {scope === 'friends' ? (
        <PressableScale
          onPress={() => router.push('/friends')}
          accessibilityRole="button"
          accessibilityLabel="Manage friends"
          style={styles.manageFriends}
        >
          <Text variant="caption" style={{ color: color.accent }}>
            Manage friends →
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false}>
      {largeText ? null : header}

      <OptionSheet
        visible={sheet === 'bracket'}
        title="Vehicle class"
        options={bracketOptions}
        value={bracket ?? 'all'}
        onSelect={(v) => setBracket(v === 'all' ? null : v)}
        onClose={() => setSheet(null)}
      />

      {/* The list stays mounted through a reload, with the skeleton as its
          empty state, so that at large text the header can live inside it
          and scroll away rather than leaving the rows no room. It fades in
          once, as a whole: an Entrance per row replayed its animation every
          time FlashList recycled a cell into a new position. */}
      <Entrance style={styles.list}>
        <FlashList
          data={result?.rows ?? NO_ROWS}
          keyExtractor={(r: BoardRow) => r.id}
          ListHeaderComponent={largeText ? header : null}
          renderItem={({ item }: { item: BoardRow }) => (
            <BoardRowView item={item} value={formatValue(item)} stacked={largeText} />
          )}
          ListEmptyComponent={
            result == null ? (
              <View style={styles.skeleton}>
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} style={{ height: 56 }} />
                ))}
              </View>
            ) : (
              <View style={styles.empty}>
                <View style={styles.emptyTile}>
                  <Text style={styles.emptyGlyph}>🏆</Text>
                </View>
                <Text variant="cardTitle">No entries yet</Text>
                <Text variant="body" style={styles.emptyCopy}>
                  No runs match this slice. Drive, and this board fills with real entries —
                  never invented ones.
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            result != null && result.framing.length > 0 ? (
              <View style={styles.framing}>
                {result.framing.map((f) => (
                  <Text key={f} variant="caption" style={{ textAlign: 'center' }}>
                    {f}
                  </Text>
                ))}
              </View>
            ) : null
          }
        />
      </Entrance>

      <OptionSheet
        visible={sheet === 'scope'}
        title="Scope"
        options={scopes}
        value={scope}
        onSelect={setScope}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'metric'}
        title="Metric"
        options={METRICS}
        value={metric}
        onSelect={setMetric}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'period'}
        title="Period"
        options={PERIODS}
        value={period}
        onSelect={setPeriod}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: space.md },
  subtitle: { color: color.text3, marginTop: 2, letterSpacing: 0.4 },
  pills: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  pillsScroll: { flexGrow: 0, marginTop: space.lg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    // The 44pt touch minimum; the padding alone came to 40.
    minHeight: 44,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  pillGlyph: textStyle(glyphSize.md),
  // No flex here. These pills live in a horizontal scroller, so there is no
  // bounded width to take a share of: `flex: 1` made the first pill's label
  // absorb the whole viewport, so "World" filled the row and the metric,
  // period and class pills were pushed off-screen entirely — reachable only by
  // scrolling a row that gave no sign it could scroll. Sizing to content is
  // what lets all four sit side by side.
  pillLabel: { color: color.text1 },
  pillChevron: { ...textStyle(glyphSize.sm), color: color.text3 },
  pillOff: { opacity: 0.45 },
  // marginTop is small because the 44pt press target already centres the
  // box with ~8pt of air above it.
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.xs },
  verifiedHit: { minHeight: 44, justifyContent: 'center' },
  verifiedToggle: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  verifiedToggleOn: { borderColor: color.verified },
  verifiedLabel: { ...textStyle(glyphSize.sm), letterSpacing: 0.8 },
  sheetScroll: { flex: 1 },
  sheetBody: { paddingHorizontal: space.xl },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  optionBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 },
  optionText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 },
  optionTextStacked: { flex: 1, minWidth: 0, gap: 2 },
  optionLabel: { flex: 1 },
  optionDetail: { flexShrink: 0 },
  optionGlyph: textStyle(glyphSize.xl),
  tick: { fontSize: 16, lineHeight: 20, color: color.accent },
  // xs, not md: it follows the VERIFIED row, whose 44pt target already
  // leaves ~8pt below the box.
  sampleBanner: {
    marginTop: space.xs,
    backgroundColor: color.accent,
    borderRadius: radius.card / 2,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  // A 44pt target with the link text centred in it. The 12pt that used to be
  // a margin above the text is now inside the target, so the tap no longer
  // has to land on a 20pt line of caption.
  manageFriends: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  list: { flex: 1 },
  skeleton: { gap: space.md, paddingTop: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.surface2,
  },
  rowYou: {
    backgroundColor: 'rgba(204, 255, 0, 0.08)', // color.accent, tinted
    borderRadius: radius.card / 2,
  },
  rowBenchmark: { opacity: 0.85 },
  rank: { minWidth: 28, textAlign: 'center', color: color.text2 },
  rowBody: { flex: 1, gap: 1, minWidth: 0 },
  rowStacked: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: color.accentDim,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  chipText: { color: color.accentDim, fontSize: 9, lineHeight: 11, letterSpacing: 1 },
  empty: { alignItems: 'center', gap: space.md, paddingTop: space.xxl },
  emptyTile: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(204, 255, 0, 0.10)', // color.accent, tinted
    borderWidth: 1,
    borderColor: color.hairline,
  },
  emptyGlyph: { fontSize: 32, lineHeight: 38 },
  emptyCopy: { textAlign: 'center' },
  framing: { gap: space.xs, paddingVertical: space.lg },
});
