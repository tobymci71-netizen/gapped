import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Card } from '@/components/Card';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Stat } from '@/components/Stat';
import { Text } from '@/components/Text';
import { StreakGrid } from '@/components/StreakGrid';
import {
  addBins,
  binLabel,
  binsFor,
  binTotal,
  emptyBins,
  SpeedBins,
  speedBins,
} from '@/drive/distribution';
import { aggregateManeuvers, countManeuvers, ManeuverCounts } from '@/drive/maneuvers';
import { DriveSummary } from '@/drive/types';
import { LocalDrive, listDrives, readFixes } from '@/drive/wal';
import { distanceForDisplay, formatDuration, formatSpeed, UnitPref } from '@/drive/units';
import { useProfile } from '@/state/profile';
import { useRecords } from '@/state/records';
import { color, space } from '@/theme/tokens';

/** Glyph-tile tints: palette colours at low alpha, matching the Settings screen. */
const tint = {
  accent: 'rgba(204, 255, 0, 0.16)', // color.accent
  steel: 'rgba(200, 205, 212, 0.16)', // color.rank2
  danger: 'rgba(255, 59, 48, 0.18)', // color.danger
  gold: 'rgba(240, 180, 41, 0.18)', // color.rank1
} as const;

const EM_DASH = '—';

type FinalizedDrive = LocalDrive & { summary: DriveSummary };

function isFinalized(d: LocalDrive): d is FinalizedDrive {
  return d.status === 'finalized' && d.summary != null;
}

type DriveStats = { maneuvers: ManeuverCounts; bins: SpeedBins };

/**
 * Per-drive derived stats, cached for the session. A finalized drive's fixes
 * never change, so its counts never change either — without this, opening the
 * tab re-reads and re-processes the entire history from SQLite every time the
 * list changes.
 */
const statsCache = new Map<string, DriveStats>();

/** Drives processed per tick, so a long history cannot block the JS thread. */
const STATS_CHUNK = 4;

function aggregateCached(ids: string[]): DriveStats {
  const entries = ids
    .map((id) => statsCache.get(id))
    .filter((s): s is DriveStats => s != null);
  return {
    maneuvers: aggregateManeuvers(entries.map((e) => e.maneuvers)),
    bins: entries.reduce((acc, e) => addBins(acc, e.bins), emptyBins()),
  };
}

/** One band of the speed distribution, scaled against the busiest band. */
function DistributionBar({
  index,
  count,
  peak,
  unitPref,
}: {
  index: number;
  count: number;
  peak: number;
  unitPref: UnitPref;
}): React.JSX.Element {
  return (
    <View style={styles.distRow}>
      <Text variant="caption" style={styles.distLabel}>
        {binLabel(index, unitPref)}
      </Text>
      <View style={styles.distTrack}>
        <View style={[styles.distFill, { flex: Math.max(count / peak, 0) }]} />
        <View style={{ flex: Math.max(1 - count / peak, 0) }} />
      </View>
      <Text variant="caption" style={styles.distCount}>
        {count}
      </Text>
    </View>
  );
}

function ManeuverTile({
  glyph,
  glyphColor,
  tileTint,
  value,
  label,
}: {
  glyph: string;
  glyphColor: string;
  tileTint: string;
  value: number;
  label: string;
}): React.JSX.Element {
  return (
    <Card style={styles.tileCard}>
      <View style={[styles.tile, { backgroundColor: tileTint }]}>
        <Text style={[styles.tileGlyph, { color: glyphColor }]}>{glyph}</Text>
      </View>
      <AnimatedNumber value={String(value)} size={26} />
      <Text variant="caption" style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

export default function YouScreen() {
  const router = useRouter();
  const { username, country, vehicleMake, vehicleModel, unitPref } = useProfile();
  const { pbs, driveDays } = useRecords();
  const [drives, setDrives] = useState<FinalizedDrive[]>([]);

  // Identity is preserved when the list is unchanged, so re-focusing the tab
  // does not re-read every drive's fixes for the manoeuvre counts below.
  const refresh = useCallback(() => {
    setDrives((prev) => {
      const next = listDrives().filter(isFinalized);
      return prev.length === next.length && prev.every((d, i) => d.id === next[i].id)
        ? prev
        : next;
    });
  }, []);
  useFocusEffect(refresh);

  const totalDistanceM = drives.reduce((s, d) => s + d.summary.distanceM, 0);
  const totalDurationS = drives.reduce((s, d) => s + d.summary.durationS, 0);
  // null, not 0: with no drives there is no top speed to report.
  const topSpeedMs =
    drives.length > 0 ? drives.reduce((s, d) => Math.max(s, d.summary.maxSpeedMs), 0) : null;
  const topSpeed = topSpeedMs != null ? formatSpeed(topSpeedMs, unitPref).split(' ') : null;
  const dist = distanceForDisplay(totalDistanceM, unitPref);

  // Counting manoeuvres and binning speeds means reading every drive's fixes
  // back off disk, so it runs outside render, in cached chunks, behind
  // skeletons — never as a synchronous walk of the whole history.
  const [stats, setStats] = useState<DriveStats | null>(null);
  useEffect(() => {
    const ids = drives.map((d) => d.id);
    if (ids.every((id) => statsCache.has(id))) {
      setStats(aggregateCached(ids));
      return;
    }
    setStats(null);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let i = 0;
    const step = () => {
      if (!alive) return;
      const end = Math.min(ids.length, i + STATS_CHUNK);
      for (; i < end; i++) {
        if (statsCache.has(ids[i])) continue;
        const fixes = readFixes(ids[i]);
        statsCache.set(ids[i], { maneuvers: countManeuvers(fixes), bins: speedBins(fixes) });
      }
      if (i < ids.length) {
        timer = setTimeout(step, 0);
        return;
      }
      setStats(aggregateCached(ids));
    };
    timer = setTimeout(step, 0);
    return () => {
      alive = false;
      if (timer != null) clearTimeout(timer);
    };
  }, [drives]);

  const pref = stats?.maneuvers.turnPreference ?? null;
  const distBins = stats != null ? binsFor(stats.bins, unitPref) : null;
  const distTotal = stats != null ? binTotal(stats.bins, unitPref) : 0;
  const distPeak = distBins != null ? Math.max(...distBins) : 0;

  const avgDistance =
    drives.length > 0 ? distanceForDisplay(totalDistanceM / drives.length, unitPref) : null;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="cardTitle" style={styles.headerTitle}>
          You
        </Text>
        <PressableScale
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={styles.gear}
        >
          <Text style={styles.gearGlyph}>⚙︎</Text>
        </PressableScale>
      </View>

      <Text variant="headline" style={styles.identity}>
        {username ? `@${username}` : 'Driver'}
      </Text>
      {country || vehicleMake ? (
        <Text variant="caption" style={styles.meta}>
          {[country, vehicleMake && `${vehicleMake} ${vehicleModel ?? ''}`.trim()]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}

      <View style={styles.grid}>
        <Stat label="Total distance" value={dist.value.toFixed(1)} unit={dist.unit} />
        <Stat label="Total time" value={formatDuration(totalDurationS)} />
      </View>
      <View style={styles.grid}>
        <Stat
          label="Top speed"
          value={topSpeed ? topSpeed[0] : EM_DASH}
          unit={topSpeed ? topSpeed[1] : undefined}
          accent={topSpeedMs != null && topSpeedMs > 0}
        />
        <Stat label="Drives" value={String(drives.length)} />
      </View>

      <Card style={styles.streakCard}>
        <StreakGrid driveDays={driveDays} />
      </Card>

      {pbs.zeroTo60S != null ? (
        <Card style={styles.pbCard}>
          <Text variant="caption">PERSONAL BEST · 0–60</Text>
          <Text variant="cardTitle">{pbs.zeroTo60S.toFixed(2)} s</Text>
        </Card>
      ) : null}

      <Text variant="cardTitle" style={styles.sectionTitle}>
        Manoeuvres
      </Text>
      {stats == null ? (
        <>
          <View style={styles.grid}>
            <Skeleton style={styles.tileSkeleton} />
            <Skeleton style={styles.tileSkeleton} />
          </View>
          <View style={styles.grid}>
            <Skeleton style={styles.tileSkeleton} />
            <Skeleton style={styles.tileSkeleton} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.grid}>
            <ManeuverTile
              glyph="↰"
              glyphColor={color.accent}
              tileTint={tint.accent}
              value={stats.maneuvers.leftTurns}
              label="Left turns"
            />
            <ManeuverTile
              glyph="↱"
              glyphColor={color.rank2}
              tileTint={tint.steel}
              value={stats.maneuvers.rightTurns}
              label="Right turns"
            />
          </View>
          <View style={styles.grid}>
            <ManeuverTile
              glyph="⊗"
              glyphColor={color.danger}
              tileTint={tint.danger}
              value={stats.maneuvers.hardBraking}
              label="Hard braking"
            />
            <ManeuverTile
              glyph="⇄"
              glyphColor={color.rank1}
              tileTint={tint.gold}
              value={stats.maneuvers.laneChanges}
              label="Lane changes"
            />
          </View>
        </>
      )}

      <Card style={styles.turnCard}>
        <Text variant="caption" style={styles.cardLabel}>
          TURN PREFERENCE
        </Text>
        {stats == null ? (
          <Skeleton style={styles.barSkeleton} />
        ) : pref ? (
          <>
            <View style={styles.bar}>
              <View style={[styles.barLeft, { flex: pref.leftPct }]} />
              <View style={[styles.barRight, { flex: pref.rightPct }]} />
            </View>
            <View style={styles.barLegend}>
              <Text variant="caption" style={{ color: color.accent }}>
                Left {pref.leftPct}%
              </Text>
              <Text variant="caption" style={{ color: color.rank2 }}>
                Right {pref.rightPct}%
              </Text>
            </View>
          </>
        ) : (
          <Text variant="body">
            Not enough data yet — turns are counted from recorded heading, and none of your
            drives carry enough of it.
          </Text>
        )}
      </Card>

      <Card style={styles.turnCard}>
        <Text variant="caption" style={styles.cardLabel}>
          SPEED DISTRIBUTION
        </Text>
        {stats == null ? (
          <Skeleton style={styles.barSkeleton} />
        ) : distBins != null && distTotal > 0 && distPeak > 0 ? (
          <>
            <View style={styles.distList}>
              {distBins.map((count, i) => (
                <DistributionBar
                  key={i}
                  index={i}
                  count={count}
                  peak={distPeak}
                  unitPref={unitPref}
                />
              ))}
            </View>
            <Text variant="legal">
              {distTotal} gated GPS samples, banded in {unitPref === 'imperial' ? 'mph' : 'km/h'}.
            </Text>
          </>
        ) : (
          <Text variant="body">
            Nothing to plot yet — a distribution needs recorded fixes that pass accuracy gating.
          </Text>
        )}
      </Card>

      <Text variant="cardTitle" style={styles.sectionTitle}>
        More stats
      </Text>
      <View style={styles.grid}>
        <Stat label="Total drives" value={String(drives.length)} />
        <Stat label="Total stops" value={EM_DASH} />
      </View>
      <View style={styles.grid}>
        <Stat
          label="Avg drive length"
          value={avgDistance ? avgDistance.value.toFixed(1) : EM_DASH}
          unit={avgDistance ? avgDistance.unit : undefined}
        />
        <Stat
          label="Total duration"
          value={drives.length > 0 ? formatDuration(totalDurationS) : EM_DASH}
        />
      </View>
      <Text variant="legal" style={styles.note}>
        Stops are shown as a dash because we do not measure them yet. A number here would be a
        guess, and this app does not guess.
      </Text>

      <PressableScale onPress={() => router.push('/plans')} accessibilityRole="button">
        <Card style={styles.plansLink}>
          <Text variant="bodyMedium">Free vs Pro — the whole matrix, published</Text>
          <Text variant="caption">Recording and viewing your drives is free forever.</Text>
        </Card>
      </PressableScale>

      <Text variant="cardTitle" style={styles.sectionTitle}>
        History
      </Text>
      {drives.length === 0 ? (
        <Card style={styles.historyCard}>
          <Text variant="body">
            No drives yet. Your full history lives here — free, always. Viewing your own
            recorded drives is never paywalled.
          </Text>
        </Card>
      ) : (
        drives.map((d) => (
          <PressableScale
            key={d.id}
            onPress={() => router.push(`/drive/${d.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Drive on ${new Date(d.startedAt).toLocaleString()}`}
          >
            <Card style={styles.historyCard}>
              <Text variant="bodyMedium">{new Date(d.startedAt).toLocaleString()}</Text>
              <Text variant="caption">
                {distanceForDisplay(d.summary.distanceM, unitPref).value.toFixed(1)}{' '}
                {distanceForDisplay(d.summary.distanceM, unitPref).unit} ·{' '}
                {formatDuration(d.summary.durationS)} · top{' '}
                {formatSpeed(d.summary.maxSpeedMs, unitPref)}
              </Text>
            </Card>
          </PressableScale>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { height: 44, justifyContent: 'center' },
  headerTitle: { textAlign: 'center' },
  gear: {
    position: 'absolute',
    right: -space.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearGlyph: { fontSize: 20, lineHeight: 24, color: color.text1 },
  identity: { marginTop: space.lg },
  meta: { marginTop: space.xs },
  grid: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  streakCard: { marginTop: space.xl },
  pbCard: { marginTop: space.md, gap: space.xs },
  sectionTitle: { marginTop: space.xl },
  tileCard: { flex: 1, gap: space.sm },
  tile: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlyph: { fontSize: 15, lineHeight: 20, color: color.text1, textAlign: 'center' },
  tileLabel: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12 },
  turnCard: { marginTop: space.md, gap: space.md },
  cardLabel: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  barLeft: { backgroundColor: color.accent },
  barRight: { backgroundColor: color.rank2 },
  barLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  tileSkeleton: { flex: 1, height: 96 },
  barSkeleton: { height: 40 },
  distList: { gap: 6 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  distLabel: { width: 56, color: color.text3, fontSize: 12 },
  distTrack: {
    flex: 1,
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: color.surface3,
  },
  distFill: { backgroundColor: color.accent },
  distCount: { width: 40, textAlign: 'right', color: color.text3, fontSize: 12 },
  note: { marginTop: space.md },
  plansLink: { marginTop: space.xl, gap: space.xs },
  historyCard: { marginTop: space.md, gap: space.xs },
});
