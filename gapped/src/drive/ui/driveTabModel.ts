/**
 * What the Driving tab says, worked out from real state: each recent drive's
 * row, the status line over the car, and the hero's title. Pure, so the
 * wording is tested without rendering the screen (which pulls in maps, Skia
 * and the recorder).
 */

import type { EngineState } from '@/drive/engine';
import type { DriveSummary } from '@/drive/types';
import { distanceForDisplay, speedForDisplay, type UnitPref } from '@/drive/units';
import { driveTitle, type DriveTitleOptions } from '@/lib/driveTitle';

// ---------------------------------------------------------------------------
// A recent drive's row

export type DriveRowModel = {
  /** "Monday afternoon", from the real start time. */
  title: string;
  /** "Mon 5 Oct · 13:00 · 25 min". */
  meta: string;
  /** "19.8": the figure on the right, in the wide italic. */
  distance: string;
  /** "mi" / "km". */
  distanceUnit: string;
  /** "top 65 mph": the mono line under the distance. */
  top: string;
  /** The whole row, as one sentence for VoiceOver. */
  accessibilityLabel: string;
};

const SPOKEN_UNIT: Record<string, string> = {
  mi: 'miles',
  km: 'kilometres',
  mph: 'miles per hour',
  'km/h': 'kilometres per hour',
};

type RowSummary = Pick<DriveSummary, 'endedAt' | 'durationS' | 'distanceM' | 'maxSpeedMs'>;

/**
 * The row for one finished drive. `verified` is the server's verdict
 * (verify-drive), never a local guess: false until it has said so.
 */
export function driveRowModel(
  drive: { startedAt: number; summary: RowSummary },
  unitPref: UnitPref,
  verified: boolean,
  titleOptions?: DriveTitleOptions,
): DriveRowModel {
  const { summary } = drive;
  const t = driveTitle(
    { startedAt: drive.startedAt, durationS: summary.durationS, endedAt: summary.endedAt },
    titleOptions,
  );
  const dist = distanceForDisplay(summary.distanceM, unitPref);
  const speed = speedForDisplay(summary.maxSpeedMs, unitPref);
  const distance = dist.value.toFixed(1);
  const top = `${Math.round(speed.value)} ${speed.unit}`;
  const spokenDistance = `${distance} ${SPOKEN_UNIT[dist.unit] ?? dist.unit}`;
  const spokenTop = `${Math.round(speed.value)} ${SPOKEN_UNIT[speed.unit] ?? speed.unit}`;
  return {
    title: t.title,
    meta: t.meta,
    distance,
    distanceUnit: dist.unit,
    top: `top ${top}`,
    accessibilityLabel: [t.spoken, spokenDistance, `top speed ${spokenTop}`]
      .concat(verified ? ['verified'] : [])
      .join(', '),
  };
}

// ---------------------------------------------------------------------------
// The status line over the parked car

export type StatusTone =
  /** A position is in hand: the white light, pulsing. */
  | 'ready'
  /** Location is on and precise, the first fix has not landed. */
  | 'waiting'
  /** Recording cannot start until something is fixed in Settings. */
  | 'off';

export type IdleStatus = {
  /** What the recorder is doing: "Standby", "Motion detected", "Saving". */
  state: string;
  /** What the GPS can do: "GPS ready". */
  gps: string;
  tone: StatusTone;
  /** The line as VoiceOver reads it. */
  spoken: string;
};

/**
 * The mono line above the car's name: the recorder's state, then the GPS's.
 *
 * "Standby", not the mock's "Parked": the app cannot tell a parked car from
 * a passenger glancing at the phone, but it does know the recorder is idle
 * and waiting (sustained motion starts a recording). "GPS ready" only once a
 * recent position has come back from the location provider (`hasFix`; a
 * last-known position hours old does not count).
 */
export function idleStatus(s: {
  engineState: EngineState;
  permission: 'unknown' | 'granted' | 'denied';
  precise: boolean;
  hasFix: boolean;
}): IdleStatus {
  // Arming is sustained motion not yet held long enough to start a drive;
  // it can lapse back to idle, so it is not "Starting".
  const state =
    s.engineState === 'arming'
      ? 'Motion detected'
      : s.engineState === 'stopping'
        ? 'Saving'
        : s.engineState === 'recording'
          ? 'Recording'
          : 'Standby';
  const [gps, tone]: [string, StatusTone] =
    s.permission === 'denied'
      ? ['Location off', 'off']
      : s.permission !== 'granted'
        ? ['Location needed', 'off']
        : !s.precise
          ? ['Approximate location', 'off']
          : s.hasFix
            ? ['GPS ready', 'ready']
            : ['Finding GPS', 'waiting'];
  return { state, gps, tone, spoken: `${state}. ${gps}.` };
}

// ---------------------------------------------------------------------------
// The hero's title

/**
 * The vehicle's name, as big as the screen allows: "BMW M3". Make and model,
 * which is how the boards and the garage know it. Before one is chosen, what
 * it is.
 */
export function vehicleTitle(v: {
  kind: 'car' | 'motorbike' | null;
  make: string | null;
  model: string | null;
}): string {
  const name = [v.make, v.model]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (name) return name;
  return v.kind === 'motorbike' ? 'Your bike' : 'Your car';
}
