/**
 * Onboarding v2 added five fields to the persisted profile and, with them, the
 * store's first `version`. The risk is not in the setters; it is in the
 * upgrade. zustand throws away stored state whose version does not match when
 * there is no migrate to call, and an existing driver with no stored state is a
 * driver with `onboarded: false` — the Stack.Protected guard would put a
 * finished profile back through onboarding and their username, car and
 * country would be gone from the device.
 *
 * These tests write a profile the way the previous build stored it (no version
 * field, so zustand reads it as 0) and rehydrate it through the real persist
 * middleware.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateProfile, PROFILE_VERSION, useProfile } from '../profile';

/** A finished onboarding as the unversioned build persisted it. */
const V0_STATE = {
  onboarded: true,
  unitPref: 'imperial',
  country: 'GB',
  vehicleKind: 'car',
  vehicleMake: 'BMW',
  vehicleModel: '1M',
  vehicleId: '6f1c1d2e-0000-4000-8000-000000000001',
  username: 'tobym',
  usernameTaken: false,
  safetyAccepted: true,
  debugHud: true,
};

beforeEach(async () => {
  useProfile.getState().reset();
  await AsyncStorage.clear();
});

describe('migrateProfile', () => {
  test('v0 keeps every existing field and adds the new ones at first-run values', () => {
    expect(migrateProfile(V0_STATE, 0)).toEqual({
      ...V0_STATE,
      nickname: null,
      extraVehicles: [],
      vehiclePhotoUri: null,
      focus: null,
      attribution: null,
      termsAcceptedAt: null,
    });
  });

  test('a field the migration does not know survives it', () => {
    expect(migrateProfile({ ...V0_STATE, somethingNewer: 1 }, 0)).toMatchObject({
      somethingNewer: 1,
    });
  });

  test('nothing stored migrates to first-run values, not a crash', () => {
    expect(migrateProfile(undefined, 0)).toMatchObject({ extraVehicles: [], focus: null });
  });

  test('the current version passes through untouched', () => {
    const current = {
      ...V0_STATE,
      nickname: 'Hachi',
      focus: 'topSpeed',
      termsAcceptedAt: '2026-10-05T09:00:00.000Z',
    };
    expect(migrateProfile(current, PROFILE_VERSION)).toEqual(current);
  });
});

describe('upgrading an installed profile', () => {
  test('a v0 profile rehydrates intact, still onboarded', async () => {
    await AsyncStorage.setItem('gapped-profile', JSON.stringify({ state: V0_STATE, version: 0 }));

    await useProfile.persist.rehydrate();

    const s = useProfile.getState();
    expect(s.onboarded).toBe(true);
    expect(s.username).toBe('tobym');
    expect(s.country).toBe('GB');
    expect(s.vehicleMake).toBe('BMW');
    expect(s.vehicleModel).toBe('1M');
    expect(s.vehicleId).toBe(V0_STATE.vehicleId);
    expect(s.safetyAccepted).toBe(true);
    expect(s.nickname).toBeNull();
    expect(s.extraVehicles).toEqual([]);
    expect(s.focus).toBeNull();
    expect(s.attribution).toBeNull();
    expect(s.termsAcceptedAt).toBeNull();
  });

  test('the next write stores the new version', async () => {
    useProfile.getState().setFocus('beatFriends');
    // createJSONStorage writes asynchronously.
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse((await AsyncStorage.getItem('gapped-profile')) ?? '{}');
    expect(stored.version).toBe(PROFILE_VERSION);
    expect(stored.state.focus).toBe('beatFriends');
  });
});

describe('onboarding v2 setters', () => {
  test('nickname is trimmed, and blank means none', () => {
    const p = useProfile.getState();
    p.setNickname('  Hachi  ');
    expect(useProfile.getState().nickname).toBe('Hachi');
    p.setNickname('   ');
    expect(useProfile.getState().nickname).toBeNull();
    p.setNickname(null);
    expect(useProfile.getState().nickname).toBeNull();
  });

  test('extra vehicles get their own ids and can be removed one at a time', () => {
    const p = useProfile.getState();
    const a = p.addExtraVehicle({ kind: 'car', make: 'Mazda', model: 'MX-5' });
    const b = p.addExtraVehicle({ kind: 'motorbike', make: 'Honda', model: 'CBR600RR' });
    expect(a).not.toBe(b);
    expect(useProfile.getState().extraVehicles.map((v) => v.id)).toEqual([a, b]);

    useProfile.getState().removeExtraVehicle(a);
    expect(useProfile.getState().extraVehicles).toEqual([
      { id: b, kind: 'motorbike', make: 'Honda', model: 'CBR600RR' },
    ]);
  });

  test('switching kind drops the main vehicle, its nickname and photo, not the garage', () => {
    const p = useProfile.getState();
    p.setVehicleKind('car');
    p.setVehicle('Toyota', 'GR86');
    p.setNickname('Hachi');
    p.setVehiclePhotoUri('file:///gr86.jpg');
    p.addExtraVehicle({ kind: 'car', make: 'Mazda', model: 'MX-5' });

    useProfile.getState().setVehicleKind('motorbike');

    const s = useProfile.getState();
    expect(s.vehicleMake).toBeNull();
    expect(s.vehicleId).toBeNull();
    expect(s.nickname).toBeNull();
    expect(s.vehiclePhotoUri).toBeNull();
    expect(s.extraVehicles).toHaveLength(1);
  });

  test('a make/model correction within one kind keeps the nickname and photo', () => {
    const p = useProfile.getState();
    p.setVehicleKind('car');
    p.setVehicle('BMW', '1 Series');
    p.setNickname('Baby M');
    p.setVehiclePhotoUri('file:///1m.jpg');

    useProfile.getState().setVehicle('BMW', '1M');

    expect(useProfile.getState().nickname).toBe('Baby M');
    expect(useProfile.getState().vehiclePhotoUri).toBe('file:///1m.jpg');
  });

  test('focus and attribution store their keys', () => {
    useProfile.getState().setFocus('localRanking');
    useProfile.getState().setAttribution('reddit');
    expect(useProfile.getState().focus).toBe('localRanking');
    expect(useProfile.getState().attribution).toBe('reddit');
  });
});
