/**
 * Local profile + onboarding state, persisted to AsyncStorage.
 * Server sync happens later (anonymous-first); this store is the source of
 * truth for the client until then.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { UnitPref } from '@/drive/units';

export type VehicleKind = 'car' | 'motorbike';

type ProfileState = {
  onboarded: boolean;
  unitPref: UnitPref;
  country: string | null; // ISO 3166-1 alpha-2
  vehicleKind: VehicleKind | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
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
      username: null,
      safetyAccepted: false,

      setUnitPref: (unitPref) => set({ unitPref }),
      setCountry: (country) => set({ country }),
      setVehicleKind: (vehicleKind) => set({ vehicleKind }),
      setVehicle: (vehicleMake, vehicleModel) => set({ vehicleMake, vehicleModel }),
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
