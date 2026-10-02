import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, TextInput, View } from 'react-native';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Stat } from '@/components/Stat';
import { Text } from '@/components/Text';
import { StreakGrid } from '@/components/StreakGrid';
import { Achievement, listAchievements } from '@/state/achievements';
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
import { useDriveStore } from '@/drive/recorder';
import { DriveSummary } from '@/drive/types';
import { LocalDrive, listDrives, readFixes } from '@/drive/wal';
import { distanceForDisplay, formatDistance, formatDuration, formatSpeed, UnitPref } from '@/drive/units';
import { haptic } from '@/lib/haptics';
import { isUsernameAvailable } from '@/lib/sync';
import { isValidUsername, normaliseUsername } from '@/lib/username';
import { metres, mps, seconds } from '@/types/units';
import { useProfile } from '@/state/profile';
import { useRecords } from '@/state/records';
import { color, font, radius, space, textStyle, type } from '@/theme/tokens';

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

/**
 * Shown when the server refused the username because another driver holds it.
 *
 * Onboarding never checked, and the refusal used to be swallowed: the runs
 * went up with no name while this screen kept showing the one picked. The
 * onboarding step is behind the onboarding guard once onboarded, so the way
 * out has to live here.
 */
function UsernameTakenCard({ taken }: { taken: string | null }): React.JSX.Element {
  const setUsername = useProfile((s) => s.setUsername);
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = normaliseUsername(value);
  const valid = isValidUsername(name);

  const save = async () => {
    if (!valid || checking) return;
    setChecking(true);
    setProblem(null);
    const free = await isUsernameAvailable(name);
    setChecking(false);
    if (free !== true) {
      haptic.error();
      setProblem(
        free === false
          ? `@${name} is taken too. Try another.`
          : 'Could not check that name. Check your connection and try again.',
      );
      return;
    }
    // Clears the flag; the root layout's profile subscription pushes the new
    // name, and the server is still the judge if someone takes it first.
    setUsername(name);
  };

  return (
    <Card style={styles.takenCard}>
      <Text variant="caption" style={{ color: color.danger }}>
        USERNAME TAKEN
      </Text>
      <Text variant="body">
        {taken ? `@${taken} already belongs to another driver, ` : 'Your username is taken, '}
        so your runs appear on the boards without a name. Pick another.
      </Text>
      <View style={styles.takenRow}>
        <Text variant="bodyMedium" style={{ color: color.text3 }}>
          @
        </Text>
        <TextInput
          style={styles.takenInput}
          placeholder="username"
          placeholderTextColor={color.text2}
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setProblem(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          editable={!checking}
          accessibilityLabel="New username"
        />
      </View>
      {problem ? (
        <Text variant="caption" style={{ color: color.danger }}>
          {problem}
        </Text>
      ) : value.length > 0 && !valid ? (
        <Text variant="caption" style={{ color: color.danger }}>
          3–20 characters: lowercase letters, numbers, underscores.
        </Text>
      ) : null}
      <Button
        label={checking ? 'Checking…' : 'Use this name'}
        onPress={save}
        disabled={!valid || checking}
      />
    </Card>
  );
}

export default function YouScreen() {
  const router = useRouter();
  const { username, usernameTaken, country, vehicleMake, vehicleModel, unitPref } = useProfile();
  const { pbs, driveDays } = useRecords();
  const [drives, setDrives] = useState<FinalizedDrive[]>([]);
  // "Today" for the streak. The tab stays mounted for the life of the process
  // — often days, with background recording — so a time frozen at mount kept
  // the grid ending on the day the tab was first opened. Refreshed on focus,
  // on return to the foreground, when a drive finishes, and at midnight.
  const [now, setNow] = useState(Date.now);

  // Identity is preserved when the list is unchanged, so re-focusing the tab
  // does not re-read every drive's fixes for the manoeuvre counts below.
  const refresh = useCallback(() => {
    setNow(Date.now());
    setDrives((prev) => {
      const next = listDrives().filter(isFinalized);
      return prev.length === next.length && prev.every((d, i) => d.id === next[i].id)
        ? prev
        : next;
    });
  }, []);
  useFocusEffect(refresh);

  // Focus is not the only time the list changes. A drive that auto-ends while
  // this tab is showing — or while the phone is locked on it — finalizes
  // without any navigation, so the totals and history waited for a tab switch.
  // Subscribed rather than an effect on lastSummary: the store calls back,
  // and the update happens in the same JS runtime even in the background.
  useEffect(
    () =>
      useDriveStore.subscribe((s, prev) => {
        if (s.lastSummary !== prev.lastSummary) refresh();
      }),
    [refresh],
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  // And midnight, which none of those events marks when the app sits open on
  // this tab across it: re-armed for each new day, just past the boundary.
  // A timer suspended in the background fires late on return, which is fine —
  // the foreground refresh above has already moved the day.
  useEffect(() => {
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 1, 0);
    const t = setTimeout(() => setNow(Date.now()), Math.max(nextDay.getTime() - Date.now(), 0));
    return () => clearTimeout(t);
  }, [now]);

  // Server-granted, so they are fetched rather than derived: the app has no
  // way to award one and must not appear to.
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      listAchievements().then((a) => {
        if (live) setAchievements(a);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  const totalDistanceM = metres(drives.reduce((s, d) => s + d.summary.distanceM, 0));
  const totalDurationS = seconds(drives.reduce((s, d) => s + d.summary.durationS, 0));
  // null, not 0: with no drives there is no top speed to report.
  const topSpeedMs =
    drives.length > 0 ? mps(drives.reduce((s, d) => Math.max(s, d.summary.maxSpeedMs), 0)) : null;
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
    drives.length > 0 ? distanceForDisplay(metres(totalDistanceM / drives.length), unitPref) : null;

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

      <Text variant="headline" style={styles.identity} numberOfLines={1}>
        {username ? `@${username}` : 'Driver'}
      </Text>
      {usernameTaken ? <UsernameTakenCard taken={username} /> : null}
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
        <Stat label="Total drives" value={String(drives.length)} />
      </View>

      <Card style={styles.streakCard}>
        <StreakGrid driveDays={driveDays} now={now} />
      </Card>

      {achievements.length > 0 ? (
        <View style={styles.achievements}>
          <Text variant="caption">EARNED</Text>
          {achievements.map((a) => (
            <Card key={a.kind} style={styles.achievementCard}>
              <Text style={styles.achievementGlyph}>{a.glyph}</Text>
              <View style={styles.achievementBody}>
                <Text variant="cardTitle">{a.title}</Text>
                <Text variant="caption">{a.detail}</Text>
              </View>
            </Card>
          ))}
          <Text variant="legal">
            Achievements are granted on the server, off verified drives only — never by the app.
          </Text>
        </View>
      ) : null}

      {pbs.zeroTo60S != null ? (
        <Card style={styles.pbCard}>
          <Text variant="caption">PERSONAL BEST · 0–60 MPH</Text>
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
        <Stat
          label="Avg drive length"
          value={avgDistance ? avgDistance.value.toFixed(1) : EM_DASH}
          unit={avgDistance ? avgDistance.unit : undefined}
        />
        <Stat label="Total stops" value={EM_DASH} />
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
            // The label replaces the card's text for VoiceOver, so it carries
            // the stats too — not just the date (matches the Drive tab rows).
            accessibilityLabel={`Drive on ${new Date(d.startedAt).toLocaleString()}, ${formatDistance(d.summary.distanceM, unitPref)}, ${formatDuration(d.summary.durationS)}, top speed ${formatSpeed(d.summary.maxSpeedMs, unitPref)}`}
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
  header: { minHeight: 44, justifyContent: 'center' },
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
  takenCard: { marginTop: space.md, gap: space.sm },
  takenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  takenInput: {
    flex: 1,
    color: color.text1,
    fontFamily: font.body,
    ...textStyle(type.body),
    paddingVertical: space.sm,
  },
  grid: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  achievements: { marginTop: space.xl, gap: space.sm },
  achievementCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  achievementGlyph: { fontSize: 26, lineHeight: 32 },
  achievementBody: { flex: 1, gap: 2 },
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
  tileLabel: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12, lineHeight: 15 },
  turnCard: { marginTop: space.md, gap: space.md },
  cardLabel: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12, lineHeight: 15 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  barLeft: { backgroundColor: color.accent },
  barRight: { backgroundColor: color.rank2 },
  barLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  tileSkeleton: { flex: 1, height: 96 },
  barSkeleton: { height: 40 },
  distList: { gap: 6 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  distLabel: { minWidth: 56, color: color.text2, fontSize: 12, lineHeight: 15 },
  distTrack: {
    flex: 1,
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: color.surface3,
  },
  distFill: { backgroundColor: color.accent },
  distCount: { minWidth: 40, textAlign: 'right', color: color.text2, fontSize: 12, lineHeight: 15 },
  note: { marginTop: space.md },
  plansLink: { marginTop: space.xl, gap: space.xs },
  historyCard: { marginTop: space.md, gap: space.xs },
});
