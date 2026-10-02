/**
 * Local profile + onboarding state, persisted to AsyncStorage.
 * Server sync happens later (anonymous-first); this store is the source of
 * truth for the client until then.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { canonicaliseCountry, type CountryCode } from '@/data/countries';
import { UnitPref } from '@/drive/units';
import { uuid } from '@/lib/ids';

export type VehicleKind = 'car' | 'motorbike';

type ProfileData = {
  onboarded: boolean;
  unitPref: UnitPref;
  /**
   * Canonical ISO 3166-1 alpha-2 (plus XK). Branded, so the only way to get a
   * value in here is through `canonicaliseCountry` — see setCountry.
   */
  country: CountryCode | null;
  vehicleKind: VehicleKind | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  /**
   * Stable local id for the chosen vehicle, minted when it is picked and
   * reused as the `vehicles` row id on the server. Drives record it at the
   * moment they start, so a drive stays attributed to the car that did it
   * even after the user switches rides.
   */
  vehicleId: string | null;
  username: string | null;
  /**
   * The server refused `username` because another driver already holds it.
   * Usernames are unique server-side and nothing checked that before this
   * flag existed, so the refusal used to vanish: the user's runs went up with
   * no name while the app kept showing them the one they picked. Set by sync,
   * cleared by choosing a new name or by the server accepting this one.
   */
  usernameTaken: boolean;
  safetyAccepted: boolean;
  /**
   * Shows the IMU debug readout on the drive HUD. Off by default. Exists
   * because the adaptive sampling rate and the gravity-removed G magnitude
   * cannot be confirmed from a simulator — they need a moving vehicle.
   */
  debugHud: boolean;

};

type ProfileState = ProfileData & {
  setUnitPref: (u: UnitPref) => void;
  /** Accepts any string; stores only a canonical code, or null. */
  setCountry: (c: string | null) => void;
  setVehicleKind: (k: VehicleKind) => void;
  setVehicle: (make: string, model: string) => void;
  setUsername: (u: string) => void;
  /**
   * Sync's verdict on the current username: true when the server refused it
   * as taken, false once it accepts it (a name refused at one launch can be
   * accepted at a later one, after its holder lets it go).
   */
  setUsernameTaken: (taken: boolean) => void;
  acceptSafety: () => void;
  toggleDebugHud: () => void;
  completeOnboarding: () => void;
  /** Returns the store to first-run state. Used by account deletion. */
  reset: () => void;
};

/**
 * The first-run state, named so that `reset()` and store creation cannot drift
 * apart. Account deletion previously re-listed these nine fields by hand at the
 * call site: adding a tenth field to the store would have left it surviving a
 * "full" wipe, with nothing to catch it.
 */
const INITIAL: ProfileData = {
  onboarded: false,
  unitPref: 'metric',
  country: null,
  vehicleKind: null,
  vehicleMake: null,
  vehicleModel: null,
  vehicleId: null,
  username: null,
  usernameTaken: false,
  safetyAccepted: false,
  debugHud: false,
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      ...INITIAL,

      setUnitPref: (unitPref) => set({ unitPref }),
      // Canonicalised here rather than at the call sites. This is the only
      // way a country enters the store, so normalising once at the setter
      // means no caller can introduce an alias — not the picker, not a
      // locale-derived default, not a future settings screen.
      setCountry: (country) => set({ country: canonicaliseCountry(country) }),
      // Changing kind clears the chosen vehicle. Keeping it left a car
      // selected as the motorbike with Continue already enabled — an invalid
      // vehicle is worse than losing one pick.
      setVehicleKind: (vehicleKind) =>
        set((s) =>
          s.vehicleKind === vehicleKind
            ? { vehicleKind }
            : { vehicleKind, vehicleMake: null, vehicleModel: null, vehicleId: null },
        ),
      // A new make/model is a different car, so it gets a new id — drives
      // already recorded keep pointing at the one that recorded them.
      setVehicle: (vehicleMake, vehicleModel) =>
        set((s) =>
          s.vehicleMake === vehicleMake && s.vehicleModel === vehicleModel && s.vehicleId
            ? s
            : { vehicleMake, vehicleModel, vehicleId: uuid() },
        ),
      // A new name has not been refused yet; whether it is free is the
      // server's call on the next sync, not something to carry over.
      setUsername: (username) => set({ username, usernameTaken: false }),
      // Every successful sync reports false; unchanged, it must not wake
      // every screen subscribed to the profile.
      setUsernameTaken: (usernameTaken) =>
        set((s) => (s.usernameTaken === usernameTaken ? s : { usernameTaken })),
      acceptSafety: () => set({ safetyAccepted: true }),
      toggleDebugHud: () => set((st) => ({ debugHud: !st.debugHud })),
      completeOnboarding: () => set({ onboarded: true }),
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'gapped-profile',
      storage: createJSONStorage(() => AsyncStorage),
      /**
       * Rehydration is the second write path into `country`, and it bypasses
       * `setCountry` entirely — zustand writes the persisted JSON straight
       * into state. A device that picked its country on an older build can
       * therefore carry a non-canonical code across an app update, and would
       * then push it to the server on next sync.
       *
       * Canonicalising on rehydrate closes that. It also means the fix reaches
       * existing installs without anyone reopening the picker.
       *
       * `merge` rather than `migrate`: migrate only fires when the persisted
       * version differs, so it would clean existing installs once and then
       * never run again. merge runs on every rehydration, which makes
       * "the stored country is canonical" true at all times rather than true
       * after a one-off fix-up.
       */
      merge: (persisted, current) => {
        const s = (persisted ?? {}) as Partial<ProfileState>;
        return { ...current, ...s, country: canonicaliseCountry(s.country ?? current.country) };
      },
    },
  ),
);
