import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { GappedMark } from '@/components/brand/GappedMark';
import { Button } from '@/components/Button';
import { CarSilhouette } from '@/components/CarSilhouette';
import { DriveMap, DriveMapHandle } from '@/components/DriveMap';
import { Entrance } from '@/components/Entrance';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { useGoPro } from '@/components/ProBadge';
import { Speedometer } from '@/components/Speedometer';
import { Text } from '@/components/Text';
import { INTERNAL_TOOLS } from '@/config/flags';
import { lockedHistoryRow, splitHistory } from '@/drive/driveAccess';
import { sanitiseHeading } from '@/drive/heading';
import { HUD_MAX_FONT_SCALE, hudDialSize } from '@/drive/hud';
import { useDriveStore } from '@/drive/recorder';
import { DriveSummary } from '@/drive/types';
import {
  distanceForDisplay,
  formatDuration,
  speedForDisplay,
  UnitPref,
} from '@/drive/units';
import { LocalDrive, listDrives, readFixesSince } from '@/drive/wal';
import {
  DriveRow,
  LockedDrivesRow,
  NoDrivesYet,
  RecentDrivesHeader,
  ROW_INSET,
} from '@/drive/ui/DriveRows';
import { driveRowModel, idleStatus, vehicleTitle } from '@/drive/ui/driveTabModel';
import { ART_WIDTH, STAGE_HEIGHT, STAGE_TO_NIGHT } from '@/drive/ui/heroArt';
import { HeroGrain, HeroScene } from '@/drive/ui/HeroScene';
import { MAP_CONTROL, MapControls, RecordingBadge } from '@/drive/ui/RecordingChrome';
import { StatusLine } from '@/drive/ui/StatusLine';
import { useRouteThumbs } from '@/drive/ui/useRouteThumbs';
import { useVerifiedDrives } from '@/drive/ui/useVerifiedDrives';
import { useAccess } from '@/lib/entitlements';
import { haptic } from '@/lib/haptics';
import { seconds, raw } from '@/types/units';
import { useProfile } from '@/state/profile';
import { useRecords } from '@/state/records';
import {
  alpha,
  color,
  font,
  gutter,
  italicOverhang,
  radius,
  slant,
  space,
  textStyle,
  type,
} from '@/theme/tokens';
import { BodyType, inferBodyType } from '@/vehicles/bodyType';

/**
 * The Driving tab, Nightrun-Drive. Two faces:
 *
 * Parked: a hero scene — the car (or bike) from behind under a street light —
 * with the recorder's real status over the car's name, Start drive, and the
 * recent drives, each a route drawn from its own fixes under a title worked
 * out from when it happened.
 *
 * Recording: the map is the screen. The route runs on it as a red light trail
 * to a white puck, with the speed display and the controls floating over it
 * and the drives panel (End drive) below.
 *
 * The recorder store carries speed and distance but no coordinates, so during a
 * drive the live position and the route come from the WAL — the same rows the
 * recorder has just written. Each poll reads only the rows appended since the
 * last one: re-reading the whole drive would grow linearly with drive length on
 * the very JS thread that is appending fixes.
 *
 * Parked, there is nothing in the WAL, so the position comes from expo-location
 * directly: it is what "GPS ready" means, and where the map opens when a drive
 * starts. It is a measured position either way; we never guess one.
 */

const POSITION_POLL_MS = 2000;
/** A parked position older than this does not make the status say "GPS ready". */
const FRESH_FIX_MS = 2 * 60_000;
/** Display cap for the live polyline. Beyond it the route is decimated —
 *  the map cannot resolve more, and the whole array crosses the bridge. */
const MAX_ROUTE_POINTS = 1500;
const AVATAR = 44;
/** The panel's top corners (the bottom sheet's radius); the map runs under them. */
const PANEL_RADIUS = radius.card * 2;
/** Drives listed under the hero before "All drives" (the mock's three). */
const RECENT_LIMIT = 3;
const DISCARDED_NOTE = "That drive wasn't saved — no usable GPS fix was recorded.";
/**
 * Location is allowed only while Gapped is open, so the screen locking ends
 * the drive's fixes (recorder.ts, BackgroundPermission).
 */
const ALWAYS_NOTE = 'Set Location to Always so drives keep recording with the screen off.';
/**
 * The one line beside Start drive, read before every drive: the phone is
 * dealt with parked, and left alone on the move.
 */
const SET_OFF_LINE = 'Set up before you set off. Never handle your phone while driving.';

type FinalizedDrive = LocalDrive & { summary: DriveSummary };

function isFinalized(d: LocalDrive): d is FinalizedDrive {
  return d.status === 'finalized' && d.summary != null;
}

type Coord = { lat: number; lon: number };

type Live = {
  position: { lat: number; lon: number; heading: number | null } | null;
  route: Coord[];
};

const NO_LIVE: Live = { position: null, route: [] };

/**
 * Decimating append buffer for the live route. Points are kept one in
 * `stride`; when the buffer outgrows the cap it is halved and the stride
 * doubled, so cost per fix stays flat however long the drive runs.
 */
type RouteBuffer = { points: Coord[]; stride: number; seen: number; lastSeq: number };

const emptyBuffer = (): RouteBuffer => ({ points: [], stride: 1, seen: 0, lastSeq: -1 });

export default function DriveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const { unitPref, vehicleKind, vehicleMake, vehicleModel, debugHud } = useProfile();
  // Only what this screen renders. Without a selector every store write
  // re-rendered the map and the whole drive list — each IMU sample (1 Hz
  // parked, 10 Hz under hard acceleration) and each fix, on every tab, since
  // tabs stay mounted. Speed, distance and the IMU readout are read by the
  // small components that show them.
  const {
    engineState,
    driveId,
    lastSummary,
    lastDiscardedAt,
    permission,
    canAskAgain,
    precise,
    backgroundPermission,
    requestPermissions,
    startDrive,
    stopDrive,
  } = useDriveStore(
    useShallow((s) => ({
      engineState: s.engineState,
      driveId: s.driveId,
      lastSummary: s.lastSummary,
      lastDiscardedAt: s.lastDiscardedAt,
      permission: s.permission,
      canAskAgain: s.canAskAgain,
      precise: s.precise,
      backgroundPermission: s.backgroundPermission,
      requestPermissions: s.requestPermissions,
      startDrive: s.startDrive,
      stopDrive: s.stopDrive,
    })),
  );
  const recordDrive = useRecords((s) => s.recordDrive);

  const recording = engineState === 'recording';
  const mapRef = useRef<DriveMapHandle>(null);
  const [hudVisible, setHudVisible] = useState(true);
  const [live, setLive] = useState<Live>(NO_LIVE);
  // A recent position has come back from the location provider: what the
  // status line's "GPS ready" means (not merely any position, see below).
  const [gpsReady, setGpsReady] = useState(false);
  // When that position was taken, and a counter that asks for a new one: back
  // on the tab or in the app after a while, the old fix is history.
  const freshFixAt = useRef<number | null>(null);
  const [locateRequest, setLocateRequest] = useState(0);
  const [drives, setDrives] = useState<FinalizedDrive[]>([]);
  // When the list was last read: Free's history window is measured from it,
  // so a drive crossing the window locks on the next refresh, not mid-scroll.
  const [listedAt, setListedAt] = useState(Date.now);
  // Unrestricted while PRO_LIMITS_ENFORCED is off, and then every drive opens.
  const access = useAccess();
  const goPro = useGoPro();
  const [sceneHeight, setSceneHeight] = useState(0);
  const [allDrives, setAllDrives] = useState(false);
  // The hero's measured box and where its stage starts: the scene is drawn
  // to fit them, so it waits for both.
  const [heroBox, setHeroBox] = useState<{ width: number; height: number } | null>(null);
  const [stageTop, setStageTop] = useState<number | null>(null);
  // Scrolled down to the drives, the hero's loops hold still: nobody is
  // watching the rain.
  const [heroInView, setHeroInView] = useState(true);
  // A drive swaps the parked scroll for the map, and its end mounts a fresh
  // one at the top: the hero is in view again, wherever the old scroll was.
  // (Adjusted while rendering, as React suggests for state that follows a
  // prop, rather than one stale paused frame later from an effect.)
  const [heroForRecording, setHeroForRecording] = useState(recording);
  if (heroForRecording !== recording) {
    setHeroForRecording(recording);
    setHeroInView(true);
  }

  const bodyType: BodyType | null = useMemo(
    () =>
      vehicleMake && vehicleModel
        ? inferBodyType(vehicleKind ?? 'car', vehicleMake, vehicleModel)
        : null,
    [vehicleKind, vehicleMake, vehicleModel],
  );

  // Record PBs + streak day when a drive finalizes; PB haptic if beaten.
  const lastRecorded = useRef<number | null>(null);
  useEffect(() => {
    if (lastSummary && lastSummary.endedAt !== lastRecorded.current) {
      lastRecorded.current = lastSummary.endedAt;
      const imps = recordDrive(lastSummary);
      if (imps.length > 0) haptic.personalBest();
    }
  }, [lastSummary, recordDrive]);

  // The note appears under a button that has just swapped from End to Start,
  // with no new row to explain it; VoiceOver would otherwise never reach it.
  useEffect(() => {
    if (lastDiscardedAt != null) AccessibilityInfo.announceForAccessibility(DISCARDED_NOTE);
  }, [lastDiscardedAt]);

  // Identity is preserved when the list is unchanged, so re-focusing the tab
  // does not replay the row entrance animations.
  const refreshDrives = useCallback(() => {
    setListedAt(Date.now());
    setDrives((prev) => {
      const next = listDrives().filter(isFinalized);
      return prev.length === next.length && prev.every((d, i) => d.id === next[i].id)
        ? prev
        : next;
    });
  }, []);

  useFocusEffect(refreshDrives);
  useEffect(() => {
    refreshDrives();
  }, [refreshDrives, lastSummary]);

  // Live position + route while recording, read incrementally from the WAL.
  const routeBuf = useRef<RouteBuffer>(emptyBuffer());
  useEffect(() => {
    if (!recording || driveId == null) return;
    routeBuf.current = emptyBuffer();
    const read = () => {
      const buf = routeBuf.current;
      const { fixes, lastSeq } = readFixesSince(driveId, buf.lastSeq);
      // Parked: no new rows, so no new state — the camera must not keep
      // re-issuing the same animateCamera at the same coordinates.
      if (fixes.length === 0) return;
      buf.lastSeq = lastSeq;
      for (const f of fixes) {
        if (buf.seen % buf.stride === 0) buf.points.push({ lat: f.lat, lon: f.lon });
        buf.seen++;
      }
      if (buf.points.length > MAX_ROUTE_POINTS) {
        buf.points = buf.points.filter((_, i) => i % 2 === 0);
        buf.stride *= 2;
      }
      const last = fixes[fixes.length - 1];
      setLive({
        position: { lat: last.lat, lon: last.lon, heading: sanitiseHeading(last.heading) },
        route: buf.points.slice(),
      });
    };
    read();
    const id = setInterval(read, POSITION_POLL_MS);
    return () => clearInterval(id);
  }, [recording, driveId]);

  // Parked: the WAL holds nothing, so the position comes from the location
  // provider — "GPS ready" in the status line, and where the map opens when
  // a drive starts. When it does, `following` frames the driver from there.
  useEffect(() => {
    if (recording) return;
    if (permission !== 'granted') {
      setLive(NO_LIVE);
      freshFixAt.current = null;
      setGpsReady(false);
      return;
    }
    // The finished drive's polyline belongs to its detail screen, not here.
    setLive((prev) => (prev.route.length > 0 ? { position: prev.position, route: [] } : prev));
    let alive = true;
    const apply = (loc: Location.LocationObject | null) => {
      if (!alive || !loc) return;
      setLive({
        position: {
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          heading: sanitiseHeading(loc.coords.heading),
        },
        route: [],
      });
      // The last known position can be hours old (a phone that last saw the
      // sky this morning): fine as where the map opens, not as "GPS ready".
      if (Date.now() - loc.timestamp < FRESH_FIX_MS) {
        freshFixAt.current = loc.timestamp;
        setGpsReady(true);
      }
    };
    // Last known first for an instant position, then the real fix when it lands.
    (async () => {
      apply(await Location.getLastKnownPositionAsync().catch(() => null));
      apply(
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null),
      );
    })();
    return () => {
      alive = false;
    };
  }, [recording, permission, locateRequest]);

  // "GPS ready" holds only while its fix is recent. The effect above runs on
  // a drive's end or a permission change, so without this a fix from this
  // morning still said "GPS ready" when the app came back to the front in
  // the evening. Back on the tab, or back in the app, a stale fix stands
  // down to "Finding GPS" and a new one is asked for.
  useFocusEffect(
    useCallback(() => {
      const recheck = () => {
        const at = freshFixAt.current;
        if (at == null || Date.now() - at < FRESH_FIX_MS) return;
        freshFixAt.current = null;
        setGpsReady(false);
        setLocateRequest((n) => n + 1);
      };
      recheck();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') recheck();
      });
      return () => sub.remove();
    }, []),
  );

  const panelHeight = Math.max(300, Math.round(height * 0.46));
  const hudTop = insets.top + space.md + MAP_CONTROL + space.md;
  // The dial gives up height so the live line under it clears the panel.
  const hudSize = hudDialSize({ sceneHeight, panelHeight, hudTop, fontScale });

  // Free opens the last FREE_LIMITS.historyDays of drives; older ones are
  // kept and stand as one Pro row. With enforcement off, `open` is every drive.
  const { isPro, enforced } = access;
  const history = useMemo(
    () => splitHistory(drives, listedAt, { isPro, enforced }),
    [drives, listedAt, isPro, enforced],
  );
  const lockedRow = lockedHistoryRow(history.locked);
  // Parked, the few most recent drives, the rest a tap away in place. During
  // a drive the panel scrolls through all of them, as it always has.
  const overflow = history.open.length > RECENT_LIMIT;
  const folded = !recording && !allDrives && overflow;
  const shown = useMemo(
    () => (folded ? history.open.slice(0, RECENT_LIMIT) : history.open),
    [folded, history],
  );
  // The Pro row stands for drives older than every open one, so it belongs
  // at the foot of the whole list, not under a folded one.
  const showLocked = lockedRow != null && shown.length === history.open.length;

  const shownIds = useMemo(() => shown.map((d) => d.id), [shown]);
  const thumbFor = useRouteThumbs(shownIds, !recording);
  const verified = useVerifiedDrives(shownIds, !recording);
  // Worked out when the list, the units or a verdict change, not on every
  // render: during a drive this screen re-renders on each position poll, the
  // panel lists every drive, and each title is several Intl formatters on the
  // same JS thread the recorder appends fixes on.
  const rowModels = useMemo(
    () => shown.map((d) => driveRowModel(d, unitPref, verified.has(d.id))),
    [shown, unitPref, verified],
  );
  // One stable opener per row, so the memoised rows can skip those renders.
  const rowOpeners = useMemo(
    () => shown.map((d) => () => router.push(`/drive/${d.id}`)),
    [shown, router],
  );

  const enableLocation = async () => {
    // Every other rejection path in the app says so.
    if (!(await requestPermissions().catch(() => false))) haptic.error();
  };
  const openSettings = () => {
    Linking.openSettings().catch(() => undefined);
  };

  const status = idleStatus({ engineState, permission, precise, hasFix: gpsReady });
  const title = vehicleTitle({ kind: vehicleKind, make: vehicleMake, model: vehicleModel });
  const artScale = width / ART_WIDTH;
  const stageHeight = Math.round(STAGE_HEIGHT * artScale);
  // Tall enough that the scene has faded to night before the hero ends,
  // whatever the action under the car is.
  const heroMinHeight =
    stageTop != null ? Math.ceil(stageTop + STAGE_TO_NIGHT * artScale) : undefined;

  // What the person can do now, by state. Rendered in the panel while
  // recording, under the car while parked.
  const action = recording ? (
    // First, whatever else is true: a drive can only be ended from here,
    // and permission can now change underneath one.
    <Button label="End drive" variant="secondary" onPress={stopDrive} />
  ) : permission !== 'granted' && !canAskAgain ? (
    // Once denied, the OS will not show its prompt again, so "Enable
    // location" would be permanently inert. Only Settings can fix it.
    <>
      <Button label="Open Settings" onPress={openSettings} />
      <ActionNote>
        Location is off for Gapped, so drives can&apos;t be recorded. Allow it in Settings.
      </ActionNote>
    </>
  ) : permission !== 'granted' ? (
    <Button label="Enable location" onPress={enableLocation} />
  ) : !precise ? (
    // Granted but approximate: every fix fails the accuracy gate, so a
    // drive would save as all zeros. Say why instead of offering Start.
    <>
      <Button label="Open Settings" onPress={openSettings} />
      <ActionNote>
        Precise Location is off. Approximate positions are too coarse to measure a drive — turn
        it on in Settings.
      </ActionNote>
    </>
  ) : (
    <>
      <Button
        label="Start drive"
        onPress={() => {
          haptic.driveStarted();
          startDrive();
        }}
      />
      <Text variant="legal" style={styles.setOff}>
        {SET_OFF_LINE}
      </Text>
      {lastDiscardedAt != null ? <ActionNote>{DISCARDED_NOTE}</ActionNote> : null}
      {/* Not a block: a drive still records while Gapped is on screen. */}
      {backgroundPermission !== 'granted' ? (
        <AlwaysNote onOpenSettings={openSettings} />
      ) : null}
    </>
  );

  // Only claim automatic detection when it can actually run; it once said so
  // with location off, beside a button that did nothing.
  const detection =
    permission === 'granted' && precise
      ? 'Detection is automatic — sustained motion starts a recording. ' +
        'You can also start one manually while safely parked.'
      : 'Once precise location is on, sustained motion starts a recording automatically.';

  const rows = (
    <>
      {shown.map((d, i) => (
        <Entrance key={d.id} index={i}>
          <DriveRow
            first={i === 0}
            model={rowModels[i]}
            thumb={thumbFor(d.id)}
            verified={verified.has(d.id)}
            onPress={rowOpeners[i]}
          />
        </Entrance>
      ))}
      {/*
        Drives past Free's window, as one row under the rest, as on the You
        tab: kept, counted, and leading to Pro rather than opening. Why one
        row and not one per drive: lockedHistoryRow, src/drive/driveAccess.ts.
      */}
      {showLocked && lockedRow ? (
        <Entrance index={shown.length}>
          <LockedDrivesRow row={lockedRow} onPress={goPro} first={shown.length === 0} />
        </Entrance>
      ) : null}
    </>
  );

  return (
    <View style={styles.root} onLayout={(e) => setSceneHeight(e.nativeEvent.layout.height)}>
      {recording ? (
        <>
          {/*
            The map ends at the panel, not the bottom of the screen. Full-bleed,
            its centre — where the camera puts the driver on the first fix, on
            Recentre and every second while following — sat behind the opaque
            panel on every iPhone, and so did Apple's Legal link. It still runs
            PANEL_RADIUS under the panel so the map, not the canvas, shows in
            the rounded corners.
          */}
          <DriveMap
            ref={mapRef}
            position={live.position}
            route={live.route}
            following={recording}
            obscuredBottom={PANEL_RADIUS}
            style={[styles.map, { bottom: panelHeight - PANEL_RADIUS }]}
          />

          <View style={[styles.badge, { top: insets.top + space.md }]}>
            <RecordingBadge />
          </View>
          <View style={[styles.controls, { top: insets.top + space.md }]}>
            <MapControls
              canRecentre={live.position != null}
              onRecentre={() => mapRef.current?.recentre()}
              hudVisible={hudVisible}
              onToggleHud={() => setHudVisible((v) => !v)}
            />
          </View>

          {hudVisible ? <LiveHud top={hudTop} size={hudSize} unitPref={unitPref} /> : null}

          <View style={[styles.panel, { height: panelHeight }]}>
            <View style={styles.panelHeader}>
              <View style={styles.panelTitle}>
                <RecentDrivesHeader />
              </View>
              <View style={styles.avatar}>
                {bodyType ? (
                  <CarSilhouette
                    bodyType={bodyType}
                    size={AVATAR - 10}
                    color={color.text2}
                    revealKey={`${vehicleMake}-${vehicleModel}`}
                  />
                ) : (
                  <Text variant="caption" style={styles.avatarEmpty}>
                    —
                  </Text>
                )}
              </View>
            </View>
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {drives.length === 0 ? <NoDrivesYet detection={detection} /> : rows}
            </ScrollView>
            <View style={styles.panelAction}>{action}</View>
          </View>
        </>
      ) : (
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={100}
          onScroll={(e) => {
            const seen = e.nativeEvent.contentOffset.y < (heroBox?.height ?? Infinity) - insets.top;
            // Same value, no render: React bails out.
            setHeroInView(seen);
          }}
        >
          <View
            style={[styles.hero, { minHeight: heroMinHeight }]}
            onLayout={(e) => {
              const { width: w, height: h } = e.nativeEvent.layout;
              setHeroBox((prev) =>
                prev && prev.width === w && prev.height === h ? prev : { width: w, height: h },
              );
            }}
          >
            {heroBox && stageTop != null ? (
              <HeroScene
                width={heroBox.width}
                height={heroBox.height}
                stageTop={stageTop}
                vehicle={vehicleKind === 'motorbike' ? 'motorbike' : 'car'}
                paused={!heroInView}
              />
            ) : null}
            <HeroGrain paused={!heroInView} />

            <View style={[styles.header, { marginTop: insets.top + space.xs }]}>
              <GappedMark size="sm" />
              <PressableScale
                onPress={() => router.push('/settings')}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                style={styles.iconButton}
              >
                <Icon name="settings" size={22} color={color.text2} />
              </PressableScale>
            </View>

            <View style={styles.identity}>
              <StatusLine status={status} />
              <Text
                variant="display"
                accessibilityRole="header"
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {title}
              </Text>
            </View>

            {/* The stage: the car stands here, drawn by the scene behind. */}
            <View
              style={{ height: stageHeight }}
              onLayout={(e) => setStageTop(e.nativeEvent.layout.y)}
            />

            <View style={styles.heroAction}>{action}</View>
          </View>

          <View style={styles.recent}>
            <RecentDrivesHeader
              toggle={
                overflow
                  ? { expanded: allDrives, onPress: () => setAllDrives((v) => !v) }
                  : undefined
              }
            />
            {drives.length === 0 ? <NoDrivesYet detection={detection} /> : rows}
          </View>
        </ScrollView>
      )}

      {/*
        IMU debug readout. Off by default; Settings → Debug HUD turns it on, in
        development builds only (INTERNAL_TOOLS). It was once deliberately
        visible in TestFlight builds, to confirm the gravity and sampling fixes
        in a moving vehicle; those are confirmed, and a release build — the App
        Store's and TestFlight's are the same binary — no longer carries
        developer tools. The profile store also holds `debugHud` false in a
        release build, so a TestFlight install that left it on cannot bring it
        back; the flag is checked here as well so the strip cannot render
        whatever the store says.

        Not inside the HUD block, deliberately: the parked baseline and the
        phone-rotation gravity check both happen BEFORE a drive starts, and
        tapping HUD to hide the speedometer would have taken the diagnostics
        with it.

        Reading it: `g` sits near 0.00 parked and rises under braking or
        cornering; `Hz` sits at 1 cruising and flicks to 10 when something
        happens. A `g` that idles near 1.00 means gravity is back in the signal,
        and Hz will be stuck at 10 as a consequence.
      */}
      {INTERNAL_TOOLS && debugHud ? <DebugStrip top={insets.top + space.md} /> : null}
    </View>
  );
}

/**
 * The live dial and the distance · elapsed line under it.
 *
 * Its own subscriber, so speed and distance (every fix) and the elapsed clock
 * (every second) re-render this alone rather than the map and the drive list.
 * Mounted only while recording with the HUD shown, so the clock starts fresh.
 *
 * The line keeps the caption's line height (hud.ts budgets exactly that) and
 * sets its figures in the wide italic at that size, units in mono, on a dark
 * slanted plate that overhangs the line without adding to its height.
 */
function LiveHud({ top, size, unitPref }: { top: number; size: number; unitPref: UnitPref }) {
  const { speedMs, distanceM, startedAt } = useDriveStore(
    useShallow((s) => ({ speedMs: s.speedMs, distanceM: s.distanceM, startedAt: s.startedAt })),
  );
  // The store only ticks on a fix, so the elapsed clock owns its own second hand.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { value, unit } = speedForDisplay(speedMs, unitPref);
  const distance = distanceForDisplay(distanceM, unitPref);
  const elapsed = formatDuration(
    seconds(startedAt != null ? Math.max(0, now - startedAt) / 1000 : 0),
  );
  return (
    <View pointerEvents="none" style={[styles.hud, { top }]}>
      {/*
        No `pb` here, deliberately. The dial's NEW PB badge springs in the moment
        live speed passes the stored best — a reward for a number going up while
        driving, which NO_IN_DRIVE_SPEED_NUDGES (src/config/flags.ts) forbids.
        A record is celebrated when the drive finalises (the lastSummary effect).
        No speed glow either, for the same reason: a bloom that brightens with
        speed rewards the number going up. The lit ticks still read the speed.
      */}
      <Speedometer
        value={value}
        maxValue={unitPref === 'imperial' ? 160 : 260}
        unit={unit}
        size={size}
        active
        speedGlow={false}
      />
      <View
        style={styles.hudRow}
        accessible
        accessibilityLabel={`${distance.value.toFixed(1)} ${distance.unit}, ${elapsed}`}
      >
        <View style={styles.hudPlate} />
        <Text style={styles.hudFigure} maxFontSizeMultiplier={HUD_MAX_FONT_SCALE}>
          {distance.value.toFixed(1)}
        </Text>
        <Text variant="mono" style={styles.hudUnit} maxFontSizeMultiplier={HUD_MAX_FONT_SCALE}>
          {distance.unit}
        </Text>
        <View style={styles.hudDivider} />
        <Text style={styles.hudFigure} maxFontSizeMultiplier={HUD_MAX_FONT_SCALE}>
          {elapsed}
        </Text>
      </View>
    </View>
  );
}

/**
 * A line under the parked screen's button: why it is not "Start drive", or
 * why the last drive left no row. The parked screen scrolls, so these grow
 * with Dynamic Type like any body copy.
 */
function ActionNote({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption" style={styles.actionNote}>
      {children}
    </Text>
  );
}

/**
 * Location is on only while Gapped is open: one tappable line that says what
 * that costs and opens Settings, where Location can be set to Always. Shown
 * only beside Start drive, parked — never during a drive, when the phone is
 * not to be handled. The whole line is the 44pt target.
 */
function AlwaysNote({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <PressableScale
      onPress={onOpenSettings}
      accessibilityRole="button"
      accessibilityLabel={`${ALWAYS_NOTE} Open Settings`}
      accessibilityHint="Opens Gapped's settings"
      style={styles.alwaysNote}
    >
      <Icon name="location" size={18} color={color.text3} />
      <Text variant="caption" style={styles.alwaysText}>
        {ALWAYS_NOTE} <Text variant="caption" style={styles.alwaysLink}>Open Settings</Text>
      </Text>
    </PressableScale>
  );
}

/** The IMU debug readout (see the note where it is mounted). */
function DebugStrip({ top }: { top: number }) {
  const { engineState, imuHz, lastAccelG } = useDriveStore(
    useShallow((s) => ({ engineState: s.engineState, imuHz: s.imuHz, lastAccelG: s.lastAccelG })),
  );
  return (
    <View pointerEvents="none" style={[styles.debugStrip, { top }]}>
      <Text variant="mono" style={styles.hudDebug}>
        {`${engineState} · IMU ${imuHz} Hz · ${
          lastAccelG != null ? raw(lastAccelG).toFixed(2) : '—'
        } g`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  scrollContent: { paddingBottom: space.xxl },

  // ── Parked ──
  // Not clipped: the primary button's red spill falls on the road below it.
  hero: { overflow: 'visible' },
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: ROW_INSET,
    paddingRight: space.sm + 2,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  identity: { paddingHorizontal: gutter, marginTop: space.md + 2, gap: space.sm + 2 },
  heroAction: { paddingHorizontal: gutter, gap: space.md, paddingBottom: space.sm },
  setOff: { marginTop: 2 },
  recent: { marginTop: space.lg + 2 },

  // ── Recording ──
  map: { position: 'absolute', top: 0, left: 0, right: 0 },
  badge: { position: 'absolute', left: gutter, height: MAP_CONTROL, justifyContent: 'center' },
  controls: { position: 'absolute', right: gutter },
  hud: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hudRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
    marginTop: space.md,
    paddingHorizontal: space.lg,
  },
  // Overhangs the line by 4pt top and bottom, outside hud.ts's budget for
  // the line itself and well inside the space.sm it leaves above the panel.
  hudPlate: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: 0,
    right: 0,
    borderRadius: radius.sm,
    transform: slant.transform,
    backgroundColor: alpha(color.canvas, 0.78),
    borderWidth: 1,
    borderColor: color.hairline,
  },
  hudFigure: {
    fontFamily: font.display,
    ...textStyle(type.caption),
    color: color.text1,
    fontVariant: ['tabular-nums'],
    paddingRight: italicOverhang(type.caption.size),
  },
  hudUnit: { color: color.text3 },
  hudDivider: {
    width: 1,
    height: 12,
    marginHorizontal: space.sm,
    backgroundColor: color.outline,
    transform: slant.transform,
    alignSelf: 'center',
  },
  debugStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hudDebug: { color: color.text3, marginTop: 2 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.canvas,
    borderTopLeftRadius: PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,
    borderTopWidth: 1,
    borderColor: color.hairline,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: gutter,
  },
  panelTitle: { flex: 1 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  avatarEmpty: { color: color.text3 },
  list: { flex: 1, marginTop: space.xs },
  listContent: { paddingBottom: space.md },
  panelAction: { paddingTop: space.sm, paddingHorizontal: gutter },

  // ── Notes ──
  actionNote: { color: color.text2 },
  alwaysNote: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  alwaysText: { flex: 1, color: color.text2 },
  alwaysLink: {
    color: color.text1,
    fontFamily: font.bodySemibold,
    textDecorationLine: 'underline',
  },
});
