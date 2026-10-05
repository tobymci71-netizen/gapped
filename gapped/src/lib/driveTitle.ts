/**
 * Human titles for a drive, from when it actually happened.
 *
 * A drive is titled by its weekday and the part of the day it started in —
 * "Monday afternoon" — with the facts underneath in a mono line:
 * "Mon 5 Oct · 13:00 · 25 min". Never a raw timestamp as a title, and never a
 * hard-coded weekday: both lines are worked out from `startedAt` in the
 * device's time zone (or the one passed), so a drive at 00:30 on Sunday is a
 * Sunday drive wherever it was recorded.
 *
 * The copy is English, so the locale only decides the date's order and the
 * clock (en-GB "5 Oct · 13:00", en-US "Oct 5 · 1:00 PM"). A non-English
 * device locale falls back to en-GB rather than mixing languages in a line.
 *
 * Pure: no React, no stores. Hermes on iOS provides Intl.DateTimeFormat.
 */

export type PartOfDay = 'early' | 'morning' | 'afternoon' | 'evening' | 'night';

export type DriveTitle = {
  /** "Monday afternoon", "Early Sunday morning". */
  title: string;
  /** "Mon 5 Oct · 13:00 · 25 min" — the row's mono line. */
  meta: string;
  /** "Mon 5 Oct · 13:00–13:25" — the summary's mono line (add the car after). */
  range: string;
  /** For VoiceOver: "Monday afternoon, 5 October, 13:00, 25 minutes". */
  spoken: string;
};

export type DriveTitleOptions = {
  /** An English locale (en-GB, en-US, en-AU…). Default: the device's, if English. */
  locale?: string;
  /** IANA zone. Default: the device's. */
  timeZone?: string;
};

const SEP = ' · ';

/**
 * Which part of the day an hour (0–23, local) belongs to.
 *
 * 05–11 morning, 12–16 afternoon, 17–20 evening, 21–23 night. 00–04 is
 * "early": a drive at 01:00 on Sunday is not "Sunday night" (that reads as
 * the Sunday evening to come) — it is early Sunday morning.
 */
export function partOfDay(hour: number): PartOfDay {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h < 5) return 'early';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

/** "25 min", "1 h 5 min", "2 h", "<1 min". Minutes round to the nearest. */
export function formatDriveDuration(durationS: number): string {
  const total = Math.round((Number.isFinite(durationS) ? Math.max(0, durationS) : 0) / 60);
  if (total < 1) return '<1 min';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function spokenDuration(durationS: number): string {
  const total = Math.round((Number.isFinite(durationS) ? Math.max(0, durationS) : 0) / 60);
  if (total < 1) return 'under a minute';
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hours = h === 0 ? '' : `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const mins = m === 0 ? '' : `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  return [hours, mins].filter(Boolean).join(' ');
}

function englishLocale(locale: string | undefined): string {
  const pick = locale ?? deviceLocale();
  return /^en(-|$)/i.test(pick) ? pick : 'en-GB';
}

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en-GB';
  }
}

/**
 * Intl output tidied for a mono line: no commas, and plain spaces where ICU
 * uses narrow no-break ones ("1:00 PM"), which the mono face does not draw.
 */
function tidy(s: string): string {
  return s.replace(/[\u202f\u00a0]/g, ' ').replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

function fmt(locale: string, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone });
}

export function driveTitle(
  drive: { startedAt: number; durationS: number; endedAt?: number },
  options: DriveTitleOptions = {},
): DriveTitle {
  const start = new Date(drive.startedAt);
  if (!Number.isFinite(drive.startedAt) || Number.isNaN(start.getTime())) {
    return { title: 'Drive', meta: '', range: '', spoken: 'Drive' };
  }
  const locale = englishLocale(options.locale);
  const { timeZone } = options;
  const durationS = Number.isFinite(drive.durationS) ? Math.max(0, drive.durationS) : 0;
  const endMs =
    drive.endedAt != null && Number.isFinite(drive.endedAt) && drive.endedAt >= drive.startedAt
      ? drive.endedAt
      : drive.startedAt + durationS * 1000;
  const end = new Date(endMs);

  // The title's words are English whatever the date order, so the weekday and
  // the hour come from en-GB in the drive's zone.
  const weekday = fmt('en-GB', timeZone, { weekday: 'long' }).format(start);
  const hour = parseInt(fmt('en-GB', timeZone, { hour: '2-digit', hourCycle: 'h23' }).format(start), 10);
  const part = partOfDay(Number.isFinite(hour) ? hour : start.getHours());
  const title =
    part === 'early' ? `Early ${weekday} morning` : `${weekday} ${part}`;

  const shortDay = tidy(fmt(locale, timeZone, { weekday: 'short' }).format(start));
  const dayMonth = tidy(fmt(locale, timeZone, { day: 'numeric', month: 'short' }).format(start));
  const longDayMonth = tidy(fmt(locale, timeZone, { day: 'numeric', month: 'long' }).format(start));
  const clock = fmt(locale, timeZone, { hour: 'numeric', minute: '2-digit' });
  // A 24-hour clock reads "08:30", as the mockups' "10:00"; a 12-hour one
  // keeps "8:30 AM".
  const time = (d: Date) => tidy(clock.format(d)).replace(/^(\d):(\d\d)$/, '0$1:$2');
  const startTime = time(start);
  const endTime = time(end);
  const date = `${shortDay} ${dayMonth}`;

  return {
    title,
    meta: [date, startTime, formatDriveDuration(durationS)].join(SEP),
    range: [date, `${startTime}–${endTime}`].join(SEP),
    spoken: [title, longDayMonth, startTime, spokenDuration(durationS)].join(', '),
  };
}
