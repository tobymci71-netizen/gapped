/**
 * Platform wiring: expo-location + expo-sensors → DriveEngine → WAL.
 *
 * The store exposes live state for the Drive screen. Every fix goes to disk
 * via the WAL before it touches React state.
 */

import * as Location from 'expo-location';
import { Accelerometer, Barometer } from 'expo-sensors';
import { create } from 'zustand';
import { DriveEngine } from './engine';
import { Fix, DriveSummary } from './types';
import * as wal from './wal';

type LiveState = {
  engineState: ReturnType<DriveEngine['getState']>;
  driveId: string | null;
  /** Current smoothed speed, m/s (SI — convert at render). */
  speedMs: number;
  distanceM: number;
  startedAt: number | null;
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

function makeDriveId(): string {
  // uuid-shaped, no external dep
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useDriveStore = create<LiveState & Actions>((set, get) => ({
  engineState: 'idle',
  driveId: null,
  speedMs: 0,
  distanceM: 0,
  startedAt: null,
  lastSummary: null,
  recovered: [],
  permission: 'unknown',

  /** Cold-start: recover any interrupted drive from the WAL, then arm sensors. */
  init: async () => {
    const recovered = wal.recoverUnterminated();
    set({ recovered });
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
    const events = engine.startManual(Date.now());
    handleEvents(events, set, get);
  },

  stopDrive: () => {
    const events = engine.stopManual(Date.now());
    handleEvents(events, set, get);
  },
}));

type Set = (partial: Partial<LiveState>) => void;
type Get = () => LiveState & Actions;

async function startWatching(set: Set, get: Get) {
  if (watcher) return;

  Accelerometer.setUpdateInterval(1000);
  Accelerometer.addListener((s) => {
    latestAccel = s;
    const mag = Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2);
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
      const fix: Fix = {
        t: loc.timestamp,
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        speedMs: loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : null,
        accuracyM: loc.coords.accuracy,
        altitudeM: loc.coords.altitude,
        heading: loc.coords.heading,
        accelX: latestAccel?.x ?? null,
        accelY: latestAccel?.y ?? null,
        accelZ: latestAccel?.z ?? null,
        pressureHpa: latestPressure,
        isMock: (loc as { mocked?: boolean }).mocked ?? false,
      };
      const events = engine.onFix(fix);
      handleEvents(events, set, get);
      set({ engineState: engine.getState(), speedMs: fix.speedMs ?? 0 });
    },
  );
}

function handleEvents(events: ReturnType<DriveEngine['onFix']>, set: Set, get: Get) {
  for (const ev of events) {
    if (ev.type === 'start') {
      const id = makeDriveId();
      accumulatedM = 0;
      lastFix = null;
      wal.openDrive(id, ev.at);
      set({ driveId: id, startedAt: ev.at, distanceM: 0, engineState: engine.getState() });
    } else if (ev.type === 'fix') {
      const id = get().driveId;
      if (!id) continue;
      // WAL first — the fix is on disk before UI state updates.
      wal.appendFix(id, ev.fix);
      if (lastFix) {
        const dt = (ev.fix.t - lastFix.t) / 1000;
        if (dt > 0 && ev.fix.accuracyM != null && ev.fix.accuracyM <= 20) {
          const { haversineM } = require('./stats') as typeof import('./stats');
          accumulatedM += haversineM(lastFix.lat, lastFix.lon, ev.fix.lat, ev.fix.lon);
        }
      }
      lastFix = ev.fix;
      set({ distanceM: accumulatedM });
    } else if (ev.type === 'end') {
      const id = get().driveId;
      if (!id) continue;
      const summary = wal.finalizeDrive(id, ev.at);
      set({
        driveId: null,
        startedAt: null,
        lastSummary: summary,
        engineState: engine.getState(),
        speedMs: 0,
      });
    }
  }
}
