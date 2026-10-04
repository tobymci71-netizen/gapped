import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Linking,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/Button';
import { CarSilhouette } from '@/components/CarSilhouette';
import { DriveMap, DriveMapHandle } from '@/components/DriveMap';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge, useGoPro } from '@/components/ProBadge';
import { Speedometer } from '@/components/Speedometer';
import { Text } from '@/components/Text';
import { lockedHistoryRow, splitHistory } from '@/drive/driveAccess';
import { sanitiseHeading } from '@/drive/heading';
import { HUD_MAX_FONT_SCALE, hudDialSize } from '@/drive/hud';
import { useDriveStore } from '@/drive/recorder';
import { DriveSummary } from '@/drive/types';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  speedForDisplay,
  UnitPref,
} from '@/drive/units';
import { LocalDrive, listDrives, readFixesSince } from '@/drive/wal';
import { useAccess } from '@/lib/entitlements';
import { haptic } from '@/lib/haptics';
import { seconds, raw } from '@/types/units';
import { useProfile } from '@/state/profile';
import { useRecords } from '@/state/records';
import { color, gutter, radius, space, textStyle, type } from '@/theme/tokens';
import { BodyType, inferBodyType } from '@/vehicles/bodyType';

/**
 * Map-first Driving tab: the map is the screen, everything else floats over it.
 *
 * The recorder store carries speed and distance but no coordinates, so during a
 * drive the live position and the route come from the WAL — the same rows the
 * recorder has just written. Each poll reads only the rows appended since the
 * last one: re-reading the whole drive would grow linearly with drive length on
 * the very JS thread that is appending fixes.
 *
 * Idle, there is nothing in the WAL, so the puck comes from expo-location
 * directly. It is a measured position either way; we never guess one.
 */

const POSITION_POLL_MS = 2000;
/** Display cap for the live polyline. Beyond it the route is decimated —
 *  the map cannot resolve more, and the whole array crosses the bridge. */
const MAX_ROUTE_POINTS = 1500;
const AVATAR = 44;
const CONTROL = 44;
const PANEL_RADIUS = radius.card + 8;
const DISCARDED_NOTE = "That drive wasn't saved — no usable GPS fix was recorded.";
const ACTION_NOTE_MAX_FONT_SCALE = 1.3;

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
  const { height, fontScale } = useWindowDimensions();
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
  const [drives, setDrives] = useState<FinalizedDrive[]>([]);
  // When the list was last read: Free's history window is measured from it,
  // so a drive crossing the window locks on the next refresh, not mid-scroll.
  const [listedAt, setListedAt] = useState(Date.now);
  // Unrestricted while PRO_LIMITS_ENFORCED is off, and then every drive opens.
  const access = useAccess();
  const goPro = useGoPro();
  const [sceneHeight, setSceneHeight] = useState(0);

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

  // The note appears above a button that has just swapped from End to Start,
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

  // Idle: the WAL holds nothing, so the puck comes from the location provider.
  // `following` stays false, so the camera frames the driver once and then
  // leaves the map alone.
  useEffect(() => {
    if (recording) return;
    if (permission !== 'granted') {
      setLive(NO_LIVE);
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
    };
    // Last known first for an instant puck, then the real fix when it lands.
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
  }, [recording, permission]);

  const panelHeight = Math.max(300, Math.round(height * 0.46));
  const hudTop = insets.top + space.md + CONTROL + space.md;
  // The dial gives up height so the live line under it clears the panel.
  const hudSize = hudDialSize({ sceneHeight, panelHeight, hudTop, fontScale });

  // Free opens the last FREE_LIMITS.historyDays of drives; older ones are
  // kept and stand as one Pro row. With enforcement off, `open` is every drive.
  const history = splitHistory(drives, listedAt, access);
  const lockedRow = lockedHistoryRow(history.locked);

  const enableLocation = async () => {
    // Every other rejection path in the app says so.
    if (!(await requestPermissions().catch(() => false))) haptic.error();
  };
  const openSettings = () => {
    Linking.openSettings().catch(() => undefined);
  };

  return (
    <View style={styles.root} onLayout={(e) => setSceneHeight(e.nativeEvent.layout.height)}>
      {/*
        The map ends at the panel, not the bottom of the screen. Full-bleed, its
        centre — where the camera puts the driver on the first fix, on Recentre
        and every second while following — sat behind the opaque panel on every
        iPhone, and so did Apple's Legal link. It still runs PANEL_RADIUS under
        the panel so the map, not the canvas, shows in the rounded corners.
      */}
      <DriveMap
        ref={mapRef}
        position={live.position}
        route={live.route}
        following={recording}
        obscuredBottom={PANEL_RADIUS}
        style={[styles.map, { bottom: panelHeight - PANEL_RADIUS }]}
      />

      <View style={[styles.controls, { top: insets.top + space.md }]}>
        <PressableScale
          onPress={() => mapRef.current?.recentre()}
          disabled={live.position == null}
          silent={live.position == null}
          accessibilityRole="button"
          accessibilityLabel="Recentre on my position"
          style={[styles.control, live.position == null && styles.controlOff]}
        >
          <Text style={styles.controlGlyph}>◎</Text>
        </PressableScale>
        <PressableScale
          onPress={() => setHudVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={hudVisible ? 'Hide speed display' : 'Show speed display'}
          style={styles.control}
        >
          <Text
            variant="caption"
            style={[styles.controlLabel, { color: hudVisible ? color.accent : color.text2 }]}
          >
            HUD
          </Text>
        </PressableScale>
      </View>

      {recording && hudVisible ? <LiveHud top={hudTop} size={hudSize} unitPref={unitPref} /> : null}

      {/*
        IMU debug readout. Off by default; Settings → Debug HUD turns it on.
        NOT behind __DEV__ and not inside the HUD block above, both deliberately.

        A TestFlight build is a release build, so a __DEV__ gate would hide the
        one instrument needed to confirm the gravity and sampling fixes — and
        those can only be confirmed in a moving vehicle, which is never where a
        debug build is.

        Nested inside `recording && hudVisible` it would have been almost as
        useless: the parked baseline and the phone-rotation gravity check both
        happen BEFORE a drive starts, and tapping HUD to hide the speedometer
        would have taken the diagnostics with it. It renders whenever the flag
        is on.

        Reading it: `g` sits near 0.00 parked and rises under braking or
        cornering; `Hz` sits at 1 cruising and flicks to 10 when something
        happens. A `g` that idles near 1.00 means gravity is back in the signal,
        and Hz will be stuck at 10 as a consequence.
      */}
      {debugHud ? <DebugStrip top={insets.top + space.md} /> : null}

      <View style={[styles.panel, { height: panelHeight }]}>
        <View style={styles.panelHeader}>
          <Text variant="headline">Drives</Text>
          <View style={styles.avatar}>
            {bodyType ? (
              <CarSilhouette
                bodyType={bodyType}
                size={AVATAR - 10}
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
          {drives.length === 0 ? (
            <View style={styles.empty}>
              <CarSilhouette bodyType={bodyType ?? 'saloon'} size={92} color={color.text3} />
              <Text variant="body" style={styles.emptyCopy}>
                No drives recorded yet.
              </Text>
              {/* Only claim automatic detection when it can actually run; it
                  said so with location off, beside a button that did nothing. */}
              <Text variant="caption" style={styles.emptyCopy}>
                {permission === 'granted' && precise
                  ? 'Detection is automatic — sustained motion starts a recording. You can also start one manually while safely parked.'
                  : 'Once precise location is on, sustained motion starts a recording automatically.'}
              </Text>
            </View>
          ) : (
            history.open.map((d, i) => {
              const distance = formatDistance(d.summary.distanceM, unitPref);
              const time = formatDuration(d.summary.durationS);
              const top = formatSpeed(d.summary.maxSpeedMs, unitPref);
              return (
                <Entrance key={d.id} index={i}>
                  <PressableScale
                    onPress={() => router.push(`/drive/${d.id}`)}
                    accessibilityRole="button"
                    // The label replaces the row's text for VoiceOver, so it
                    // carries the stats too — not just the date.
                    accessibilityLabel={`Drive on ${new Date(d.startedAt).toLocaleString()}, ${distance}, ${time}, top speed ${top}`}
                    style={styles.row}
                  >
                    <View style={styles.rowBody}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {new Date(d.startedAt).toLocaleDateString()} ·{' '}
                        {new Date(d.startedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      {/* Two lines: the top speed comes last, so at large text
                          sizes a single line ellipsized exactly that figure. */}
                      <Text variant="caption" numberOfLines={2}>
                        {distance} · {time} · top {top}
                      </Text>
                    </View>
                    <Text style={styles.rowChevron}>›</Text>
                  </PressableScale>
                </Entrance>
              );
            })
          )}
          {/*
            Drives past Free's window, as one row under the rest, as on the You
            tab: kept, counted, and leading to Pro rather than opening. Why one
            row and not one per drive: lockedHistoryRow, src/drive/driveAccess.ts.
          */}
          {lockedRow ? (
            <Entrance index={history.open.length}>
              <PressableScale
                onPress={goPro}
                accessibilityRole="button"
                accessibilityLabel={lockedRow.accessibilityLabel}
                style={styles.row}
              >
                <View style={styles.rowBody}>
                  <View style={styles.lockedTitle}>
                    <Text variant="bodyMedium">{lockedRow.title}</Text>
                    {/* Wrapped so the chip centres on the title instead of pinning to the top. */}
                    <View>
                      <ProBadge />
                    </View>
                  </View>
                  <Text variant="caption">{lockedRow.detail}</Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </PressableScale>
            </Entrance>
          ) : null}
        </ScrollView>

        <View style={styles.action}>
          {recording ? (
            // First, whatever else is true: a drive can only be ended from here,
            // and permission can now change underneath one.
            <Button label="End drive" variant="secondary" onPress={stopDrive} />
          ) : permission !== 'granted' && !canAskAgain ? (
            // Once denied, the OS will not show its prompt again, so "Enable
            // location" would be permanently inert. Only Settings can fix it.
            <>
              <ActionNote>
                Location is off for Gapped, so drives can&apos;t be recorded. Allow it in Settings.
              </ActionNote>
              <Button label="Open Settings" onPress={openSettings} />
            </>
          ) : permission !== 'granted' ? (
            <Button label="Enable location" onPress={enableLocation} />
          ) : !precise ? (
            // Granted but approximate: every fix fails the accuracy gate, so a
            // drive would save as all zeros. Say why instead of offering Start.
            <>
              <ActionNote>
                Precise Location is off. Approximate positions are too coarse to measure a
                drive — turn it on in Settings.
              </ActionNote>
              <Button label="Open Settings" onPress={openSettings} />
            </>
          ) : (
            <>
              {lastDiscardedAt != null ? (
                <ActionNote>{DISCARDED_NOTE}</ActionNote>
              ) : null}
              <Button
                label="Start drive"
                onPress={() => {
                  haptic.driveStarted();
                  startDrive();
                }}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * The live dial and the distance · elapsed line under it.
 *
 * Its own subscriber, so speed and distance (every fix) and the elapsed clock
 * (every second) re-render this alone rather than the map and the drive list.
 * Mounted only while recording with the HUD shown, so the clock starts fresh.
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
  return (
    <View pointerEvents="none" style={[styles.hud, { top }]}>
      {/*
        No `pb` here, deliberately. The dial's NEW PB badge springs in the moment
        live speed passes the stored best — a reward for a number going up while
        driving, which NO_IN_DRIVE_SPEED_NUDGES (src/config/flags.ts) forbids.
        A record is celebrated when the drive finalises (the lastSummary effect).
      */}
      <Speedometer
        value={value}
        maxValue={unitPref === 'imperial' ? 160 : 260}
        unit={unit}
        size={size}
        active
      />
      <View style={styles.hudRow}>
        {/* Tabular locally, not on the `caption` variant: these two tick
            live, but most captions in the app are prose. */}
        <Text
          variant="caption"
          style={styles.hudNumeral}
          maxFontSizeMultiplier={HUD_MAX_FONT_SCALE}
        >
          {formatDistance(distanceM, unitPref)}
        </Text>
        <Text variant="caption" maxFontSizeMultiplier={HUD_MAX_FONT_SCALE}>
          ·
        </Text>
        <Text
          variant="caption"
          style={styles.hudNumeral}
          maxFontSizeMultiplier={HUD_MAX_FONT_SCALE}
        >
          {formatDuration(seconds(startedAt != null ? Math.max(0, now - startedAt) / 1000 : 0))}
        </Text>
      </View>
    </View>
  );
}

/**
 * The line above the panel's button: why it is not "Start drive", or why the
 * last drive left no row.
 *
 * Capped like the HUD line. The panel is a fixed height and only the list
 * above can give up room, so at accessibility sizes on a 375×667 SE an
 * uncapped note grew to four or five lines and pushed the very button it
 * explains out of the bottom of the panel, under the tab bar.
 */
function ActionNote({ children }: { children: React.ReactNode }) {
  return (
    <Text
      variant="caption"
      style={styles.actionNote}
      maxFontSizeMultiplier={ACTION_NOTE_MAX_FONT_SCALE}
    >
      {children}
    </Text>
  );
}

/** The IMU debug readout (see the note where it is mounted). */
function DebugStrip({ top }: { top: number }) {
  const { engineState, imuHz, lastAccelG } = useDriveStore(
    useShallow((s) => ({ engineState: s.engineState, imuHz: s.imuHz, lastAccelG: s.lastAccelG })),
  );
  return (
    <View pointerEvents="none" style={[styles.debugStrip, { top }]}>
      <Text variant="caption" style={styles.hudDebug}>
        {`${engineState} · IMU ${imuHz} Hz · ${
          lastAccelG != null ? raw(lastAccelG).toFixed(2) : '—'
        } g`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  map: { position: 'absolute', top: 0, left: 0, right: 0 },
  controls: { position: 'absolute', right: gutter, gap: space.md },
  control: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: CONTROL / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 20, 22, 0.88)', // color.surface1, translucent over the map
    borderWidth: 1,
    borderColor: color.hairline,
  },
  controlOff: { opacity: 0.45 },
  controlGlyph: { fontSize: 20, lineHeight: 24, color: color.text1 },
  controlLabel: { ...textStyle(type.label), letterSpacing: 0.8 },
  hud: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hudNumeral: { fontVariant: ['tabular-nums'] },
  debugStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hudDebug: { color: color.text3, marginTop: 2, letterSpacing: 0.5 },
  hudRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface1,
    borderTopLeftRadius: PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,
    borderTopWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  avatarEmpty: { color: color.text3 },
  list: { flex: 1, marginTop: space.md },
  listContent: { paddingBottom: space.md },
  empty: { alignItems: 'center', gap: space.sm, paddingTop: space.sm },
  emptyCopy: { textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  rowBody: { flex: 1, gap: 2 },
  // Wraps at large text sizes rather than pushing the chip out of the row.
  lockedTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  rowChevron: { fontSize: 20, lineHeight: 22, color: color.text3 },
  action: { paddingTop: space.sm, gap: space.sm },
  actionNote: { textAlign: 'center' },
});
