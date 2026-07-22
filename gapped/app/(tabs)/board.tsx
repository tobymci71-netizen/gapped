import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { fetchBoard, BoardResult } from '@/board/boards';
import { BoardMetric, BoardPeriod, BoardRow, BoardScope } from '@/board/types';
import { formatDistance, formatSpeed } from '@/drive/units';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/state/profile';
import { color, radius, space } from '@/theme/tokens';

const METRICS: { key: BoardMetric; label: string }[] = [
  { key: 'top_speed', label: 'Top speed' },
  { key: 'distance', label: 'Distance' },
  { key: 'trip_count', label: 'Drives' },
  { key: 'zero_to_60', label: '0–60' },
];
const SCOPES: { key: BoardScope; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'country', label: 'Country' },
  { key: 'friends', label: 'Friends' },
];
const PERIODS: { key: BoardPeriod; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All-time' },
];

function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segments}>
      {options.map((o) => (
        <PressableScale
          key={o.key}
          silent
          onPress={() => {
            haptic.selection();
            onChange(o.key);
          }}
          style={[styles.segment, value === o.key && styles.segmentActive]}
        >
          <Text
            variant="caption"
            style={{ color: value === o.key ? color.onAccent : color.text2 }}
          >
            {o.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

export default function BoardScreen() {
  const { username, unitPref } = useProfile();
  const [metric, setMetric] = useState<BoardMetric>('top_speed');
  const [scope, setScope] = useState<BoardScope>('global');
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [result, setResult] = useState<BoardResult | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    const r = await fetchBoard({ metric, scope, period, verifiedOnly }, username);
    setResult(r);
  }, [metric, scope, period, verifiedOnly, username]);

  useEffect(() => {
    load();
  }, [load]);

  const formatValue = (row: BoardRow): string => {
    switch (metric) {
      case 'top_speed':
        return formatSpeed(row.value, unitPref);
      case 'distance':
        return formatDistance(row.value, unitPref);
      case 'trip_count':
        return `${Math.round(row.value)}`;
      case 'zero_to_60':
        return `${row.value.toFixed(2)} s`;
    }
  };

  return (
    <Screen scroll={false}>
      <Text variant="headline">Board</Text>

      <Segments options={METRICS} value={metric} onChange={setMetric} />
      <View style={styles.selectorRow}>
        <Segments options={SCOPES} value={scope} onChange={setScope} />
      </View>
      <View style={styles.selectorRow}>
        <Segments options={PERIODS} value={period} onChange={setPeriod} />
        <PressableScale
          silent
          onPress={() => {
            haptic.selection();
            setVerifiedOnly((v) => !v);
          }}
          style={[styles.verifiedToggle, verifiedOnly && styles.verifiedToggleOn]}
        >
          <Text
            variant="caption"
            style={{
              color: verifiedOnly ? color.verified : color.text3,
              letterSpacing: 0.8,
              fontSize: 11,
            }}
          >
            VERIFIED
          </Text>
        </PressableScale>
      </View>

      {result?.isSample ? (
        <View style={styles.sampleBanner}>
          <Text variant="caption" style={{ color: color.onAccent }}>
            SAMPLE BOARD — record your first drive to start the real one
          </Text>
        </View>
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
                <Text variant="cardTitle">Nothing here yet</Text>
                <Text variant="body" style={{ textAlign: 'center' }}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.md,
    flexWrap: 'wrap',
  },
  selectorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  segment: {
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  segmentActive: { backgroundColor: color.accent, borderColor: color.accent },
  verifiedToggle: {
    marginTop: space.md,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  verifiedToggleOn: { borderColor: color.verified },
  sampleBanner: {
    marginTop: space.md,
    backgroundColor: color.accent,
    borderRadius: radius.card / 2,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
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
    backgroundColor: '#CCFF0014',
    borderRadius: radius.card / 2,
  },
  rowBenchmark: { opacity: 0.85 },
  rank: { width: 28, textAlign: 'center', color: color.text2 },
  rowBody: { flex: 1, gap: 1 },
  chip: {
    borderWidth: 1,
    borderColor: color.accentDim,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  chipText: { color: color.accentDim, fontSize: 9, letterSpacing: 1 },
  empty: { alignItems: 'center', gap: space.sm, paddingTop: space.xxl },
  framing: { gap: space.xs, paddingVertical: space.lg },
});
