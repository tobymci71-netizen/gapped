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

/**
 * What the person wants to explore after each drive — onboarding's "Your
 * focus" step. Labels and sublabels live with the step list in
 * src/onboarding/flow.ts (FOCUS_OPTIONS); these keys are what is stored and
 * what `onboarding_answers.focus` receives.
 */
export type Focus = 'topSpeed' | 'zeroToSixty' | 'localRanking' | 'beatFriends';

/**
 * "How did you hear about us?" Labels live in src/onboarding/flow.ts
 * (ATTRIBUTION_OPTIONS). Self-reported, kept off the world-readable `profiles`
 * row: it syncs to `onboarding_answers`, which only its owner can read.
 */
export type Attribution =
  | 'tiktok'
  | 'appStore'
  | 'friend'
  | 'x'
  | 'other'
  | 'reddit'
  | 'youtube'
  | 'instagram';

/**
 * A car or bike added on onboarding's "Add more cars?" step, besides the main
 * one. Shaped like the main vehicle's fields so it can sync as a `vehicles`
 * row with `is_primary = false`; the id is minted locally and reused as that
 * row's id, exactly as `vehicleId` is.
 */
export type ExtraVehicle = {
  id: string;
  kind: VehicleKind;
  make: string;
  model: string;
};

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
  /**
   * What the person calls their main vehicle ("Nickname · optional" on the
   * ride step). Display only — boards and sync identify the car by make and
   * model, never by a name the driver typed. Null when not given.
   */
  nickname: string | null;
  /** Cars and bikes beyond the main one, from the garage step. Optional. */
  extraVehicles: ExtraVehicle[];
  /**
   * A photo of the main vehicle from the photo library, replacing the
   * illustration wherever the app shows the car. A local `file://` URI in the
   * app's own container (image-picker copies the pick there), so it survives
   * the original being deleted from Photos — but not a reinstall. Null keeps
   * the illustration.
   */
  vehiclePhotoUri: string | null;
  /** Answer to "What matters to your drive?". Required by the step, null before it. */
  focus: Focus | null;
  /** Answer to "How did you hear about us?". Required by the step, null before it. */
  attribution: Attribution | null;
};

type ProfileState = ProfileData & {
  setUnitPref: (u: UnitPref) => void;
  /** Accepts any string; stores only a canonical code, or null. */
  setCountry: (c: string | null) => void;
  setVehicleKind: (k: VehicleKind) => void;
  setVehicle: (make: string, model: string) => void;
  /** Trims; an empty or whitespace-only name stores null. */
  setNickname: (nickname: string | null) => void;
  /** Mints the vehicle's id and returns it. */
  addExtraVehicle: (vehicle: Omit<ExtraVehicle, 'id'>) => string;
  removeExtraVehicle: (id: string) => void;
  setVehiclePhotoUri: (uri: string | null) => void;
  setFocus: (focus: Focus | null) => void;
  setAttribution: (attribution: Attribution | null) => void;
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
  nickname: null,
  extraVehicles: [],
  vehiclePhotoUri: null,
  focus: null,
  attribution: null,
};

/**
 * Persisted-state version. Bump it with every change to the persisted shape,
 * and teach `migrateProfile` the step up.
 *
 *   0  (unversioned) everything up to onboarding v1
 *   1  onboarding v2: nickname, extraVehicles, vehiclePhotoUri, focus,
 *      attribution
 */
export const PROFILE_VERSION = 1;

/**
 * Brings a stored profile from any earlier version up to PROFILE_VERSION.
 *
 * Required, not optional, once `version` is set: zustand discards persisted
 * state whose version does not match when there is no migrate to call. Without
 * this the first launch of the build that bumped the version would quietly
 * sign every existing driver out of their username, car and onboarding — the
 * Stack.Protected guard would send a finished profile back through
 * onboarding.
 *
 * Every step only ADDS fields at their first-run value and keeps everything it
 * was given, including fields it does not know, so an older build's data
 * always survives. `merge` (below) still runs afterwards, on every launch.
 * Exported for the tests; nothing else should call it.
 */
export function migrateProfile(persisted: unknown, version: number): Partial<ProfileData> {
  const state = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<ProfileData>;
  if (version < 1) {
    return {
      nickname: INITIAL.nickname,
      extraVehicles: INITIAL.extraVehicles,
      vehiclePhotoUri: INITIAL.vehiclePhotoUri,
      focus: INITIAL.focus,
      attribution: INITIAL.attribution,
      ...state,
    };
  }
  return state;
}

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
      // vehicle is worse than losing one pick. Its nickname and photo go with
      // it: a picture of the car is never a picture of the bike. Extra
      // vehicles carry their own kind, so they stay.
      setVehicleKind: (vehicleKind) =>
        set((s) =>
          s.vehicleKind === vehicleKind
            ? { vehicleKind }
            : {
                vehicleKind,
                vehicleMake: null,
                vehicleModel: null,
                vehicleId: null,
                nickname: null,
                vehiclePhotoUri: null,
              },
        ),
      // A new make/model is a different car, so it gets a new id — drives
      // already recorded keep pointing at the one that recorded them.
      setVehicle: (vehicleMake, vehicleModel) =>
        set((s) =>
          s.vehicleMake === vehicleMake && s.vehicleModel === vehicleModel && s.vehicleId
            ? s
            : { vehicleMake, vehicleModel, vehicleId: uuid() },
        ),
      // A nickname and a photo survive a make/model change within one kind:
      // that is nearly always a correction (1 Series → 1M) of the same car.
      setNickname: (nickname) => set({ nickname: nickname?.trim() || null }),
      addExtraVehicle: (vehicle) => {
        const id = uuid();
        set((s) => ({ extraVehicles: [...s.extraVehicles, { ...vehicle, id }] }));
        return id;
      },
      removeExtraVehicle: (id) =>
        set((s) => ({ extraVehicles: s.extraVehicles.filter((v) => v.id !== id) })),
      setVehiclePhotoUri: (vehiclePhotoUri) => set({ vehiclePhotoUri }),
      setFocus: (focus) => set({ focus }),
      setAttribution: (attribution) => set({ attribution }),
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
      version: PROFILE_VERSION,
      // A partial state is enough: `merge` lays it over the live store, so any
      // field a migration does not mention keeps its first-run value.
      migrate: (persisted, version) => migrateProfile(persisted, version) as ProfileState,
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
