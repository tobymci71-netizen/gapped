import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { NumberPlate } from '@/components/brand/NumberPlate';
import { SectionHeader } from '@/components/brand/SectionHeader';
import { StreakBar } from '@/components/brand/StreakArrow';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge, useGoPro } from '@/components/ProBadge';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Stat } from '@/components/Stat';
import { Text } from '@/components/Text';
import { StreakGrid } from '@/components/StreakGrid';
import { SHOW_PRO } from '@/config/flags';
import { Achievement, type AchievementIcon, listAchievements } from '@/state/achievements';
import {
  addBins,
  binLabel,
  binsFor,
  binTotal,
  emptyBins,
  SpeedBins,
  speedBins,
} from '@/drive/distribution';
import {
  historyEmptyText,
  lockedHistoryRow,
  PLANS_LINK_NOTE,
  splitHistory,
  telemetryView,
} from '@/drive/driveAccess';
import { aggregateManeuvers, countManeuvers, ManeuverCounts } from '@/drive/maneuvers';
import { useDriveStore } from '@/drive/recorder';
import { durationFigure } from '@/drive/summary/format';
import { DriveSummary } from '@/drive/types';
import { DriveRow, LockedDrivesRow, ROW_INSET } from '@/drive/ui/DriveRows';
import { driveRowModel } from '@/drive/ui/driveTabModel';
import { routeThumb, type RouteThumb } from '@/drive/ui/routeGeometry';
import { ROUTE_TILE } from '@/drive/ui/RouteTile';
import { useVerifiedDrives } from '@/drive/ui/useVerifiedDrives';
import { LocalDrive, listDrives, readFixes } from '@/drive/wal';
import { distanceForDisplay, formatDuration, formatSpeed, UnitPref } from '@/drive/units';
import { useAccess } from '@/lib/entitlements';
import { haptic } from '@/lib/haptics';
import { isUsernameAvailable } from '@/lib/sync';
import {
  isUsernameAllowed,
  isValidUsername,
  normaliseUsername,
  USERNAME_NOT_ALLOWED,
} from '@/lib/username';
import { metres, mps, seconds } from '@/types/units';
import { useProfile } from '@/state/profile';
import { useRecords } from '@/state/records';
import { alpha, color, font, gutter, inputText, radius, slant, space, type } from '@/theme/tokens';
import { DriverHeader } from '@/you/DriverHeader';
import { YouIcon, type YouIconName } from '@/you/youIcons';

const EM_DASH = '—';

/** How far the distance plate rides up over the header's horizon (pt). */
const PLATE_OVERLAP = 34;

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

/**
 * Per-drive route tiles for the history rows, cached the same way and for the
 * same reason. The rows are the Driving tab's own (DriveRow, src/drive/ui/
 * DriveRows.tsx) and so is the geometry (routeGeometry.ts), so a drive's row
 * is the same on both tabs. null is a drive with no route to draw.
 */
const thumbCache = new Map<string, RouteThumb | null>();

/** Drives processed per tick, so a long history cannot block the JS thread. */
const STATS_CHUNK = 4;

/**
 * Reads one drive's fixes once and derives whatever is still missing from
 * them: its route tile always, its telemetry only when asked (`withStats`, off
 * while telemetry is locked, when nothing would show it). Both caches are
 * filled from the one read, so the history tiles and the telemetry never read
 * the same drive twice.
 */
function deriveFromFixes(id: string, withStats: boolean): void {
  const needsThumb = !thumbCache.has(id);
  const needsStats = withStats && !statsCache.has(id);
  if (!needsThumb && !needsStats) return;
  let fixes: ReturnType<typeof readFixes>;
  try {
    fixes = readFixes(id);
  } catch (e) {
    // A tile that cannot be read is an empty tile, not an error, as on the
    // Driving tab (useRouteThumbs). The telemetry read throws as it always
    // has: dropping a drive from the counts would undercount them silently.
    if (needsThumb) thumbCache.set(id, null);
    if (needsStats) throw e;
    return;
  }
  if (needsThumb) thumbCache.set(id, routeThumb(fixes, ROUTE_TILE));
  if (needsStats) {
    statsCache.set(id, { maneuvers: countManeuvers(fixes), bins: speedBins(fixes) });
  }
}

function aggregateCached(ids: string[]): DriveStats {
  const entries = ids
    .map((id) => statsCache.get(id))
    .filter((s): s is DriveStats => s != null);
  return {
    maneuvers: aggregateManeuvers(entries.map((e) => e.maneuvers)),
    bins: entries.reduce((acc, e) => addBins(acc, e.bins), emptyBins()),
  };
}

/**
 * One band of the speed distribution: a mono band label, the count drawn as a
 * red light streak scaled against the busiest band (StreakBar, the board's
 * bar), and the count itself. An empty band is a bare rule, not a stub of
 * light, so nothing is drawn for a count of zero.
 */
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
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));
  const unit = unitPref === 'imperial' ? 'mph' : 'km/h';
  return (
    // One element to VoiceOver per band: the label and its count, not a bare
    // range, a picture and a number read as three stops.
    <View
      style={styles.distRow}
      accessible
      accessibilityLabel={`${binLabel(index, unitPref)} ${unit}, ${count} ${count === 1 ? 'sample' : 'samples'}`}
    >
      <Text variant="mono" style={styles.distLabel}>
        {binLabel(index, unitPref)}
      </Text>
      <View style={styles.distTrack} onLayout={onLayout}>
        <View style={styles.distRule} />
        {width > 0 && count > 0 ? (
          <StreakBar width={width} progress={count / peak} height={6} />
        ) : null}
      </View>
      <Text variant="mono" style={styles.distCount}>
        {count}
      </Text>
    </View>
  );
}

/**
 * A manoeuvre count, open on the night: a stroke glyph and a mono label over
 * the rolling figure. `divider` draws the slanted rule before it, as Stat does.
 */
function ManeuverFigure({
  icon,
  value,
  label,
  divider,
}: {
  icon: YouIconName;
  value: number;
  label: string;
  divider?: boolean;
}): React.JSX.Element {
  return (
    <View
      style={[styles.figure, divider ? styles.figureDivided : null]}
      accessible
      accessibilityLabel={`${label}, ${value}`}
    >
      {divider ? <View style={styles.slantRule} /> : null}
      <View style={styles.figureLabel}>
        <YouIcon name={icon} size={18} color={color.text2} />
        {/* Two lines, not one: at the accessibility sizes "Lane changes"
            outgrows half a phone, and a truncated label is a guess. */}
        <Text variant="mono" numberOfLines={2} style={styles.figureLabelText}>
          {label}
        </Text>
      </View>
      <AnimatedNumber value={String(value)} size={type.numeral.size} weight="extrabold" />
    </View>
  );
}

/**
 * The stroke icon beside an earned achievement (src/state/achievements.ts
 * names it). The stopwatch is the You tab's own; the rest are shared.
 */
function achievementIcon(icon: AchievementIcon): { shared?: IconName; own?: YouIconName } {
  switch (icon) {
    case 'verified':
      return { shared: 'verified' };
    case 'stopwatch':
      return { own: 'stopwatch' };
    default:
      return { shared: 'check' };
  }
}

/**
 * Shown when the server refused the username: another driver holds it, or it
 * failed the server's name filter, which sync treats the same way (one flag,
 * `usernameTaken`), so the words cover both and blame no one.
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
    // The availability check only asks whether someone holds the name. One
    // the server's filter refuses would be saved here, pushed, and refused
    // again, bringing this card straight back; the short mirror of that
    // filter (src/lib/username.ts) stops the commonest ones first.
    if (!isUsernameAllowed(name)) {
      haptic.error();
      setProblem(USERNAME_NOT_ALLOWED);
      return;
    }
    setChecking(true);
    setProblem(null);
    const free = await isUsernameAvailable(name);
    setChecking(false);
    if (free !== true) {
      haptic.error();
      setProblem(
        free === false
          ? `@${name} is taken. Try another.`
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
      <Text variant="mono" style={{ color: color.danger }}>
        Username unavailable
      </Text>
      <Text variant="callout">
        {taken ? `@${taken} can't be used` : "Your username can't be used"} (it is taken or not
        allowed), so your runs appear on the boards without a name. Pick another.
      </Text>
      <View style={styles.takenRow}>
        <Text variant="mono" style={styles.takenAt}>
          @
        </Text>
        <TextInput
          selectionColor={color.text1}
          style={styles.takenInput}
          placeholder="username"
          placeholderTextColor={color.text3}
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
        arrow={false}
      />
    </Card>
  );
}

export default function YouScreen() {
  const router = useRouter();
  const goPro = useGoPro();
  // Unrestricted while PRO_LIMITS_ENFORCED is off, and then every drive opens.
  const access = useAccess();
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

  // Manoeuvres, turn preference and speed distribution are Pro telemetry
  // (src/drive/driveAccess.ts). Open on Pro and whenever limits are not
  // enforced, which is every TestFlight build: then nothing here changes.
  const telemetry = telemetryView(access);
  const telemetryLocked = telemetry.locked;

  // Counting manoeuvres and binning speeds means reading every drive's fixes
  // back off disk, so it runs outside render, in cached chunks, behind
  // skeletons — never as a synchronous walk of the whole history. Locked,
  // nothing shows them, so no telemetry is derived (the history's route
  // tiles, below, still read the open drives).
  const [stats, setStats] = useState<DriveStats | null>(null);
  useEffect(() => {
    if (telemetryLocked) return;
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
      for (; i < end; i++) deriveFromFixes(ids[i], true);
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
  }, [drives, telemetryLocked]);

  const pref = stats?.maneuvers.turnPreference ?? null;
  const distBins = stats != null ? binsFor(stats.bins, unitPref) : null;
  const distTotal = stats != null ? binTotal(stats.bins, unitPref) : 0;
  const distPeak = distBins != null ? Math.max(...distBins) : 0;

  const avgDistance =
    drives.length > 0 ? distanceForDisplay(metres(totalDistanceM / drives.length), unitPref) : null;
  // The longest single drive, from the same summaries as the totals. It took
  // the place of "Total stops", which showed a dash because stops are not
  // measured: a tile for a number the app does not have.
  const longest =
    drives.length > 0
      ? distanceForDisplay(
          metres(drives.reduce((m, d) => Math.max(m, d.summary.distanceM), 0)),
          unitPref,
        )
      : null;

  // Only the list is split. Every total above is summed over all drives,
  // locked ones included: they are the person's own numbers, and top speed
  // is a Free row of the matrix. `now` moves on focus and at midnight, so a
  // drive crossing Free's window locks on the next refresh, not mid-scroll.
  const { isPro, enforced } = access;
  const history = useMemo(
    () => splitHistory(drives, now, { isPro, enforced }),
    [drives, now, isPro, enforced],
  );
  const lockedRow = lockedHistoryRow(history.locked);

  // Route tiles for the open rows, read in the same cached chunks as the
  // telemetry (and from the same read, when that is open too). Keyed on the
  // ids, so a refresh that changes nothing reads nothing.
  const openKey = history.open.map((d) => d.id).join(',');
  const openIds = useMemo(() => (openKey ? openKey.split(',') : []), [openKey]);
  // Not during a drive, as on the Driving tab (useRouteThumbs): the recorder
  // appends fixes on this same thread, and a tile is not worth competing
  // with it. Rows show their empty tile until the drive ends.
  const recording = useDriveStore((s) => s.engineState === 'recording');
  const [, setThumbsRead] = useState(0);
  useEffect(() => {
    if (recording) return;
    const missing = openIds.filter((id) => !thumbCache.has(id));
    if (missing.length === 0) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let i = 0;
    const step = () => {
      if (!alive) return;
      const end = Math.min(missing.length, i + STATS_CHUNK);
      for (; i < end; i++) deriveFromFixes(missing[i], !telemetryLocked);
      setThumbsRead((n) => n + 1);
      if (i < missing.length) timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 0);
    return () => {
      alive = false;
      if (timer != null) clearTimeout(timer);
    };
  }, [openIds, telemetryLocked, recording]);

  // The server's verdict per drive, the same lookup the Driving tab's rows
  // use, so a drive ticked there is ticked here. Only `verified` draws the
  // tick; offline, signed out or not yet asked, nothing is claimed. Not asked
  // during a drive, as on the Driving tab.
  const verified = useVerifiedDrives(openIds, !recording);
  // Worked out when the list, the units or a verdict change, with one stable
  // opener per row, so the memoised rows (DriveRow) skip the renders each
  // tile chunk, focus and achievements load causes, as on the Driving tab.
  const rowModels = useMemo(
    () => history.open.map((d) => driveRowModel(d, unitPref, verified.has(d.id))),
    [history, unitPref, verified],
  );
  const rowOpeners = useMemo(
    () =>
      history.open.map(
        (d) => () => router.push({ pathname: '/drive/[id]', params: { id: d.id, from: 'you' } }),
      ),
    [history, router],
  );

  return (
    <Screen backdrop="plain">
      <DriverHeader
        username={username}
        country={country}
        vehicleMake={vehicleMake}
        vehicleModel={vehicleModel}
        onSettings={() => router.push('/settings')}
        footRoom={usernameTaken ? 0 : PLATE_OVERLAP}
      />
      {usernameTaken ? <UsernameTakenCard taken={username} /> : null}

      {/* The totals: distance on the plate, the rest in one ruled line. */}
      <NumberPlate
        label="Total distance"
        value={dist.value.toFixed(1)}
        unit={dist.unit}
        // The unit in words, as the history rows say it: "62.6 miles", not "mi".
        accessibilityLabel={`Total distance, ${dist.value.toFixed(1)} ${dist.unit === 'mi' ? 'miles' : 'kilometres'}`}
        style={usernameTaken ? styles.plateAfterCard : styles.plate}
      />
      <View style={styles.band}>
        <Stat
          label="Total time"
          value={formatDuration(totalDurationS)}
          // "2 hours 13 minutes", not "2 h 13 m".
          spoken={totalDurationS >= 60 ? durationFigure(totalDurationS).spoken : undefined}
        />
        <Stat
          label="Top speed"
          value={topSpeed ? topSpeed[0] : EM_DASH}
          unit={topSpeed ? topSpeed[1] : undefined}
          divider
        />
        <Stat label="Total drives" value={String(drives.length)} divider />
      </View>

      <View style={styles.section}>
        <StreakGrid driveDays={driveDays} now={now} />
      </View>

      {achievements.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Earned" />
          {achievements.map((a) => {
            const glyph = achievementIcon(a.icon);
            return (
              <View
                key={a.kind}
                style={styles.achievement}
                accessible
                accessibilityLabel={`${a.title}. ${a.detail}`}
              >
                <View style={styles.medal}>
                  <View style={styles.medalPlate} />
                  {glyph.own ? (
                    <YouIcon name={glyph.own} size={20} color={color.text1} />
                  ) : (
                    <Icon name={glyph.shared ?? 'check'} size={20} color={color.text1} />
                  )}
                </View>
                <View style={styles.achievementBody}>
                  <Text variant="bodySemibold">{a.title}</Text>
                  <Text variant="caption">{a.detail}</Text>
                </View>
              </View>
            );
          })}
          <Text variant="legal" style={styles.sectionNote}>
            Achievements are granted on the server, off verified drives only — never by the app.
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Manoeuvres" />
        {telemetry.locked ? (
          // One card for all three: the tiles, the turn bar and the bands are
          // one Pro row of the matrix, and three locked cards would say it
          // three times. The section title stays, so nothing silently goes.
          <PressableScale
            onPress={goPro}
            accessibilityRole="button"
            accessibilityLabel={telemetry.accessibilityLabel}
          >
            <Card style={styles.lockedCard}>
              <View style={styles.lockedTitleRow}>
                <Icon name="lock" size={18} color={color.text3} />
                <Text variant="bodySemibold">{telemetry.title}</Text>
                {/* Wrapped so the chip centres on the title instead of pinning to the top. */}
                <View>
                  <ProBadge />
                </View>
              </View>
              <Text variant="caption">{telemetry.detail}</Text>
            </Card>
          </PressableScale>
        ) : (
          <>
            {stats == null ? (
              <View style={styles.figures}>
                <View style={styles.figureRow}>
                  <Skeleton style={styles.figureSkeleton} />
                  <Skeleton style={styles.figureSkeleton} />
                </View>
                <View style={styles.figureRow}>
                  <Skeleton style={styles.figureSkeleton} />
                  <Skeleton style={styles.figureSkeleton} />
                </View>
              </View>
            ) : (
              <View style={styles.figures}>
                <View style={styles.figureRow}>
                  <ManeuverFigure
                    icon="turnLeft"
                    value={stats.maneuvers.leftTurns}
                    label="Left turns"
                  />
                  <ManeuverFigure
                    icon="turnRight"
                    value={stats.maneuvers.rightTurns}
                    label="Right turns"
                    divider
                  />
                </View>
                <View style={styles.figureRule} />
                <View style={styles.figureRow}>
                  <ManeuverFigure
                    icon="hardBrake"
                    value={stats.maneuvers.hardBraking}
                    label="Hard braking"
                  />
                  <ManeuverFigure
                    icon="laneChange"
                    value={stats.maneuvers.laneChanges}
                    label="Lane changes"
                    divider
                  />
                </View>
              </View>
            )}

            <View style={styles.subsection}>
              <Text variant="mono" style={styles.subTitle} accessibilityRole="header">
                Turn preference
              </Text>
              {stats == null ? (
                <Skeleton style={styles.barSkeleton} />
              ) : pref ? (
                // One statement to VoiceOver: the bar alone says nothing.
                <View
                  style={styles.turnBlock}
                  accessible
                  accessibilityLabel={`Left ${pref.leftPct}%, right ${pref.rightPct}%`}
                >
                  <View style={styles.turnBar}>
                    <View style={[styles.turnLeft, { flex: pref.leftPct }]} />
                    <View style={[styles.turnRight, { flex: pref.rightPct }]} />
                  </View>
                  <View style={styles.turnLegend}>
                    <Text variant="mono" style={{ color: color.text1 }}>
                      Left {pref.leftPct}%
                    </Text>
                    <Text variant="mono" style={{ color: color.text2 }}>
                      Right {pref.rightPct}%
                    </Text>
                  </View>
                </View>
              ) : (
                <Text variant="callout">
                  Not enough data yet — turns are counted from recorded heading, and none of your
                  drives carry enough of it.
                </Text>
              )}
            </View>

            <View style={styles.subsection}>
              <Text variant="mono" style={styles.subTitle} accessibilityRole="header">
                Speed distribution
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
                <Text variant="callout">
                  Nothing to plot yet — a distribution needs recorded fixes that pass accuracy
                  gating.
                </Text>
              )}
            </View>
          </>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="More stats" />
        <View style={styles.band}>
          <Stat
            label="Avg drive length"
            value={avgDistance ? avgDistance.value.toFixed(1) : EM_DASH}
            unit={avgDistance ? avgDistance.unit : undefined}
          />
          <Stat
            label="Longest drive"
            value={longest ? longest.value.toFixed(1) : EM_DASH}
            unit={longest ? longest.unit : undefined}
            divider
          />
          {pbs.zeroTo60S != null ? (
            <Stat label="Best 0–60 mph" value={pbs.zeroTo60S.toFixed(2)} unit="s" divider />
          ) : null}
        </View>
      </View>

      {/*
        Only while Pro is on sale (SHOW_PRO): a link to a plan comparison
        with nothing to buy is a reference to a paid tier App Review rejects,
        and /plans redirects back here then anyway.
      */}
      {SHOW_PRO ? (
        <PressableScale
          onPress={() => router.push('/plans')}
          accessibilityRole="button"
          style={styles.plansLink}
        >
          <Icon name="document" size={22} color={color.text2} />
          <View style={styles.plansBody}>
            <Text variant="bodySemibold">Free vs Pro — the whole matrix, published</Text>
            <Text variant="caption">{PLANS_LINK_NOTE.text}</Text>
          </View>
          <Icon name="chevronRight" size={18} color={color.text3} strokeWidth={2} />
        </PressableScale>
      ) : null}

      {/*
        The Driving tab's own rows (DriveRow), so the two lists cannot drift:
        the same route tile, human title, mono line, figures, server tick and
        large-text stacking.
      */}
      <View style={[styles.section, styles.bleed]}>
        <SectionHeader title="History" style={styles.historyHeader} />
        {drives.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Text variant="callout">{historyEmptyText(access)}</Text>
          </View>
        ) : (
          history.open.map((d, i) => (
            <DriveRow
              key={d.id}
              first={i === 0}
              model={rowModels[i]}
              thumb={thumbCache.get(d.id)}
              verified={verified.has(d.id)}
              onPress={rowOpeners[i]}
            />
          ))
        )}
        {/*
          Drives past Free's window, as one row at the foot of the list: it is
          newest first, so they all sort below the last open one. Why one row
          and not one per drive: lockedHistoryRow, src/drive/driveAccess.ts.
        */}
        {lockedRow ? (
          <LockedDrivesRow row={lockedRow} onPress={goPro} first={history.open.length === 0} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The plate rides up over the header's horizon, like the drive summary's
  // over its map; after the username card it sits in the flow instead.
  plate: { marginTop: -PLATE_OVERLAP },
  plateAfterCard: { marginTop: space.xl },
  band: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color.divider,
  },
  section: { marginTop: space.xxl },
  sectionNote: { marginTop: space.md },
  bleed: { marginHorizontal: -gutter },

  takenCard: { marginTop: space.lg, gap: space.sm, borderColor: alpha(color.danger, 0.4) },
  takenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  takenAt: { color: color.text3 },
  takenInput: {
    flex: 1,
    color: color.text1,
    fontFamily: font.body,
    ...inputText(type.body),
    paddingVertical: space.sm,
  },

  achievement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color.divider,
  },
  // A white-outlined slanted plate, the "Verified" tag's shape, holding the icon upright.
  medal: { width: 44, height: 34, alignItems: 'center', justifyContent: 'center' },
  medalPlate: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.xs,
    transform: slant.transform,
    backgroundColor: alpha(color.text1, 0.07),
    borderWidth: 1,
    borderColor: alpha(color.text1, 0.22),
  },
  achievementBody: { flex: 1, gap: 2 },

  lockedCard: { gap: space.xs },
  // Wraps at large text sizes rather than pushing the chip off the card.
  lockedTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },

  figures: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color.divider,
  },
  figureRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  figureRule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: color.divider },
  figure: { flex: 1, gap: space.xs },
  figureDivided: { paddingLeft: 18 },
  slantRule: {
    position: 'absolute',
    left: 0,
    top: 2,
    bottom: 2,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: color.hairline,
    transform: slant.transform,
  },
  figureLabel: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  figureLabelText: { flexShrink: 1 },
  figureSkeleton: { flex: 1, height: 56 },

  subsection: { marginTop: space.xl, gap: space.md },
  subTitle: { color: color.text2 },
  barSkeleton: { height: 40 },
  // The subsection's own gap, kept inside the grouped element.
  turnBlock: { gap: space.md },
  turnBar: { flexDirection: 'row', height: 8, gap: 4, paddingHorizontal: 2 },
  turnLeft: { backgroundColor: color.text1, borderRadius: radius.xs, transform: slant.transform },
  turnRight: {
    backgroundColor: color.outline,
    borderRadius: radius.xs,
    transform: slant.transform,
  },
  turnLegend: { flexDirection: 'row', justifyContent: 'space-between' },

  distList: { gap: space.sm },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 18 },
  distLabel: { minWidth: 56, color: color.text2 },
  distTrack: { flex: 1, height: 6, justifyContent: 'center' },
  distRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: color.divider,
  },
  distCount: { minWidth: 40, textAlign: 'right', color: color.text2 },

  plansLink: {
    marginTop: space.xxl,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color.divider,
  },
  plansBody: { flex: 1, gap: 2 },

  historyHeader: { paddingHorizontal: ROW_INSET },
  // Ruled as the Driving tab's rows are: a hairline above and below.
  historyEmpty: {
    paddingHorizontal: ROW_INSET,
    paddingVertical: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.divider,
  },
});
