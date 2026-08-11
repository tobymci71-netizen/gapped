import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { countryByCode } from '@/data/countries';
import { BottomSheet } from '@/components/BottomSheet';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { fetchBoard, fetchBrackets, BoardResult } from '@/board/boards';
import { BoardMetric, BoardPeriod, BoardRow, BoardScope } from '@/board/types';
import { formatDistance, formatSpeed } from '@/drive/units';
import { bracketLabel } from '@/vehicles/brackets';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/state/profile';
import { color, radius, space } from '@/theme/tokens';

/** `glyph` is the leading mark shown on the pill and beside the sheet row. */
type Option<T extends string> = { key: T; label: string; glyph?: string };

const METRICS: Option<BoardMetric>[] = [
  { key: 'top_speed', label: 'Top speed' },
  { key: 'distance', label: 'Distance' },
  { key: 'trip_count', label: 'Drives' },
  { key: 'zero_to_60', label: '0–60 mph' },
];
const PERIODS: Option<BoardPeriod>[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
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


/** Fallback glyph when the profile carries no country. */
const NO_FLAG = '🏳️';

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
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} heightFraction={0.5}>
      <View style={styles.sheetBody}>
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
              <Text
                variant="bodyMedium"
                numberOfLines={1}
                style={[styles.optionLabel, { color: o.key === value ? color.accent : color.text1 }]}
              >
                {o.label}
              </Text>
            </View>
            {o.key === value ? <Text style={styles.tick}>✓</Text> : null}
          </PressableScale>
        ))}
      </View>
    </BottomSheet>
  );
}

export default function BoardScreen() {
  const router = useRouter();
  const { username, country, unitPref } = useProfile();
  const [metric, setMetric] = useState<BoardMetric>('top_speed');
  const [scope, setScope] = useState<BoardScope>('global');
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  // null = open board across every class.
  const [bracket, setBracket] = useState<string | null>(null);
  const [brackets, setBrackets] = useState<{ key: string; drivers: number }[]>([]);
  const [result, setResult] = useState<BoardResult | null>(null);
  const [sheet, setSheet] = useState<'scope' | 'metric' | 'period' | 'bracket' | null>(null);

  const monthLabel = useMemo(() => {
    const d = new Date();
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }, []);

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
  // class of two hundred, and the label alone hides that.
  const bracketOptions: Option<string>[] = useMemo(
    () => [
      { key: 'all', label: 'All classes', glyph: '🌐' },
      ...brackets.map((b) => ({
        key: b.key,
        label: `${bracketLabel(b.key)} · ${b.drivers} driver${b.drivers === 1 ? '' : 's'}`,
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
  // A local board holds only this device's drives: scope and verification are
  // server concepts, so those controls are shown inert rather than lying. Held
  // separately from `result` so they do not flicker during a reload.
  const [filtersLive, setFiltersLive] = useState(false);
  const load = useCallback(async () => {
    const seq = ++requestId.current;
    setResult(null);
    const r = await fetchBoard({ metric, scope, period, verifiedOnly, bracket }, username, country);
    if (seq !== requestId.current) return;
    setResult(r);
    setFiltersLive(r.source === 'server');
    // `country` is a real input now that it scopes the query — without it here
    // a country change would leave the previous country's board on screen.
  }, [metric, scope, period, verifiedOnly, username, country, bracket]);

  useEffect(() => {
    load();
  }, [load]);

  // Only classes that actually contain drivers are offered — a combinatorial
  // menu of empty brackets would be mostly dead ends.
  useEffect(() => {
    let live = true;
    fetchBrackets(metric, period).then((b) => {
      if (!live) return;
      setBrackets(b);
      // A class that has emptied out (period rolled over) must not stay
      // selected, or the board silently shows nothing with no explanation.
      setBracket((cur) => (cur && !b.some((x) => x.key === cur) ? null : cur));
    });
    return () => {
      live = false;
    };
  }, [metric, period]);

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

  return (
    <Screen scroll={false}>
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
        <Pill
          glyph={scopeGlyph}
          label={labelFor(scopes, scope)}
          onPress={() => setSheet('scope')}
          disabled={!filtersLive}
        />
        <Pill glyph="⚡" label={labelFor(METRICS, metric)} onPress={() => setSheet('metric')} />
        <Pill glyph="📅" label={labelFor(PERIODS, period)} onPress={() => setSheet('period')} />
        {brackets.length > 0 ? (
          <Pill
            glyph="🏁"
            label={bracket ? bracketLabel(bracket) : 'All classes'}
            onPress={() => setSheet('bracket')}
            disabled={!filtersLive}
          />
        ) : null}
      </ScrollView>

      <View style={styles.toggleRow}>
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
          style={[
            styles.verifiedToggle,
            verifiedShown && styles.verifiedToggleOn,
            !filtersLive && styles.pillOff,
          ]}
        >
          <Text
            variant="caption"
            style={{
              color: verifiedShown ? color.verified : color.text3,
              letterSpacing: 0.8,
              fontSize: 11, lineHeight: 14,
            }}
          >
            VERIFIED
          </Text>
        </PressableScale>
      </View>

      <OptionSheet
        visible={sheet === 'bracket'}
        title="Vehicle class"
        options={bracketOptions}
        value={bracket ?? 'all'}
        onSelect={(v) => setBracket(v === 'all' ? null : v)}
        onClose={() => setSheet(null)}
      />

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

      <View style={styles.list}>
        {result == null ? (
          <View style={{ gap: space.md, paddingTop: space.md }}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} style={{ height: 56 }} />
            ))}
          </View>
        ) : (
          <FlashList
            data={result.rows}
            keyExtractor={(r: BoardRow) => r.id}
            renderItem={({ item, index }: { item: BoardRow; index: number }) => (
              <Entrance index={index}>
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
                      numberOfLines={1}
                    >
                      {item.username}
                    </Text>
                    {item.vehicle || item.note ? (
                      <Text variant="caption" numberOfLines={1}>
                        {item.vehicle ?? item.note}
                      </Text>
                    ) : null}
                  </View>
                  {item.kind === 'benchmark' ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>BENCHMARK</Text>
                    </View>
                  ) : null}
                  {item.kind === 'sample' ? (
                    <View style={[styles.chip, { borderColor: color.text3 }]}>
                      <Text style={[styles.chipText, { color: color.text3 }]}>SAMPLE</Text>
                    </View>
                  ) : null}
                  {/* A run's verification state is per-row, so it is shown per
                      row — the filter chip alone cannot say which is which. */}
                  {(item.kind === 'you' || item.kind === 'user') &&
                  item.verification === 'unverified' ? (
                    <View style={[styles.chip, { borderColor: color.unverified }]}>
                      <Text style={[styles.chipText, { color: color.unverified }]}>
                        UNVERIFIED
                      </Text>
                    </View>
                  ) : null}
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
                    {formatValue(item)}
                  </Text>
                </View>
              </Entrance>
            )}
            ListEmptyComponent={
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
            }
            ListFooterComponent={
              result.framing.length > 0 ? (
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
        )}
      </View>

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
  subtitle: { color: color.text3, marginTop: 2, letterSpacing: 0.4 },
  pills: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  pillsScroll: { flexGrow: 0, marginTop: space.lg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  pillGlyph: { fontSize: 13, lineHeight: 17 },
  // No flex here. These pills live in a horizontal scroller, so there is no
  // bounded width to take a share of: `flex: 1` made the first pill's label
  // absorb the whole viewport, so "World" filled the row and the metric,
  // period and class pills were pushed off-screen entirely — reachable only by
  // scrolling a row that gave no sign it could scroll. Sizing to content is
  // what lets all four sit side by side.
  pillLabel: { color: color.text1 },
  pillChevron: { fontSize: 11, lineHeight: 15, color: color.text3 },
  pillOff: { opacity: 0.45 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  verifiedToggle: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  verifiedToggleOn: { borderColor: color.verified },
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
  optionLabel: { flex: 1 },
  optionGlyph: { fontSize: 17, lineHeight: 22 },
  tick: { fontSize: 16, lineHeight: 20, color: color.accent },
  sampleBanner: {
    marginTop: space.md,
    backgroundColor: color.accent,
    borderRadius: radius.card / 2,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  manageFriends: { marginTop: space.md, alignSelf: 'flex-start' },
  list: { flex: 1, marginTop: space.md },
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
  rowBody: { flex: 1, gap: 1 },
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
