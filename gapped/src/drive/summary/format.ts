/**
 * Words and short figures for the drive summary: the clock on the speed
 * trace's axis, the duration figure, the car the drive was recorded in, and
 * what VoiceOver says for each.
 *
 * The clock follows driveTitle (src/lib/driveTitle.ts): English, in the
 * device's locale when that is English ("13:00", or "1:00 PM" in en-US) and
 * en-GB otherwise, so the axis reads the same clock as the title above it.
 *
 * Pure, for the tests.
 */

import type { ExtraVehicle } from '@/state/profile';

type ClockOptions = { locale?: string; timeZone?: string };

function englishLocale(locale: string | undefined): string {
  let pick = locale;
  if (pick == null) {
    try {
      pick = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      pick = 'en-GB';
    }
  }
  return /^en(-|$)/i.test(pick) ? pick : 'en-GB';
}

/** Intl output tidied for a mono line (driveTitle's rule: plain spaces, no commas). */
function tidy(s: string): string {
  return s.replace(/[\u202f\u00a0]/g, ' ').replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

/** "13:00" (or "1:00 PM" on a 12-hour English clock). */
export function clockLabel(t: number, { locale, timeZone }: ClockOptions = {}): string {
  const text = tidy(
    new Intl.DateTimeFormat(englishLocale(locale), {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(new Date(t)),
  );
  // A 24-hour clock reads "08:30", as driveTitle writes it.
  return text.replace(/^(\d):(\d\d)$/, '0$1:$2');
}

/**
 * An inner tick on the time axis: ":05", ":40" — or the whole clock on the
 * hour ("14:00"), where ":00" alone would not say which hour.
 */
export function tickLabel(t: number, options: ClockOptions = {}): string {
  const minute = new Intl.DateTimeFormat('en-GB', {
    minute: '2-digit',
    timeZone: options.timeZone,
  }).format(new Date(t));
  const mm = minute.padStart(2, '0');
  return mm === '00' ? clockLabel(t, options) : `:${mm}`;
}

export type Figure = { value: string; unit: string; spoken: string };

/**
 * A drive's duration as a stat figure: "25" min, "1:05" h, "<1" min. The
 * mock's "25 min"; an hour and over reads as a clock, since "1 h 5" would
 * need two units in a column built for one.
 */
export function durationFigure(durationS: number): Figure {
  const total = Math.round((Number.isFinite(durationS) ? Math.max(0, durationS) : 0) / 60);
  if (total < 1) return { value: '<1', unit: 'min', spoken: 'under a minute' };
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return { value: String(m), unit: 'min', spoken: `${m} ${m === 1 ? 'minute' : 'minutes'}` };
  const hours = `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const mins = m === 0 ? '' : ` ${m} ${m === 1 ? 'minute' : 'minutes'}`;
  return { value: `${h}:${String(m).padStart(2, '0')}`, unit: 'h', spoken: hours + mins };
}

/** "mph" → "miles per hour", for VoiceOver. */
export function spokenSpeedUnit(unit: string): string {
  return unit === 'mph' ? 'miles per hour' : unit === 'km/h' ? 'kilometres per hour' : unit;
}

/** "mi" → "miles", for VoiceOver. */
export function spokenDistanceUnit(unit: string): string {
  return unit === 'mi' ? 'miles' : unit === 'km' ? 'kilometres' : unit;
}

/**
 * The car a drive was recorded in, by the id it was stamped with when it
 * started (wal.openDrive): the main car if it is still that one, or one of
 * the garage's extra cars. Null when the drive carries no id, or one the
 * profile no longer has — a drive in a car since replaced is not credited to
 * the new one, which is what naming whatever is in the garage today did.
 */
export function driveVehicleLabel(
  vehicleId: string | null,
  profile: {
    vehicleId: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    extraVehicles: readonly ExtraVehicle[];
  },
): string | null {
  if (!vehicleId) return null;
  if (vehicleId === profile.vehicleId && profile.vehicleMake && profile.vehicleModel) {
    return `${profile.vehicleMake} ${profile.vehicleModel}`;
  }
  const extra = profile.extraVehicles.find((v) => v.id === vehicleId);
  return extra ? `${extra.make} ${extra.model}` : null;
}
