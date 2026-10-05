/**
 * The recorder's watcher lifecycle: the orphaned background session stopped at
 * cold start, the foreground stream torn down and re-armed after an error, and
 * permission — foreground and background — re-read on every return from
 * Settings.
 *
 * The platform modules are replaced by small fakes that record what was asked
 * of them. Each test loads a fresh recorder, because the watcher, the sensor
 * subscriptions and the AppState listener are module state by design.
 */

import type * as Recorder from '../recorder';

type Fn = (...args: never[]) => unknown;
type Watcher = { onError?: (reason: string) => void; removed: boolean };

const GRANTED = {
  status: 'granted',
  canAskAgain: true,
  granted: true,
  expires: 'never',
  ios: { scope: 'whenInUse', accuracy: 'full' },
};
const DENIED_FOR_GOOD = {
  status: 'denied',
  canAskAgain: false,
  granted: false,
  expires: 'never',
};

const mockLocation = {
  fg: GRANTED as object,
  /** What getBackgroundPermissionsAsync answers, or an Error it throws. */
  bg: { status: 'denied' } as { status: string } | Error,
  /** What requestBackgroundPermissionsAsync answers, or an Error it throws. */
  bgAnswer: { status: 'denied' } as { status: string } | Error,
  bgRunning: false,
  /** Order of the calls that matter: background stop vs foreground watch. */
  calls: [] as string[],
  watchers: [] as Watcher[],
  /** mayShowUserSettingsDialog per watch, i.e. may Android show its dialog. */
  dialogs: [] as (boolean | undefined)[],
};
const mockSensors = {
  motion: [] as Fn[],
  baro: [] as Fn[],
  intervals: [] as number[],
  motionPermissionFails: false,
  /** CoreMotion's answer so far: 'undetermined' until the dialog is answered. */
  motionStatus: 'granted' as 'granted' | 'denied' | 'undetermined',
};
const mockAppState = { listeners: [] as ((s: string) => void)[] };
const mockTasks: Record<string, (body: { data: unknown; error: unknown }) => Promise<void>> = {};
const mockRuns: { sql: string; params: unknown[] }[] = [];

jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6, Balanced: 3 },
  ActivityType: { AutomotiveNavigation: 2 },
  getForegroundPermissionsAsync: async () => mockLocation.fg,
  requestForegroundPermissionsAsync: async () => mockLocation.fg,
  requestBackgroundPermissionsAsync: async () => {
    mockLocation.calls.push('backgroundPermission');
    if (mockLocation.bgAnswer instanceof Error) throw mockLocation.bgAnswer;
    return mockLocation.bgAnswer;
  },
  getBackgroundPermissionsAsync: async () => {
    if (mockLocation.bg instanceof Error) throw mockLocation.bg;
    return mockLocation.bg;
  },
  hasStartedLocationUpdatesAsync: async () => mockLocation.bgRunning,
  stopLocationUpdatesAsync: async () => {
    mockLocation.calls.push('stopBackground');
    mockLocation.bgRunning = false;
  },
  startLocationUpdatesAsync: async () => {
    mockLocation.bgRunning = true;
  },
  watchPositionAsync: async (
    o: { mayShowUserSettingsDialog?: boolean },
    _cb: unknown,
    onError?: (r: string) => void,
  ) => {
    mockLocation.calls.push('watch');
    mockLocation.dialogs.push(o.mayShowUserSettingsDialog);
    const w: Watcher = { onError, removed: false };
    mockLocation.watchers.push(w);
    return {
      remove: () => {
        w.removed = true;
      },
    };
  },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: (name: string, fn: (body: { data: unknown; error: unknown }) => Promise<void>) => {
    mockTasks[name] = fn;
  },
}));

jest.mock('expo-sensors', () => {
  const listen = (key: 'motion' | 'baro') => (fn: Fn) => {
    mockSensors[key].push(fn);
    return {
      remove: () => {
        mockSensors[key] = mockSensors[key].filter((f) => f !== fn);
      },
    };
  };
  return {
    DeviceMotion: {
      setUpdateInterval: (ms: number) => mockSensors.intervals.push(ms),
      addListener: listen('motion'),
      requestPermissionsAsync: async () => {
        mockLocation.calls.push('motionPermission');
        if (mockSensors.motionPermissionFails) throw new Error('no CoreMotion');
        mockSensors.motionStatus = 'granted';
        return { status: 'granted' };
      },
      getPermissionsAsync: async () => ({ status: mockSensors.motionStatus }),
    },
    Barometer: { addListener: listen('baro') },
  };
});

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => undefined,
    runSync: (sql: string, params: unknown[]) => {
      mockRuns.push({ sql, params });
    },
    getAllSync: () => [],
    getFirstSync: () => null,
  }),
}));

jest.mock('@/lib/log', () => ({ driveLog: () => undefined }));
jest.mock('@/lib/sync', () => ({ syncFinalizedDrives: async () => undefined }));

/** A fresh recorder, with its own watcher, subscriptions and AppState listener. */
function loadRecorder(): typeof Recorder {
  let mod: typeof Recorder | undefined;
  jest.isolateModules(() => {
    // The same instance the recorder is about to import in this registry.
    const { AppState } = jest.requireActual<typeof import('react-native')>('react-native');
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, fn) => {
      mockAppState.listeners.push(fn as (s: string) => void);
      return { remove: () => undefined };
    });
    mod = jest.requireActual<typeof Recorder>('../recorder');
  });
  return mod as typeof Recorder;
}

/** Let the serial watcher chain and any awaited native calls settle. */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function returnToForeground() {
  for (const l of mockAppState.listeners) l('active');
}

/** One DeviceMotion sample: x m/s², gravity already removed. */
function motion(x: number) {
  for (const l of mockSensors.motion) l({ acceleration: { x, y: 0, z: 0 } } as never);
}

const lastInterval = () => mockSensors.intervals[mockSensors.intervals.length - 1];
const liveWatchers = () => mockLocation.watchers.filter((w) => !w.removed);

beforeEach(() => {
  jest.useFakeTimers();
  mockLocation.fg = GRANTED;
  mockLocation.bg = { status: 'denied' };
  mockLocation.bgAnswer = { status: 'denied' };
  mockLocation.bgRunning = false;
  mockLocation.calls = [];
  mockLocation.watchers = [];
  mockLocation.dialogs = [];
  mockSensors.motion = [];
  mockSensors.baro = [];
  mockSensors.intervals = [];
  mockSensors.motionPermissionFails = false;
  mockSensors.motionStatus = 'granted';
  mockAppState.listeners = [];
  mockRuns.length = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('cold start', () => {
  test('a background session the last process left running is stopped before anything arms', async () => {
    mockLocation.bgRunning = true;
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();

    expect(mockLocation.bgRunning).toBe(false);
    expect(mockLocation.calls).toEqual(['stopBackground', 'watch']);
  });

  test('it is stopped even when foreground access is gone, since the restored task runs regardless', async () => {
    mockLocation.bgRunning = true;
    mockLocation.fg = DENIED_FOR_GOOD;
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();

    expect(mockLocation.bgRunning).toBe(false);
    expect(mockLocation.calls).toEqual(['stopBackground']);
    expect(useDriveStore.getState().permission).toBe('denied');
    expect(useDriveStore.getState().canAskAgain).toBe(false);
  });
});

describe('location stream error', () => {
  test('tears the watchers down, then re-arms once after the pause without stacking listeners', async () => {
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();
    expect(liveWatchers()).toHaveLength(1);
    expect(mockSensors.motion).toHaveLength(1);
    expect(mockSensors.baro).toHaveLength(1);

    mockLocation.watchers[0].onError?.('kCLErrorDenied');
    await settle();
    expect(liveWatchers()).toHaveLength(0);
    expect(mockSensors.motion).toHaveLength(0);
    expect(mockSensors.baro).toHaveLength(0);

    jest.advanceTimersByTime(3000);
    await settle();
    expect(mockLocation.watchers).toHaveLength(2);
    expect(liveWatchers()).toHaveLength(1);
    expect(mockSensors.motion).toHaveLength(1);
    expect(mockSensors.baro).toHaveLength(1);
  });

  test('re-arming starts the IMU at the low rate and can still ask for the high one', async () => {
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();
    useDriveStore.getState().startDrive();

    motion(4); // ~0.41 g: a hard pull while recording wants 10 Hz
    expect(useDriveStore.getState().imuHz).toBe(10);
    expect(lastInterval()).toBe(100);

    mockLocation.watchers[0].onError?.('kCLErrorDenied');
    await settle();
    jest.advanceTimersByTime(3000);
    await settle();
    expect(useDriveStore.getState().imuHz).toBe(1);
    expect(lastInterval()).toBe(1000);

    // The tracked rate used to survive the re-arm at 10, so this matched it
    // and the sensor stayed at 1 Hz through the pull.
    motion(4);
    expect(lastInterval()).toBe(100);
    expect(useDriveStore.getState().imuHz).toBe(10);
  });

  test('while the sensors are down, background fixes carry no IMU sample rather than a stale one', async () => {
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();
    useDriveStore.getState().startDrive();
    motion(4);

    const task = mockTasks['gapped-background-location'];
    const fixAt = (t: number) => ({
      data: {
        locations: [
          {
            timestamp: t,
            coords: { latitude: 51.5, longitude: -0.1, speed: 10, accuracy: 5, altitude: null, heading: 90 },
          },
        ],
      },
      error: null,
    });
    const lastAccelX = () =>
      mockRuns.filter((r) => r.sql.includes('INSERT INTO wal_fixes')).pop()?.params[9];

    await task(fixAt(1_700_000_000_000));
    expect(lastAccelX()).toBeCloseTo(4 / 9.80665, 3);

    mockLocation.watchers[0].onError?.('kCLErrorDenied');
    await settle();
    await task(fixAt(1_700_000_001_000));
    expect(lastAccelX()).toBeNull();
  });
});

describe('return from Settings', () => {
  test('a revocation disarms; a grant, even approximate, re-arms without another tap', async () => {
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();
    expect(liveWatchers()).toHaveLength(1);

    mockLocation.fg = DENIED_FOR_GOOD;
    returnToForeground();
    await settle();
    expect(useDriveStore.getState().permission).toBe('denied');
    expect(liveWatchers()).toHaveLength(0);
    expect(mockSensors.motion).toHaveLength(0);

    mockLocation.fg = { ...GRANTED, ios: { scope: 'whenInUse', accuracy: 'reduced' } };
    returnToForeground();
    await settle();
    expect(useDriveStore.getState().permission).toBe('granted');
    expect(useDriveStore.getState().precise).toBe(false);
    expect(liveWatchers()).toHaveLength(1);
    expect(mockSensors.motion).toHaveLength(1);
  });

  test('two returns in a row arm one watcher, not two', async () => {
    const { useDriveStore } = loadRecorder();
    mockLocation.fg = DENIED_FOR_GOOD;
    await useDriveStore.getState().init();
    await settle();

    mockLocation.fg = GRANTED;
    returnToForeground();
    returnToForeground();
    await settle();
    expect(liveWatchers()).toHaveLength(1);
    expect(mockSensors.motion).toHaveLength(1);
  });

  test('the AppState listener is registered once, however often init runs', async () => {
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await useDriveStore.getState().init();
    expect(mockAppState.listeners).toHaveLength(1);
  });
});

describe('background ("Always") permission', () => {
  test('starts undetermined, and init reads it alongside foreground', async () => {
    mockLocation.bg = { status: 'granted' };
    const { useDriveStore } = loadRecorder();
    expect(useDriveStore.getState().backgroundPermission).toBe('undetermined');

    await useDriveStore.getState().init();
    await settle();
    expect(useDriveStore.getState().permission).toBe('granted');
    expect(useDriveStore.getState().backgroundPermission).toBe('granted');
  });

  test('While Using in a later process reads undetermined, which is still not granted', async () => {
    mockLocation.bg = { status: 'undetermined' };
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();
    expect(useDriveStore.getState().backgroundPermission).toBe('undetermined');
  });

  test('a change to Always in Settings shows on return, and back again', async () => {
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();
    expect(useDriveStore.getState().backgroundPermission).toBe('denied');

    mockLocation.bg = { status: 'granted' };
    returnToForeground();
    await settle();
    expect(useDriveStore.getState().backgroundPermission).toBe('granted');

    mockLocation.bg = { status: 'denied' };
    returnToForeground();
    await settle();
    expect(useDriveStore.getState().backgroundPermission).toBe('denied');
  });

  test('a failed background read keeps the last answer and still arms', async () => {
    mockLocation.bg = { status: 'granted' };
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();

    mockLocation.bg = new Error('no CoreLocation');
    returnToForeground();
    await settle();
    expect(useDriveStore.getState().backgroundPermission).toBe('granted');
    expect(liveWatchers()).toHaveLength(1);
  });

  test('the answer to the request is in the store before the request resolves', async () => {
    mockLocation.bgAnswer = { status: 'granted' };
    const { useDriveStore } = loadRecorder();
    await expect(useDriveStore.getState().requestPermissions()).resolves.toBe(true);
    expect(useDriveStore.getState().backgroundPermission).toBe('granted');
  });

  test('Keep Only While Using is stored as denied', async () => {
    mockLocation.bgAnswer = { status: 'denied' };
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().requestPermissions();
    expect(useDriveStore.getState().backgroundPermission).toBe('denied');
  });

  test('a request that throws falls back to reading the current answer, and still arms', async () => {
    mockLocation.bgAnswer = new Error('ERR_LOCATION_INFO_PLIST');
    mockLocation.bg = { status: 'undetermined' };
    const { useDriveStore } = loadRecorder();
    await expect(useDriveStore.getState().requestPermissions()).resolves.toBe(true);
    expect(useDriveStore.getState().backgroundPermission).toBe('undetermined');
    expect(liveWatchers()).toHaveLength(1);
  });

  test('readBackgroundPermission maps the three statuses', () => {
    const { readBackgroundPermission } = loadRecorder();
    expect(readBackgroundPermission({ status: 'granted' })).toBe('granted');
    expect(readBackgroundPermission({ status: 'denied' })).toBe('denied');
    expect(readBackgroundPermission({ status: 'undetermined' })).toBe('undetermined');
  });
});

describe("Android's turn-on-location dialog", () => {
  test('only the arm that follows a tap may show it; passive re-arms never do', async () => {
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();
    expect(mockLocation.dialogs).toEqual([false]);

    // Declining the dialog pauses and resumes the activity, firing 'active'.
    // Before, that re-armed with the dialog allowed: an endless loop.
    mockLocation.watchers[0].onError?.('location services off');
    await settle();
    returnToForeground();
    await settle();
    expect(mockLocation.dialogs).toEqual([false, false]);

    mockLocation.watchers[1].onError?.('location services off');
    await settle();
    await useDriveStore.getState().requestPermissions();
    await settle();
    expect(mockLocation.dialogs[mockLocation.dialogs.length - 1]).toBe(true);
  });
});

describe('requestPermissions', () => {
  // The Motion & Fitness dialog used to come from the barometer starting, after
  // this had resolved, so it landed on whatever screen onboarding showed next.
  // And nothing may be asked after background location: its request can
  // resolve with the dialog still up, and a later dialog pushes it aside.
  test('settles motion before resolving, and asks for background location last', async () => {
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().requestPermissions();

    expect(mockLocation.calls).toEqual(['motionPermission', 'backgroundPermission', 'watch']);
    expect(mockSensors.motion).toHaveLength(1);
  });

  test('a motion permission failure still arms recording', async () => {
    mockSensors.motionPermissionFails = true;
    const { useDriveStore } = loadRecorder();

    await expect(useDriveStore.getState().requestPermissions()).resolves.toBe(true);
    expect(liveWatchers()).toHaveLength(1);
  });

  // Starting the barometer is what raises the Motion & Fitness dialog, so an
  // arm nobody tapped for must leave it off until the question is answered.
  test('a launch arm leaves the barometer off while motion is unanswered', async () => {
    mockSensors.motionStatus = 'undetermined';
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();

    expect(liveWatchers()).toHaveLength(1);
    expect(mockSensors.motion).toHaveLength(1);
    expect(mockSensors.baro).toHaveLength(0);
  });

  test('the tapped request asks, then arms the barometer too', async () => {
    mockSensors.motionStatus = 'undetermined';
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().requestPermissions();
    await settle();

    expect(mockSensors.baro).toHaveLength(1);
  });

  test('a launch arm keeps the barometer once motion was refused', async () => {
    // Refused is answered: starting the altimeter raises nothing, it just
    // reports no samples.
    mockSensors.motionStatus = 'denied';
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();

    expect(mockSensors.baro).toHaveLength(1);
  });

  test('a location refusal asks for nothing else', async () => {
    mockLocation.fg = DENIED_FOR_GOOD;
    const { useDriveStore } = loadRecorder();

    await expect(useDriveStore.getState().requestPermissions()).resolves.toBe(false);
    expect(mockLocation.calls).toEqual([]);
  });
});

describe('shutdown (version-blocked build)', () => {
  test('ends the drive, stops every watcher and background GPS, and nothing re-arms', async () => {
    const { useDriveStore } = loadRecorder();
    await useDriveStore.getState().init();
    await settle();
    useDriveStore.getState().startDrive();
    mockLocation.bgRunning = true;

    await useDriveStore.getState().shutdown();
    await settle();
    expect(useDriveStore.getState().engineState).not.toBe('recording');
    expect(liveWatchers()).toHaveLength(0);
    expect(mockSensors.motion).toHaveLength(0);
    expect(mockLocation.bgRunning).toBe(false);

    returnToForeground();
    await useDriveStore.getState().requestPermissions();
    jest.advanceTimersByTime(3000);
    await settle();
    expect(liveWatchers()).toHaveLength(0);
    expect(mockSensors.motion).toHaveLength(0);
  });
});
