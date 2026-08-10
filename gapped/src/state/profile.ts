/**
 * Local profile + onboarding state, persisted to AsyncStorage.
 * Server sync happens later (anonymous-first); this store is the source of
 * truth for the client until then.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { UnitPref } from '@/drive/units';
import { uuid } from '@/lib/ids';

export type VehicleKind = 'car' | 'motorbike';

type ProfileState = {
  onboarded: boolean;
  unitPref: UnitPref;
  country: string | null; // ISO 3166-1 alpha-2
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
  safetyAccepted: boolean;

  setUnitPref: (u: UnitPref) => void;
  setCountry: (c: string) => void;
  setVehicleKind: (k: VehicleKind) => void;
  setVehicle: (make: string, model: string) => void;
  setUsername: (u: string) => void;
  acceptSafety: () => void;
  completeOnboarding: () => void;
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      onboarded: false,
      unitPref: 'metric',
      country: null,
      vehicleKind: null,
      vehicleMake: null,
      vehicleModel: null,
      vehicleId: null,
      username: null,
      safetyAccepted: false,

      setUnitPref: (unitPref) => set({ unitPref }),
      setCountry: (country) => set({ country }),
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
      setUsername: (username) => set({ username }),
      acceptSafety: () => set({ safetyAccepted: true }),
      completeOnboarding: () => set({ onboarded: true }),
    }),
    {
      name: 'gapped-profile',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
