import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { countryByCode } from '@/data/countries';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { Icon } from '@/components/icons';
import { useGoPro } from '@/components/ProBadge';
import { ReportSheet, type ReportTarget } from '@/components/ReportSheet';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import {
  boardSafetyLine,
  fetchBoard,
  fetchBrackets,
  BoardResult,
  Bracket,
  sameBrackets,
  settleBoard,
} from '@/board/boards';
import {
  ALL_CLASSES,
  ALL_CLASSES_LABEL,
  appliedBracket,
  bracketOptions as classOptions,
  bracketPillAccessibilityLabel,
  bracketsLocked,
  pickBracket,
} from '@/board/bracketAccess';
import {
  answeredAfter,
  type HiddenHere,
  hideHere,
  isModeratable,
  settleHidden,
  withoutHidden,
} from '@/board/hiddenRows';
import {
  barProgress,
  boardBasis,
  type BoardOrigin,
  boardOrigin,
  heroView,
  periodWords,
  rowAccessibilityLabel,
  scopeName as scopeLabel,
  valueParts,
} from '@/board/present';
import { BoardMetric, BoardPeriod, BoardRow, BoardScope } from '@/board/types';
import { BoardHero } from '@/board/ui/BoardHero';
import { BoardRowSkeleton, BoardRowView, SWEEP_TOTAL } from '@/board/ui/BoardRow';
import {
  BoardLink,
  DropChip,
  LARGE_TEXT,
  MetricTabs,
  type Option,
  OptionSheet,
  Segments,
  VerifiedToggle,
} from '@/board/ui/controls';
import { barTrackWidth, EDGE } from '@/board/ui/layout';
import { useDriveStore } from '@/drive/recorder';
import { bracketLabel } from '@/vehicles/brackets';
import { useAccess } from '@/lib/entitlements';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useProfile } from '@/state/profile';
import { color, space } from '@/theme/tokens';

// Distance first, and the board the tab opens on: it ranks driving, not a
// number that could be chased on a public road. Top speed and 0–60 stay a
// tap away, each with its safety line (boardSafetyLine).
const METRICS: Option<BoardMetric>[] = [
  {
    key: 'distance',
    label: 'Distance',
    accessibilityHint: "Ranks each driver's longest single drive.",
  },
  {
    key: 'trip_count',
    label: 'Drives',
    accessibilityHint: 'Ranks how many drives each driver recorded.',
  },
  { key: 'top_speed', label: 'Top speed' },
  { key: 'zero_to_60', label: '0–60', accessibilityLabel: '0 to 60 mph' },
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

/** One stable empty list for the loading state, rather than a new [] per render. */
const NO_ROWS: BoardRow[] = [];

/** Nobody hidden on this screen yet. */
const NONE_HIDDEN: HiddenHere = new Map();

/** Skeleton rows while a board loads: about a screenful. */
const SKELETON_ROWS = 6;

function labelFor<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.key === value)?.label ?? '';
}

/*
 * LARGE_TEXT (src/board/ui/controls.tsx) is the text scale (iOS AX1 is ~1.79)
 * above which the default layout stops fitting a small phone. The fixed
 * controls — headline, tabs, segments, chips — grew until the list beneath
 * them had room for less than one row, and the rank, tags and value beside
 * each name could not shrink, so the name went to zero width and the value
 * ran off the edge. Past this scale the controls scroll with the list, the
 * hero drops its scene, and each row stacks its value and tags under the
 * name. Below it, nothing changes.
 */

export default function BoardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { username, country, unitPref } = useProfile();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const largeText = fontScale >= LARGE_TEXT;
  const reduced = useReducedMotion();
  const [metric, setMetric] = useState<BoardMetric>('distance');
  const [scope, setScope] = useState<BoardScope>('global');
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  // null = open board across every class.
  const [bracket, setBracket] = useState<string | null>(null);
  const [brackets, setBrackets] = useState<Bracket[]>([]);
  // Classes are Pro; placement is not (src/board/bracketAccess.ts). Held as a
  // stable object: useAccess() returns a fresh one every render, and anything
  // keyed on it — the class rows, and through `shownBracket` the board's own
  // fetch — must not be rebuilt on each.
  const { isPro, enforced } = useAccess();
  const access = useMemo(() => ({ isPro, enforced }), [isPro, enforced]);
  const goPro = useGoPro();
  // A locked class leads to Pro, but only once its sheet is gone: a push made
  // while the sheet's Modal is still up is dropped on iOS.
  const proAfterSheet = useRef(false);
  const classesLocked = bracketsLocked(access);
  // The class the board answers. Without enforcement, and on Pro, this is
  // `bracket` itself, so nothing about the open board changes. Memoised so
  // the compiler can see it is as stable as `bracket` where `load` keys on it.
  const shownBracket = useMemo(() => appliedBracket(bracket, access), [bracket, access]);
  const classLabel = shownBracket ? bracketLabel(shownBracket) : ALL_CLASSES_LABEL;
  const [sheet, setSheet] = useState<'period' | 'bracket' | null>(null);

  // The segments read World / Country / Friends, as the mock sets them; the
  // board's caption and VoiceOver name the viewer's own country (scopeName,
  // below the board state).
  const countryEntry = useMemo(() => countryByCode(country), [country]);
  const scopes: Option<BoardScope>[] = useMemo(
    () => [
      { key: 'global', label: 'World' },
      {
        key: 'country',
        label: 'Country',
        accessibilityLabel: countryEntry ? `Country, ${countryEntry.name}` : 'Country',
      },
      { key: 'friends', label: 'Friends' },
    ],
    [countryEntry],
  );

  // Driver counts are shown because a class of two is a different claim than a
  // class of two hundred, and the label alone hides that. The count is its
  // own text rather than a suffix on the label: appended, it was the first
  // thing the ellipsis took. Built in src/board/bracketAccess.ts, which marks
  // each class PRO when the plan does not open it.
  const bracketOptions: Option<string>[] = useMemo(
    () => classOptions(brackets, access),
    [brackets, access],
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
  // `origin`: where the newest board's rows came from (boardOrigin). A local
  // board holds only this device's drives, so scope and verification are
  // server concepts and those controls are shown inert rather than lying, and
  // the caption names the board for what it is. Held beside `result` rather
  // than derived from it so neither flickers while `result` is null during a
  // reload; null until the first board lands.
  // `answered`: the newest request the server has answered, whether or not
  // its board differed from the one showing, which says which hides the
  // server has applied by itself (below, and answeredAfter).
  // `failed`: the newest request threw before it could answer at all (not
  // the same as an empty board, which is an answer).
  const [board, setBoard] = useState<{
    result: BoardResult | null;
    origin: BoardOrigin | null;
    answered: number;
    failed: boolean;
  }>({
    result: null,
    origin: null,
    answered: 0,
    failed: false,
  });
  const { result, origin, answered, failed } = board;
  const filtersLive = origin === 'server';
  const scopeName = scopeLabel(scope, countryEntry?.name ?? null, origin);
  // Report / Hide. `hidden` takes a driver off this board the moment the hide
  // goes through, until a board fetched after it — which the server answers
  // without them — is the one on screen (src/board/hiddenRows.ts).
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [hidden, setHidden] = useState<HiddenHere>(NONE_HIDDEN);
  const rows = useMemo(
    () => withoutHidden(result?.rows ?? NO_ROWS, settleHidden(hidden, answered)),
    [result, hidden, answered],
  );
  const menuSlot = useMemo(() => rows.some(isModeratable), [rows]);
  const load = useCallback(async () => {
    const key = JSON.stringify([
      metric,
      scope,
      period,
      verifiedOnly,
      shownBracket,
      username,
      country,
    ]);
    const quiet = key === shownQuery.current;
    shownQuery.current = key;
    const seq = ++requestId.current;
    if (!quiet) {
      setBoard((b) => (b.result == null && !b.failed ? b : { ...b, result: null, failed: false }));
    }
    let r: BoardResult;
    try {
      r = await fetchBoard(
        { metric, scope, period, verifiedOnly, bracket: shownBracket },
        username,
        country,
      );
    } catch {
      // fetchBoard falls back to this device's drives when the server cannot
      // be reached, so this is the device's own store failing. A quiet
      // refetch keeps the board already showing; a new filter says so and
      // offers to try again rather than holding the skeleton for ever.
      if (seq !== requestId.current) return;
      setBoard((b) => (b.result == null ? { ...b, failed: true } : b));
      return;
    }
    if (seq !== requestId.current) return;
    setBoard((b) => {
      const next = settleBoard(b.result, r, quiet);
      // Counted even when the board is unchanged (answeredAfter): an Unhide
      // made before any refetch comes back as exactly the board from before
      // the hide.
      const nowAnswered = answeredAfter(b.answered, seq, r.source);
      return next === b.result && nowAnswered === b.answered && !b.failed
        ? b
        : { result: next, origin: boardOrigin(next), answered: nowAnswered, failed: false };
    });
    // `country` is a real input now that it scopes the query — without it here
    // a country change would leave the previous country's board on screen.
  }, [metric, scope, period, verifiedOnly, username, country, shownBracket]);

  // On focus as well as on filter change. Tab screens stay mounted, so a
  // mount-only load kept the SAMPLE board up after the first drive, and a
  // friend added through "Manage friends" never appeared on return. The
  // refocus fetch is quiet (see `load`), so switching tabs neither flashes
  // the skeleton nor replays the bars' sweep.
  //
  // Focus is not the only way back to a board that is showing, so while it is
  // focused it also refreshes on return to the foreground and when a drive
  // finishes with no navigation (auto-end with the phone left on this tab) —
  // the same triggers as the You tab. Focus alone left an app parked on Ranks
  // overnight showing yesterday's board.
  useFocusEffect(
    useCallback(() => {
      void load();
      const appState = AppState.addEventListener('change', (s) => {
        if (s === 'active') void load();
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

  // The bars sweep out once per new board: from 0 when a board lands after
  // the skeleton, never on a quiet refresh (the board object is kept) or a
  // hide (the rows change, the board does not). One shared value for every
  // row, so FlashList recycling a cell never replays it. Reduce Motion: drawn
  // at full length.
  const sweep = useSharedValue(0);
  const hadBoard = useRef(false);
  useEffect(() => {
    const has = result != null;
    if (!has) sweep.set(0);
    else if (!hadBoard.current) {
      sweep.set(
        reduced ? 1 : withTiming(1, { duration: SWEEP_TOTAL, easing: Easing.linear }),
      );
    }
    hadBoard.current = has;
  }, [result, reduced, sweep]);

  // A lit tick over rows nothing has verified would assert the filter applied.
  const verifiedShown = filtersLive && verifiedOnly;

  const safetyLine = boardSafetyLine(metric);
  const progress = useMemo(() => barProgress(rows), [rows]);
  const track = barTrackWidth(windowWidth, menuSlot, largeText);

  const controls = (
    <View style={styles.controls}>
      <View style={styles.titleRow}>
        <Text variant="headline" accessibilityRole="header">
          Ranks
        </Text>
        <VerifiedToggle
          on={verifiedShown}
          disabled={!filtersLive}
          onPress={() => setVerifiedOnly((v) => !v)}
        />
      </View>

      <MetricTabs options={METRICS} value={metric} onChange={setMetric} />

      <View style={styles.scopeRow}>
        {/* Inert on a local board — but never while a narrower scope is
            still applied, or a board that fell back offline could hold the
            screen on Friends with no way back to World. */}
        <Segments
          options={scopes}
          value={scope}
          onChange={setScope}
          disabled={!filtersLive && scope === 'global'}
        />
        <DropChip
          label={labelFor(PERIODS, period)}
          onPress={() => setSheet('period')}
          accessibilityLabel={`Time period: ${periodWords(period)}`}
          style={styles.period}
        />
      </View>

      <View style={styles.captionRow}>
        {/* What this board ranks, in words: Distance is each driver's
            longest single drive, not miles added up. */}
        <Text variant="mono" style={styles.caption} numberOfLines={2}>
          {scopeName} · {boardBasis(metric)}
        </Text>
        {/* Locked, the chip still opens the sheet: the classes and their
            driver counts are real and worth seeing, and each one is marked
            PRO there. */}
        {brackets.length > 0 ? (
          <DropChip
            label={classLabel}
            mono
            onPress={() => setSheet('bracket')}
            disabled={!filtersLive && shownBracket == null}
            pro={classesLocked}
            accessibilityLabel={bracketPillAccessibilityLabel(classLabel, access)}
            style={styles.classChip}
          />
        ) : null}
      </View>
    </View>
  );

  const heroShown = useMemo(
    () =>
      result == null
        ? null
        : heroView(
            rows,
            { metric, period, scopeName, isSample: result.isSample, verifiedShown },
            unitPref,
          ),
    [rows, result, metric, period, scopeName, verifiedShown, unitPref],
  );
  const hero = failed ? null : result == null ? (
    <BoardHero kind="loading" compact={largeText} />
  ) : heroShown ? (
    <BoardHero {...heroShown} compact={largeText} />
  ) : null;

  // Scrolls with the list: the safety line, the friends link and the hero.
  const lead = (
    <View>
      {safetyLine ? (
        <View style={styles.safety}>
          <Icon name="shield" size={16} color={color.text3} />
          <Text variant="legal" style={styles.safetyText}>
            {safetyLine}
          </Text>
        </View>
      ) : null}
      {/* The friends board is only ever as full as you make it, so the way to
          fill it belongs right here rather than buried in Settings. */}
      {scope === 'friends' ? (
        <View style={styles.friends}>
          <BoardLink
            icon="friends"
            label="Manage friends"
            onPress={() => router.push('/friends')}
          />
        </View>
      ) : null}
      {hero}
    </View>
  );

  const listHeader = largeText ? (
    <View>
      {controls}
      {lead}
    </View>
  ) : (
    lead
  );

  const extraData = useMemo(
    () => ({ menuSlot, largeText, unitPref, track, progress }),
    [menuSlot, largeText, unitPref, track, progress],
  );

  return (
    <Screen
      scroll={false}
      style={{ paddingHorizontal: 0, paddingBottom: 0, paddingTop: insets.top + space.xs }}
    >
      {largeText ? null : controls}

      {/* The list stays mounted through a reload, with the skeleton as its
          empty state, so that at large text the header can live inside it
          and scroll away rather than leaving the rows no room. It fades in
          once, as a whole: an Entrance per row replayed its animation every
          time FlashList recycled a cell into a new position. */}
      <Entrance style={styles.list}>
        <FlashList
          data={rows}
          extraData={extraData}
          keyExtractor={(r: BoardRow) => r.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }: { item: BoardRow; index: number }) => (
            <BoardRowView
              item={item}
              index={index}
              value={valueParts(item, unitPref)}
              accessibilityLabel={rowAccessibilityLabel(item, unitPref)}
              progress={progress.get(item.id) ?? 0}
              track={track}
              sweep={sweep}
              stacked={largeText}
              menuSlot={menuSlot}
              onMore={
                isModeratable(item)
                  ? () => setReportTarget({ profileId: item.profileId, username: item.username })
                  : undefined
              }
            />
          )}
          ListEmptyComponent={
            failed ? (
              <View style={styles.empty}>
                <Icon name="ranks" size={28} color={color.text3} />
                <Text variant="cardTitle" accessibilityRole="header">
                  Couldn&apos;t load the board
                </Text>
                {/* Only what is known: the board could not be built. Nothing
                    here can say why, or vouch for the drives behind it. */}
                <Text variant="callout">Something went wrong building this board.</Text>
                <Button
                  label="Try again"
                  variant="secondary"
                  arrow={false}
                  onPress={() => {
                    // Back to the skeleton while it asks again.
                    setBoard((b) => ({ ...b, failed: false }));
                    void load();
                  }}
                  style={styles.retry}
                />
              </View>
            ) : result == null ? (
              <View
                style={styles.skeleton}
                accessible
                accessibilityLabel="Loading the board"
              >
                {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <BoardRowSkeleton key={i} index={i} track={track} />
                ))}
              </View>
            ) : (
              <View style={styles.empty}>
                <Icon name="ranks" size={28} color={color.text3} />
                <Text variant="cardTitle" accessibilityRole="header">
                  No entries yet
                </Text>
                <Text variant="callout">
                  No drives match this slice. Drive, and this board fills with real entries —
                  never invented ones.
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            result != null && result.framing.length > 0 ? (
              <View style={[styles.framing, rows.length > 0 && styles.framingRule]}>
                {result.framing.map((f) => (
                  <Text key={f} variant="legal">
                    {f}
                  </Text>
                ))}
              </View>
            ) : null
          }
        />
      </Entrance>

      <OptionSheet
        visible={sheet === 'bracket'}
        title="Vehicle class"
        options={bracketOptions}
        value={shownBracket ?? ALL_CLASSES}
        onSelect={(v) => {
          // "All classes" always applies; a class applies, or on Free leads
          // to Gapped Pro. The sheet closes either way.
          const pick = pickBracket(v, access);
          if (pick.kind === 'goPro') proAfterSheet.current = true;
          else setBracket(pick.bracket);
        }}
        onClose={() => setSheet(null)}
        onHidden={() => {
          if (!proAfterSheet.current) return;
          proAfterSheet.current = false;
          goPro();
        }}
      />
      <OptionSheet
        visible={sheet === 'period'}
        title="Period"
        options={PERIODS}
        value={period}
        onSelect={setPeriod}
        onClose={() => setSheet(null)}
      />
      <ReportSheet
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onDriverHidden={(id) => setHidden((h) => hideHere(h, id, requestId.current))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingBottom: space.xs },
  titleRow: {
    minHeight: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.md,
    paddingHorizontal: EDGE,
  },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    // The plates lean past their boxes; the extra inset keeps the first
    // one's foot off the screen edge, as the mock sets it.
    paddingLeft: EDGE + space.xs,
    paddingRight: EDGE,
  },
  period: { marginLeft: 'auto' },
  captionRow: {
    minHeight: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.md,
    paddingLeft: EDGE,
    paddingRight: EDGE,
  },
  caption: { flexShrink: 1, color: color.text3 },
  classChip: { flexShrink: 1, maxWidth: '62%' },
  safety: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: EDGE,
    paddingTop: space.sm,
  },
  safetyText: { flex: 1 },
  friends: { paddingHorizontal: EDGE },
  list: { flex: 1 },
  listContent: { paddingBottom: space.xl },
  skeleton: { paddingTop: space.xs },
  empty: {
    gap: space.sm,
    paddingHorizontal: EDGE,
    paddingTop: space.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.divider,
  },
  retry: { marginTop: space.md, alignSelf: 'flex-start' },
  framing: { gap: space.xs, paddingHorizontal: EDGE, paddingTop: space.lg },
  framingRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.divider },
});
