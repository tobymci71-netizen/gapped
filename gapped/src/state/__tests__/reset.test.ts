/**
 * Account deletion must return the app to a genuine first-run state.
 *
 * The App Store reviewer deletes the account and expects the app to look like a
 * fresh install. More importantly, a half-wiped store is how a deleted user's
 * username, country or personal bests survive on the device after the server
 * row is gone.
 *
 * The failure mode these guard against is drift, not logic: the wipe used to
 * re-list the profile's nine fields by hand at the call site in settings.tsx,
 * so adding a tenth field to the store would have left it surviving a "full"
 * deletion with nothing to catch it. `reset()` now spreads the same INITIAL the
 * store is created from, and these tests fail if any field is left behind.
 */

import { useProfile } from '../profile';
import { EMPTY_PBS, useRecords } from '../records';
import { metres, mps, seconds } from '@/types/units';

describe('useProfile.reset', () => {
  test('every field returns to its first-run value', () => {
    // Populate the store the way a real onboarded user would.
    const p = useProfile.getState();
    p.setUnitPref('imperial');
    p.setCountry('GG');
    p.setVehicleKind('car');
    p.setVehicle('BMW', '1M');
    p.setUsername('tobym');
    p.setNickname('Hachi');
    p.addExtraVehicle({ kind: 'motorbike', make: 'Honda', model: 'CBR600RR' });
    p.setVehiclePhotoUri('file:///car.jpg');
    p.setFocus('zeroToSixty');
    p.setAttribution('friend');
    p.acceptSafety();
    p.completeOnboarding();

    // Sanity: the fixture actually took, so a passing reset means something.
    expect(useProfile.getState().username).toBe('tobym');
    expect(useProfile.getState().onboarded).toBe(true);

    useProfile.getState().reset();

    const after = useProfile.getState();
    expect(after.onboarded).toBe(false);
    expect(after.unitPref).toBe('metric');
    expect(after.country).toBeNull();
    expect(after.vehicleKind).toBeNull();
    expect(after.vehicleMake).toBeNull();
    expect(after.vehicleModel).toBeNull();
    expect(after.vehicleId).toBeNull();
    expect(after.username).toBeNull();
    expect(after.safetyAccepted).toBe(false);
    expect(after.nickname).toBeNull();
    expect(after.extraVehicles).toEqual([]);
    expect(after.vehiclePhotoUri).toBeNull();
    expect(after.focus).toBeNull();
    expect(after.attribution).toBeNull();
  });

  test('no non-function field is left holding a value', () => {
    // Drift guard. Enumerates the store rather than naming fields, so a field
    // added to ProfileData but forgotten in INITIAL fails here even though the
    // test above still passes.
    const p = useProfile.getState();
    p.setUsername('tobym');
    p.setCountry('JE');
    p.addExtraVehicle({ kind: 'car', make: 'Mazda', model: 'MX-5' });
    p.completeOnboarding();
    useProfile.getState().reset();

    // An empty list is a first-run value too (extraVehicles).
    const leftovers = Object.entries(useProfile.getState())
      .filter(([, v]) => typeof v !== 'function')
      .filter(([, v]) => v !== null && v !== false && v !== 'metric')
      .filter(([, v]) => !(Array.isArray(v) && v.length === 0));

    expect(leftovers).toEqual([]);
  });
});

describe('useRecords.reset', () => {
  test('personal bests and streak days are cleared', () => {
    useRecords.getState().recordDrive({
      startedAt: 1_700_000_000_000 as never,
      endedAt: 1_700_000_060_000 as never,
      distanceM: metres(5000),
      durationS: seconds(300),
      maxSpeedMs: mps(40),
      avgSpeedMs: mps(16),
      maxG: null,
      avgG: null,
      zeroTo60S: seconds(5.2),
    } as never);

    expect(useRecords.getState().driveDays.length).toBeGreaterThan(0);

    useRecords.getState().reset();

    expect(useRecords.getState().pbs).toEqual(EMPTY_PBS);
    expect(useRecords.getState().driveDays).toEqual([]);
  });
});
