/**
 * Personal bests + streaks — the PB-first core loop (spec §C4). Open Road has
 * no global board at all and does fine on PBs and streaks; boards are the
 * aspiration layer on top.
 *
 * Pure helpers live here for testability; the store persists to AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DriveSummary } from '@/drive/types';
import { Metres, MetresPerSecond, Seconds } from '@/types/units';

export type PersonalBests = {
  /** SI m/s — convert at render. */
  topSpeedMs: MetresPerSecond | null;
  /** Seconds. Lower is better. */
  zeroTo60S: Seconds | null;
  /** Metres. */
  longestDriveM: Metres | null;
};

export const EMPTY_PBS: PersonalBests = {
  topSpeedMs: null,
  zeroTo60S: null,
  longestDriveM: null,
};

/**
 * An improvement to one PB.
 *
 * A DISCRIMINATED union, not `{ metric; next: A | B | C }`. The loose version
 * type-checked `{ metric: 'topSpeedMs', next: seconds(40) }` — a duration
 * recorded as a speed — which is the same species of bug as the 313 km/h
 * reading and was found the same way: by the compiler only once the shape was
 * tightened. Tying `next` to `metric` makes that unrepresentable.
 */
export type PbImprovement =
  | { metric: 'topSpeedMs'; prev: MetresPerSecond | null; next: MetresPerSecond }
  | { metric: 'zeroTo60S'; prev: Seconds | null; next: Seconds }
  | { metric: 'longestDriveM'; prev: Metres | null; next: Metres };

/** Which PBs does this drive beat? Pure — unit-tested. */
export function findImprovements(pbs: PersonalBests, s: DriveSummary): PbImprovement[] {
  const out: PbImprovement[] = [];
  if (s.maxSpeedMs > 0 && (pbs.topSpeedMs == null || s.maxSpeedMs > pbs.topSpeedMs)) {
    out.push({ metric: 'topSpeedMs', prev: pbs.topSpeedMs, next: s.maxSpeedMs });
  }
  if (s.zeroTo60S != null && (pbs.zeroTo60S == null || s.zeroTo60S < pbs.zeroTo60S)) {
    out.push({ metric: 'zeroTo60S', prev: pbs.zeroTo60S, next: s.zeroTo60S });
  }
  if (s.distanceM > 0 && (pbs.longestDriveM == null || s.distanceM > pbs.longestDriveM)) {
    out.push({ metric: 'longestDriveM', prev: pbs.longestDriveM, next: s.distanceM });
  }
  return out;
}

export function applyImprovements(pbs: PersonalBests, imps: PbImprovement[]): PersonalBests {
  const next = { ...pbs };
  for (const i of imps) {
    // The discriminated union guarantees metric and next agree; TypeScript
    // cannot express that through a computed key, so the write is narrowed
    // per-branch rather than cast.
    if (i.metric === 'topSpeedMs') next.topSpeedMs = i.next;
    else if (i.metric === 'zeroTo60S') next.zeroTo60S = i.next;
    else next.longestDriveM = i.next;
  }
  return next;
}

/** Day key in local time, YYYY-MM-DD. */
export function dayKey(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Current consecutive-day streak ending today or yesterday. Pure — tested. */
export function currentStreak(driveDays: Set<string>, now: number): number {
  const DAY = 86_400_000;
  let streak = 0;
  let cursor = now;
  // A streak survives if the most recent drive was today or yesterday.
  if (!driveDays.has(dayKey(cursor))) {
    cursor -= DAY;
    if (!driveDays.has(dayKey(cursor))) return 0;
  }
  while (driveDays.has(dayKey(cursor))) {
    streak++;
    cursor -= DAY;
  }
  return streak;
}

/** Last N days as a contribution grid, oldest first. */
export function contributionGrid(
  driveDays: Set<string>,
  now: number,
  days = 84,
): { key: string; drove: boolean }[] {
  const DAY = 86_400_000;
  const out: { key: string; drove: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY);
    out.push({ key, drove: driveDays.has(key) });
  }
  return out;
}

type RecordsState = {
  pbs: PersonalBests;
  driveDays: string[]; // persisted as array; Set at call sites
  /** Returns the improvements this summary achieved (already applied). */
  recordDrive: (s: DriveSummary) => PbImprovement[];
};

export const useRecords = create<RecordsState>()(
  persist(
    (set, get) => ({
      pbs: EMPTY_PBS,
      driveDays: [],
      recordDrive: (s) => {
        const { pbs, driveDays } = get();
        const imps = findImprovements(pbs, s);
        const day = dayKey(s.startedAt);
        set({
          pbs: applyImprovements(pbs, imps),
          driveDays: driveDays.includes(day) ? driveDays : [...driveDays, day],
        });
        return imps;
      },
    }),
    { name: 'gapped-records', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
