/**
 * Platform wiring: expo-location + expo-sensors → DriveEngine → WAL.
 *
 * The store exposes live state for the Drive screen. Every fix goes to disk
 * via the WAL before it touches React state. Foreground fixes come from
 * watchPositionAsync; background fixes from the task in backgroundTask.ts.
 * Both funnel through `processFix`, deduped by timestamp.
 */

import * as Location from 'expo-location';
import { Accelerometer, Barometer } from 'expo-sensors';
import { create } from 'zustand';
import { uuid } from '@/lib/ids';
import { useProfile } from '@/state/profile';
import {
  setBackgroundFixSink,
  startBackgroundUpdates,
  stopBackgroundUpdates,
} from './backgroundTask';
import { DriveEngine } from './engine';
import { sanitiseHeading } from './heading';
import { EpochMs, Metres, MetresPerSecond, gForce, metres, mps } from '@/types/units';
import {
  nowEpochMs,
  sensorAccel,
  sensorAccuracy,
  sensorAltitude,
  sensorCoord,
  sensorPressure,
  sensorSpeed,
  sensorTimestamp,
} from '@/types/boundary';
import { haversineM } from './stats';
import { DriveSummary, Fix } from './types';
import * as wal from './wal';

type LiveState = {
  engineState: ReturnType<DriveEngine['getState']>;
  driveId: string | null;
  /** Current smoothed speed, m/s (SI — convert at render). */
  speedMs: MetresPerSecond;
  distanceM: Metres;
  startedAt: EpochMs | null;
  lastSummary: DriveSummary | null;
  recovered: wal.LocalDrive[];
  permission: 'unknown' | 'granted' | 'denied';
};

type Actions = {
  init: () => Promise<void>;
  requestPermissions: () => Promise<boolean>;
  startDrive: () => void;
  stopDrive: () => void;
};

const engine = new DriveEngine();
let watcher: Location.LocationSubscription | null = null;
let latestAccel: { x: number; y: number; z: number } | null = null;
let latestPressure: number | null = null;
let accumulatedM = 0;
let lastFix: Fix | null = null;
let lastProcessedT = 0;

const makeDriveId = uuid;

export const useDriveStore = create<LiveState & Actions>((set, get) => ({
  engineState: 'idle',
  driveId: null,
  speedMs: mps(0),
  distanceM: metres(0),
  startedAt: null,
  lastSummary: null,
  recovered: [],
  permission: 'unknown',

  /** Cold-start: recover any interrupted drive from the WAL, then arm sensors. */
  init: async () => {
    const recovered = wal.recoverUnterminated();
    set({ recovered });
    if (recovered.length > 0) {
      const last = recovered[recovered.length - 1];
      if (last.summary) set({ lastSummary: last.summary });
    }
    const { status } = await Location.getForegroundPermissionsAsync();
    set({ permission: status === 'granted' ? 'granted' : 'unknown' });
    if (status === 'granted') await startWatching(set, get);
  },

  requestPermissions: async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      set({ permission: 'denied' });
      return false;
    }
    // Background is requested separately; recording works foreground-only
    // without it (we say so rather than failing silently).
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
    set({ permission: 'granted' });
    await startWatching(set, get);
    return true;
  },

  startDrive: () => {
    handleEvents(engine.startManual(nowEpochMs()), set, get);
  },

  stopDrive: () => {
    handleEvents(engine.stopManual(nowEpochMs()), set, get);
  },
}));

type Set = (partial: Partial<LiveState>) => void;
type Get = () => LiveState & Actions;

function processFix(fix: Fix, set: Set, get: Get) {
  if (fix.t <= lastProcessedT) return; // dedupe foreground/background overlap
  lastProcessedT = fix.t;
  const events = engine.onFix(fix);
  handleEvents(events, set, get);
  set({ engineState: engine.getState(), speedMs: fix.speedMs ?? mps(0) });
}

async function startWatching(set: Set, get: Get) {
  if (watcher) return;

  setBackgroundFixSink((fixes) => {
    for (const f of fixes) {
      processFix(
        {
          ...f,
          accelX: sensorAccel(latestAccel?.x),
          accelY: sensorAccel(latestAccel?.y),
          accelZ: sensorAccel(latestAccel?.z),
          pressureHpa: sensorPressure(latestPressure),
        },
        set,
        get,
      );
    }
  });

  Accelerometer.setUpdateInterval(1000);
  Accelerometer.addListener((s) => {
    latestAccel = s;
    const mag = gForce(Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2));
    const hz = engine.desiredImuHz(mag);
    Accelerometer.setUpdateInterval(hz === 10 ? 100 : 1000);
  });
  Barometer.addListener((s) => {
    latestPressure = s.pressure;
  });

  watcher = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
    },
    (loc) => {
      processFix(
        {
          t: sensorTimestamp(loc.timestamp),
          lat: sensorCoord(loc.coords.latitude),
          lon: sensorCoord(loc.coords.longitude),
          speedMs: sensorSpeed(
            loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : null,
          ),
          accuracyM: sensorAccuracy(loc.coords.accuracy),
          altitudeM: sensorAltitude(loc.coords.altitude),
          heading: sanitiseHeading(loc.coords.heading),
          accelX: sensorAccel(latestAccel?.x),
          accelY: sensorAccel(latestAccel?.y),
          accelZ: sensorAccel(latestAccel?.z),
          pressureHpa: sensorPressure(latestPressure),
          isMock: (loc as { mocked?: boolean }).mocked ?? false,
        },
        set,
        get,
      );
    },
  );
}

function handleEvents(events: ReturnType<DriveEngine['onFix']>, set: Set, get: Get) {
  for (const ev of events) {
    if (ev.type === 'start') {
      const id = makeDriveId();
      accumulatedM = 0;
      lastFix = null;
      // Stamp the drive with the vehicle that recorded it, at the moment it
      // starts. Attaching the user's *current* vehicle later, at sync time,
      // would quietly credit this drive to whatever they happen to be driving
      // then — a leaderboard that claims to be believable cannot do that.
      wal.openDrive(id, ev.at, useProfile.getState().vehicleId);
      set({ driveId: id, startedAt: ev.at, distanceM: metres(0), engineState: engine.getState() });
      // Keep fixes flowing with the screen off. No-op without background permission.
      startBackgroundUpdates().catch(() => undefined);
    } else if (ev.type === 'fix') {
      const id = get().driveId;
      if (!id) continue;
      // WAL first — the fix is on disk before UI state updates.
      wal.appendFix(id, ev.fix);
      if (lastFix) {
        const dt = (ev.fix.t - lastFix.t) / 1000;
        if (dt > 0 && ev.fix.accuracyM != null && ev.fix.accuracyM <= 20) {
          accumulatedM += haversineM(lastFix.lat, lastFix.lon, ev.fix.lat, ev.fix.lon);
        }
      }
      lastFix = ev.fix;
      set({ distanceM: metres(accumulatedM) });
    } else if (ev.type === 'end') {
      const id = get().driveId;
      if (!id) continue;
      const summary = wal.finalizeDrive(id, ev.at);
      stopBackgroundUpdates().catch(() => undefined);
      // Upload + server verification; offline is fine, sync retries next init.
      import('@/lib/sync')
        .then((m) => m.syncFinalizedDrives())
        .catch(() => undefined);
      set({
        driveId: null,
        startedAt: null,
        lastSummary: summary,
        engineState: engine.getState(),
        speedMs: mps(0),
      });
    }
  }
}
