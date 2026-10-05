/**
 * Version 2 of the persisted profile: the terms acceptance, and the debug HUD
 * held to development builds.
 *
 * The upgrade is the risk, as it was for v1 (profile-v2.test.ts): every
 * TestFlight driver has a v1 profile, and the App Store build installs over
 * it. A v1 profile must come through still onboarded, with no terms
 * acceptance it never gave. And a TestFlight build could switch the debug HUD
 * on, so a release build must not let that stored `true` back in.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as ProfileModule from '../profile';
import { migrateProfile, PROFILE_VERSION, useProfile } from '../profile';

/** A finished onboarding as the v1 (onboarding v2) build persisted it. */
const V1_STATE = {
  onboarded: true,
  unitPref: 'metric',
  country: 'GG',
  vehicleKind: 'car',
  vehicleMake: 'Toyota',
  vehicleModel: 'GR86',
  vehicleId: '6f1c1d2e-0000-4000-8000-000000000002',
  username: 'tobym',
  usernameTaken: false,
  safetyAccepted: true,
  debugHud: true,
  nickname: 'Hachi',
  extraVehicles: [],
  vehiclePhotoUri: null,
  focus: 'zeroToSixty',
  attribution: 'friend',
};

/** Lets createJSONStorage's asynchronous write land. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  useProfile.getState().reset();
  await AsyncStorage.clear();
});

describe('migrateProfile, v1 to v2', () => {
  test('adds termsAcceptedAt as null and keeps everything else', () => {
    expect(PROFILE_VERSION).toBe(2);
    expect(migrateProfile(V1_STATE, 1)).toEqual({ ...V1_STATE, termsAcceptedAt: null });
  });

  test('an earlier safety acknowledgement is not taken as agreement to the terms', () => {
    expect(migrateProfile({ ...V1_STATE, safetyAccepted: true }, 1).termsAcceptedAt).toBeNull();
  });

  test('never overwrites a value it was given', () => {
    const at = '2026-10-01T12:00:00.000Z';
    expect(migrateProfile({ ...V1_STATE, termsAcceptedAt: at }, 1).termsAcceptedAt).toBe(at);
  });

  test('a v1 profile rehydrates still onboarded, with no acceptance', async () => {
    await AsyncStorage.setItem('gapped-profile', JSON.stringify({ state: V1_STATE, version: 1 }));

    await useProfile.persist.rehydrate();

    const s = useProfile.getState();
    expect(s.onboarded).toBe(true);
    expect(s.username).toBe('tobym');
    expect(s.focus).toBe('zeroToSixty');
    expect(s.safetyAccepted).toBe(true);
    expect(s.termsAcceptedAt).toBeNull();
  });
});

describe('acceptTerms', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('records the moment as an ISO timestamp', () => {
    jest.useFakeTimers({ now: new Date('2026-10-05T08:30:00.000Z') });
    useProfile.getState().acceptTerms();
    expect(useProfile.getState().termsAcceptedAt).toBe('2026-10-05T08:30:00.000Z');
  });

  test('agreeing again records the latest agreement', () => {
    jest.useFakeTimers({ now: new Date('2026-10-05T08:30:00.000Z') });
    useProfile.getState().acceptTerms();
    jest.setSystemTime(new Date('2026-10-05T08:31:00.000Z'));
    useProfile.getState().acceptTerms();
    expect(useProfile.getState().termsAcceptedAt).toBe('2026-10-05T08:31:00.000Z');
  });

  test('is persisted, and comes back on the next launch', async () => {
    useProfile.getState().acceptTerms();
    const at = useProfile.getState().termsAcceptedAt;
    await flush();

    const raw = (await AsyncStorage.getItem('gapped-profile')) ?? '{}';
    const stored = JSON.parse(raw);
    expect(stored.version).toBe(PROFILE_VERSION);
    expect(stored.state.termsAcceptedAt).toBe(at);

    // A cold start: the store at first-run values, the stored copy read back.
    useProfile.getState().reset();
    await flush();
    await AsyncStorage.setItem('gapped-profile', raw);
    await useProfile.persist.rehydrate();
    expect(useProfile.getState().termsAcceptedAt).toBe(at);
  });

  test('is independent of the safety acknowledgement', () => {
    useProfile.getState().acceptTerms();
    expect(useProfile.getState().safetyAccepted).toBe(false);
  });

  test('account deletion clears it', () => {
    useProfile.getState().acceptTerms();
    useProfile.getState().reset();
    expect(useProfile.getState().termsAcceptedAt).toBeNull();
  });
});

describe('debug HUD, development build (INTERNAL_TOOLS on, as under jest)', () => {
  test('toggles', () => {
    useProfile.getState().toggleDebugHud();
    expect(useProfile.getState().debugHud).toBe(true);
    useProfile.getState().toggleDebugHud();
    expect(useProfile.getState().debugHud).toBe(false);
  });

  test('a stored true survives rehydration', async () => {
    await AsyncStorage.setItem(
      'gapped-profile',
      JSON.stringify({ state: { ...V1_STATE, termsAcceptedAt: null }, version: PROFILE_VERSION }),
    );
    await useProfile.persist.rehydrate();
    expect(useProfile.getState().debugHud).toBe(true);
  });
});

describe('debug HUD, release build (INTERNAL_TOOLS off)', () => {
  /**
   * The store and its storage, loaded fresh with the flag off. The storage
   * comes from the same registry, so it is the instance the store writes to.
   */
  function loadReleaseProfile(): {
    store: typeof ProfileModule.useProfile;
    storage: typeof AsyncStorage;
  } {
    let store: typeof ProfileModule.useProfile | undefined;
    let storage: typeof AsyncStorage | undefined;
    jest.isolateModules(() => {
      jest.doMock('@/config/flags', () => ({
        ...jest.requireActual<typeof import('@/config/flags')>('@/config/flags'),
        INTERNAL_TOOLS: false,
      }));
      // The jest mock (jest.setup.js) is the module itself, not a default export.
      const mod = jest.requireMock<{ default?: typeof AsyncStorage } & typeof AsyncStorage>(
        '@react-native-async-storage/async-storage',
      );
      storage = mod.default ?? mod;
      // Actual, as the recorder tests load theirs: the store itself is never
      // mocked, only the flag it reads.
      store = jest.requireActual<typeof ProfileModule>('../profile').useProfile;
    });
    return { store: store!, storage: storage! };
  }

  afterEach(() => {
    jest.dontMock('@/config/flags');
  });

  test('a TestFlight install that left it on rehydrates with it off', async () => {
    const { store, storage } = loadReleaseProfile();
    await storage.setItem('gapped-profile', JSON.stringify({ state: V1_STATE, version: 1 }));

    await store.persist.rehydrate();

    const s = store.getState();
    expect(s.debugHud).toBe(false);
    // Nothing else is touched on the way.
    expect(s.onboarded).toBe(true);
    expect(s.username).toBe('tobym');
  });

  test('the toggle cannot turn it on', () => {
    const { store } = loadReleaseProfile();
    store.getState().toggleDebugHud();
    expect(store.getState().debugHud).toBe(false);
  });
});
