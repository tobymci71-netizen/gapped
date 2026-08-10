import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { CarSilhouette } from '@/components/CarSilhouette';
import { DriveMap, DriveMapHandle } from '@/components/DriveMap';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { Speedometer } from '@/components/Speedometer';
import { Text } from '@/components/Text';
import { sanitiseHeading } from '@/drive/heading';
import { useDriveStore } from '@/drive/recorder';
import { DriveSummary } from '@/drive/types';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  msToKmh,
  msToMph,
  speedForDisplay,
} from '@/drive/units';
import { LocalDrive, listDrives, readFixesSince } from '@/drive/wal';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/state/profile';
import { useRecords } from '@/state/records';
import { color, gutter, radius, space } from '@/theme/tokens';
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
const HUD_SIZE = 200;

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
  const { height } = useWindowDimensions();
  const { unitPref, vehicleKind, vehicleMake, vehicleModel } = useProfile();
  const {
    engineState,
    driveId,
    speedMs,
    distanceM,
    startedAt,
    lastSummary,
    permission,
    requestPermissions,
    startDrive,
    stopDrive,
  } = useDriveStore();
  const { pbs, recordDrive } = useRecords();

  const recording = engineState === 'recording';
  const mapRef = useRef<DriveMapHandle>(null);
  const [hudVisible, setHudVisible] = useState(true);
  const [live, setLive] = useState<Live>(NO_LIVE);
  const [drives, setDrives] = useState<FinalizedDrive[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const { value: speedValue, unit: speedUnit } = speedForDisplay(speedMs, unitPref);
  const maxValue = unitPref === 'imperial' ? 160 : 260;
  const pbDisplay =
    pbs.topSpeedMs != null
      ? unitPref === 'imperial'
        ? msToMph(pbs.topSpeedMs)
        : msToKmh(pbs.topSpeedMs)
      : null;

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

  // Identity is preserved when the list is unchanged, so re-focusing the tab
  // does not replay the row entrance animations.
  const refreshDrives = useCallback(() => {
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

  // The store only ticks on a fix, so the elapsed clock owns its own second hand.
  useEffect(() => {
    if (!recording) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const panelHeight = Math.max(300, Math.round(height * 0.46));

  return (
    <View style={styles.root}>
      <DriveMap
        ref={mapRef}
        position={live.position}
        route={live.route}
        following={recording}
        style={styles.map}
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
            style={[styles.controlLabel, { color: hudVisible ? color.accent : color.text3 }]}
          >
            HUD
          </Text>
        </PressableScale>
      </View>

      {recording && hudVisible ? (
        <View
          pointerEvents="none"
          style={[styles.hud, { top: insets.top + space.md + CONTROL + space.md }]}
        >
          <Speedometer
            value={speedValue}
            maxValue={maxValue}
            unit={speedUnit}
            pb={pbDisplay}
            size={HUD_SIZE}
            active
          />
          <View style={styles.hudRow}>
            {/* Tabular locally, not on the `caption` variant: these two tick
                live, but most captions in the app are prose. */}
            <Text variant="caption" style={styles.hudNumeral}>
              {formatDistance(distanceM, unitPref)}
            </Text>
            <Text variant="caption">·</Text>
            <Text variant="caption" style={styles.hudNumeral}>
              {formatDuration(startedAt != null ? Math.max(0, now - startedAt) / 1000 : 0)}
            </Text>
          </View>
        </View>
      ) : null}

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
              <Text variant="caption" style={styles.emptyCopy}>
                Detection is automatic — sustained motion starts a recording. You can also
                start one manually while safely parked.
              </Text>
            </View>
          ) : (
            drives.map((d, i) => (
              <Entrance key={d.id} index={i}>
                <PressableScale
                  onPress={() => router.push(`/drive/${d.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Drive on ${new Date(d.startedAt).toLocaleString()}`}
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
                    <Text variant="caption" numberOfLines={1}>
                      {formatDistance(d.summary.distanceM, unitPref)} ·{' '}
                      {formatDuration(d.summary.durationS)} · top{' '}
                      {formatSpeed(d.summary.maxSpeedMs, unitPref)}
                    </Text>
                  </View>
                  <Text style={styles.rowChevron}>›</Text>
                </PressableScale>
              </Entrance>
            ))
          )}
        </ScrollView>

        <View style={styles.action}>
          {permission !== 'granted' ? (
            <Button label="Enable location" onPress={requestPermissions} />
          ) : recording ? (
            <Button label="End drive" variant="secondary" onPress={stopDrive} />
          ) : (
            <Button
              label="Start drive"
              onPress={() => {
                haptic.driveStarted();
                startDrive();
              }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  map: { ...StyleSheet.absoluteFill },
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
  controlLabel: { fontSize: 12, letterSpacing: 0.8 },
  hud: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hudNumeral: { fontVariant: ['tabular-nums'] },
  hudRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface1,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
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
  rowChevron: { fontSize: 20, lineHeight: 22, color: color.text3 },
  action: { paddingTop: space.sm },
});
