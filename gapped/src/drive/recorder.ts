/**
 * Platform wiring: expo-location + expo-sensors → DriveEngine → WAL.
 *
 * The store exposes live state for the Drive screen. Every fix goes to disk
 * via the WAL before it touches React state. Foreground fixes come from
 * watchPositionAsync; background fixes from the task in backgroundTask.ts.
 * Both funnel through `processFix`, deduped by timestamp.
 */

import * as Location from 'expo-location';
import { Barometer, DeviceMotion } from 'expo-sensors';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { uuid } from '@/lib/ids';
import { driveLog } from '@/lib/log';
import { useProfile } from '@/state/profile';
import {
  setBackgroundFixSink,
  startBackgroundUpdates,
  stopBackgroundUpdates,
} from './backgroundTask';
import { DriveEngine } from './engine';
import { sanitiseHeading } from './heading';
import { readLocationAccess } from './permission';
import {
  EpochMs,
  GForce,
  Metres,
  MetresPerSecond,
  gForce,
  metres,
  mps,
  mps2,
  ms2ToG,
} from '@/types/units';
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
  /**
   * When the last drive ended with nothing worth keeping (no usable fix) and
   * was discarded rather than saved; cleared when the next one starts. Lets
   * the Drive tab say why End produced no row.
   */
  lastDiscardedAt: EpochMs | null;
  recovered: wal.LocalDrive[];
  permission: 'unknown' | 'granted' | 'denied';
  /** False once the OS will no longer prompt — only Settings can grant it. */
  canAskAgain: boolean;
  /** False when location is granted but approximate; see permission.ts. */
  precise: boolean;
  /**
   * Debug readout, surfaced on the HUD behind a settings toggle. Present so the
   * adaptive sampling and the gravity-removed magnitude can be confirmed on a
   * real drive — neither is observable from a simulator.
   */
  imuHz: 1 | 10;
  /** Magnitude of the latest user-acceleration sample, g. ~0 when parked. */
  lastAccelG: GForce | null;
};

type Actions = {
  init: () => Promise<void>;
  requestPermissions: () => Promise<boolean>;
  startDrive: () => void;
  stopDrive: () => void;
  /**
   * Everything off, for good, for a build the version gate has blocked: ends a
   * live drive (finalised, never lost), disarms the watchers, detaches the
   * background sink and stops background location. Nothing re-arms afterwards,
   * not even a return to the foreground.
   */
  shutdown: () => Promise<void>;
};

const engine = new DriveEngine();
let watcher: Location.LocationSubscription | null = null;
/**
 * DeviceMotion and Barometer subscriptions, kept so the watchers can be torn
 * down and re-armed. They were discarded, so re-running the arm would have
 * stacked a duplicate pair of listeners each time.
 */
let sensorSubs: { remove: () => void }[] = [];
/**
 * Every arm/disarm of the foreground watchers runs through this chain, one at
 * a time. Arming awaits a native call, and init, the permission prompt and
 * AppState 'active' can all ask at once — dismissing the iOS dialog itself
 * fires 'active' — so two callers could each pass the `watcher` check and
 * stack duplicate subscriptions.
 */
let watchOps: Promise<void> = Promise.resolve();
/** Pending re-check after the location stream failed; one at a time. */
let rewatchTimer: ReturnType<typeof setTimeout> | null = null;
/** Delay before re-arming after a stream error, so a repeating error cannot spin. */
const REWATCH_DELAY_MS = 3000;
/** The AppState listener is app-lifetime and registered once, from init. */
let listeningToAppState = false;
/** Set by shutdown(); every later arm is refused. */
let isShutDown = false;
/**
 * Latest IMU sample as USER acceleration in g (gravity excluded). Branded, so
 * a raw m/s^2 reading cannot be assigned here by mistake — which is exactly the
 * confusion that produced the gravity-inflated figures.
 */
let latestAccel: { x: GForce; y: GForce; z: GForce } | null = null;

/**
 * Sampling intervals. 10 Hz while something is happening, 1 Hz when it is not.
 *
 * The adaptive switch was always implemented, but was permanently saturated:
 * with gravity included, every magnitude read ~1.0 g, which is above the 0.25 g
 * HIGH_RATE_ACCEL_G threshold, so the rate never dropped out of 10 Hz. The two
 * IMU findings shared one root cause — removing gravity is what makes the
 * sampling adaptive again, not a separate change.
 */
const IMU_INTERVAL_MS = { high: 100, low: 1000 } as const;

/** Current IMU rate, tracked so the interval is only reset when it changes. */
let currentImuHz: 1 | 10 = 1;
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
  lastDiscardedAt: null,
  recovered: [],
  permission: 'unknown',
  canAskAgain: true,
  precise: true,
  imuHz: 1,
  lastAccelG: null,

  /** Cold-start: recover any interrupted drive from the WAL, then arm sensors. */
  init: async () => {
    const recovered = wal.recoverUnterminated();
    if (recovered.length > 0) driveLog('recovery.unterminated', { count: recovered.length });
    set({ recovered });
    if (recovered.length > 0) {
      const last = recovered[recovered.length - 1];
      if (last.summary) set({ lastSummary: last.summary });
    }

    /*
     * Stop any background session the last process left running.
     *
     * Background location is stopped only by a drive's 'end'. When the process
     * dies mid-drive (swiped away, jetsam, crash, reboot) that never runs, and
     * expo-task-manager restores the registered task natively on the next
     * launch — 1 s BestForNavigation GPS with the blue pill on iOS, the
     * "recording your drive" notification on Android — while the drive itself
     * was just finalised above and nothing is recording. It ran until some
     * later drive happened to end. Recording only runs during a drive, never
     * continuously: a new drive starts its own session.
     *
     * Before the watchers arm, so no fix can start a drive in between.
     */
    if (engine.getState() !== 'recording') {
      await stopBackgroundUpdates()
        .then((stopped) => {
          if (stopped) driveLog('background.orphan.stopped');
        })
        .catch((e) => driveLog('background.stop.FAILED', { message: String(e) }));
    }

    // Permission and precision are changed in the Settings app, which the user
    // returns from without a relaunch: re-read them every time we come back.
    if (!listeningToAppState) {
      listeningToAppState = true;
      AppState.addEventListener('change', (s) => {
        if (s === 'active') void syncPermission(set, get);
      });
    }
    await syncPermission(set, get);
  },

  requestPermissions: async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    const access = readLocationAccess(fg);
    set(access);
    if (access.permission !== 'granted') return false;
    // Motion & Fitness, asked for here and answered before this resolves.
    // Left to the barometer starting below, iOS raised the dialog on its own
    // schedule, after this had resolved: onboarding's location step had moved
    // on, and the dialog landed on "Your focus" with nothing explaining it.
    // A refusal only costs a run its motion check, so it never stops recording.
    await requestMotionPermission();
    // Background is requested separately; recording works foreground-only
    // without it (we say so rather than failing silently). It goes last:
    // expo-location can resolve it while its dialog is still up (it infers
    // the answer from app-state notifications and a 1.5 s timer), and a
    // dialog asked for after it pushed it aside — iOS then showed it again on
    // a later launch, over whatever screen that was.
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
    // The only arm that comes from a tap, so the only one allowed to show
    // Android's "turn on device location" dialog.
    await startWatching(set, get, true);
    return true;
  },

  startDrive: () => {
    handleEvents(engine.startManual(nowEpochMs()), set, get);
  },

  stopDrive: () => {
    handleEvents(engine.stopManual(nowEpochMs()), set, get);
  },

  shutdown: async () => {
    isShutDown = true;
    if (rewatchTimer) {
      clearTimeout(rewatchTimer);
      rewatchTimer = null;
    }
    if (engine.getState() === 'recording') get().stopDrive();
    await stopWatching();
    setBackgroundFixSink(() => undefined);
    await stopBackgroundUpdates().catch((e) =>
      driveLog('background.stop.FAILED', { message: String(e) }),
    );
  },
}));

type Set = (partial: Partial<LiveState>) => void;
type Get = () => LiveState & Actions;

function processFix(fix: Fix, set: Set, get: Get) {
  if (fix.t <= lastProcessedT) return; // dedupe foreground/background overlap
  lastProcessedT = fix.t;
  const events = engine.onFix(fix);
  handleEvents(events, set, get);
  // Parked, nothing changes fix to fix; a write would still wake every
  // subscriber once a second.
  const engineState = engine.getState();
  const speedMs = fix.speedMs ?? mps(0);
  const prev = get();
  if (prev.engineState !== engineState || prev.speedMs !== speedMs) set({ engineState, speedMs });
}

/**
 * Re-read the foreground permission and bring the watchers in line with it.
 * Runs at init, on every return to the foreground, and after the location
 * stream fails — so a grant, a revocation or a Precise Location change made in
 * Settings takes effect without a relaunch or another tap.
 */
async function syncPermission(set: Set, get: Get): Promise<void> {
  if (isShutDown) return;
  const response = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (!response) return;
  const access = readLocationAccess(response);
  set(access);
  if (access.permission === 'granted') await startWatching(set, get);
  else await stopWatching();
}

/**
 * The Motion & Fitness dialog, settled. expo-sensors resolves only once the
 * person has answered (it waits on a CMPedometer query), and on Android it
 * resolves at once. Any failure is swallowed: motion is evidence for a run's
 * verification, not a condition for recording one.
 */
async function requestMotionPermission(): Promise<void> {
  try {
    await DeviceMotion.requestPermissionsAsync();
  } catch {
    // Recording goes on without it; see above.
  }
}

/** Whether the Motion & Fitness dialog has been answered, either way. */
async function motionAnswered(): Promise<boolean> {
  try {
    const { status } = await DeviceMotion.getPermissionsAsync();
    return status !== 'undetermined';
  } catch {
    return false;
  }
}

/**
 * `interactive` is true only for an arm the user asked for with a tap. On
 * Android, watchPositionAsync otherwise reopens the "turn on device location"
 * dialog on every passive re-arm — and declining it pauses and resumes the
 * activity, which fires AppState 'active', which re-arms: an endless loop.
 */
function startWatching(set: Set, get: Get, interactive = false): Promise<void> {
  return enqueueWatchOp(() => armWatchers(set, get, interactive));
}

function stopWatching(): Promise<void> {
  return enqueueWatchOp(disarmWatchers);
}

function enqueueWatchOp(op: () => Promise<void> | void): Promise<void> {
  watchOps = watchOps
    .then(op)
    .catch((e) => driveLog('watch.FAILED', { message: String(e) }));
  return watchOps;
}

function disarmWatchers(): void {
  watcher?.remove();
  watcher = null;
  for (const sub of sensorSubs) sub.remove();
  sensorSubs = [];
  // The background task can still be feeding a drive, and it stamps each fix
  // with these. Left set, every fix until the re-arm would carry the last
  // sample from before the teardown — an invented reading, not a missing one.
  latestAccel = null;
  latestPressure = null;
}

/**
 * The location stream ended on an error. On iOS any CLError other than
 * "location unknown" — Location Services switched off, access set to Never —
 * finishes the native stream for good, and the old code never noticed: the
 * dead `watcher` stayed non-null, so it was never re-created, auto-start went
 * quiet and a manual drive recorded nothing until the app was killed.
 *
 * Tear down at once, then re-check after a pause rather than immediately, so
 * an error that repeats cannot spin. Returning to the foreground re-checks
 * sooner via the AppState listener.
 */
function onWatchError(reason: string, set: Set, get: Get): void {
  driveLog('watch.error', { message: reason });
  void stopWatching();
  if (rewatchTimer) return;
  rewatchTimer = setTimeout(() => {
    rewatchTimer = null;
    void syncPermission(set, get);
  }, REWATCH_DELAY_MS);
}

async function armWatchers(set: Set, get: Get, interactive: boolean): Promise<void> {
  if (watcher || isShutDown) return;

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

  /*
   * DeviceMotion, not Accelerometer, and the difference is the whole fix.
   *
   * Accelerometer reports TOTAL proper acceleration — the vehicle's motion plus
   * the 1 g of gravity the device is always resisting. Its magnitude therefore
   * reads ~1.0 on a parked car, and every G-force figure was inflated by an
   * amount that varied with device orientation, so it could not be subtracted
   * back out afterwards.
   *
   * DeviceMotion.acceleration is CoreMotion's userAcceleration: gravity already
   * removed by sensor fusion, ~0 at rest. It is reported in m/s^2 rather than
   * multiples of g, which is why it is converted here — the brands make that
   * conversion impossible to forget, since MetresPerSecondSq is not assignable
   * to GForce.
   *
   * CONVENTION, stored and re-derived server-side: Fix.accelX/Y/Z are USER
   * acceleration in multiples of g, gravity excluded. A parked car reads ~0.
   *
   * `acceleration` is null on devices without the fused sensor, in which case
   * no IMU sample is recorded rather than a wrong one being invented.
   */
  // Arming starts at the low rate, so the tracked rate must say so. Since the
  // watchers can now be re-armed mid-drive, it could still read 10 from before
  // the teardown — and the next hard pull, matching it, never asked for the
  // high rate back.
  currentImuHz = 1;
  if (get().imuHz !== 1) set({ imuHz: 1 });
  DeviceMotion.setUpdateInterval(IMU_INTERVAL_MS.low);
  const motion = DeviceMotion.addListener((m) => {
    const a = m.acceleration;
    if (!a) {
      latestAccel = null;
      return;
    }
    latestAccel = {
      x: ms2ToG(mps2(a.x)),
      y: ms2ToG(mps2(a.y)),
      z: ms2ToG(mps2(a.z)),
    };

    const mag = gForce(
      Math.sqrt(latestAccel.x ** 2 + latestAccel.y ** 2 + latestAccel.z ** 2),
    );
    const hz = engine.desiredImuHz(mag);
    if (hz !== currentImuHz) {
      currentImuHz = hz;
      DeviceMotion.setUpdateInterval(hz === 10 ? IMU_INTERVAL_MS.high : IMU_INTERVAL_MS.low);
      // Observable on the drive HUD when the debug readout is on, so the
      // adaptive rate can be confirmed on a real road rather than assumed.
      set({ imuHz: hz, lastAccelG: mag });
    } else if (useProfile.getState().debugHud) {
      // Only the debug readout shows this, and every store write wakes every
      // subscriber — at up to 10 Hz, on the thread appending fixes to the WAL.
      set({ lastAccelG: mag });
    }
  });
  // The barometer is CoreMotion's altimeter, and starting it is what raises
  // the Motion & Fitness dialog when nobody has asked yet. A passive arm (a
  // launch, a return to the foreground) must not: the dialog lands on
  // whatever screen is up, unexplained. requestPermissions asks first, from
  // the location step that says why; until it has, fixes carry no pressure.
  // DeviceMotion needs no permission and always runs.
  const barometer =
    interactive || (await motionAnswered())
      ? Barometer.addListener((s) => {
          latestPressure = s.pressure;
        })
      : null;
  sensorSubs = barometer ? [motion, barometer] : [motion];

  try {
    watcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
        mayShowUserSettingsDialog: interactive,
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
      (reason) => onWatchError(reason, set, get),
    );
  } catch (e) {
    // Don't leave the sensors armed around a location stream that never started.
    disarmWatchers();
    throw e;
  }
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
      driveLog('drive.start', { driveId: id, trigger: ev.type });
      set({
        driveId: id,
        startedAt: ev.at,
        distanceM: metres(0),
        engineState: engine.getState(),
        lastDiscardedAt: null,
      });
      // Keep fixes flowing with the screen off. No-op without background permission.
      startBackgroundUpdates()
        .then(() => driveLog('background.started'))
        .catch((e) => driveLog('background.FAILED', { message: String(e) }));
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
      const summary = wal.closeDrive(id, ev.at);
      stopBackgroundUpdates()
        .then(() => driveLog('background.stopped'))
        .catch((e) => driveLog('background.stop.FAILED', { message: String(e) }));
      if (!summary) {
        // Nothing usable reached the WAL — Start then End before a fix, or a
        // session indoors where every fix failed the accuracy gate. Discarded,
        // not saved as a zero drive: no row, no streak day, nothing to sync.
        driveLog('drive.discarded', { driveId: id });
        set({
          driveId: null,
          startedAt: null,
          lastDiscardedAt: ev.at,
          engineState: engine.getState(),
          speedMs: mps(0),
        });
        continue;
      }
      // The one line worth reading after a drive that behaved oddly: distance,
      // duration, top speed, peak g and the 0-60, all scrubbed of position.
      driveLog('drive.end', {
        driveId: id,
        distanceM: Math.round(summary.distanceM),
        durationS: Math.round(summary.durationS),
        maxSpeedMs: Number(summary.maxSpeedMs.toFixed(2)),
        maxG: summary.maxG != null ? Number(summary.maxG.toFixed(3)) : null,
        zeroTo60S: summary.zeroTo60S != null ? Number(summary.zeroTo60S.toFixed(2)) : null,
        imuHz: currentImuHz,
      });
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
