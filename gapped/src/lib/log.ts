/**
 * Drive lifecycle logging, readable from a release build with no Metro.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * A TestFlight build has no Metro attached, so `console.log` has no terminal to
 * print to — but React Native still routes console output through RCTLog into
 * Apple's unified log, where Console.app can read it live from a tethered
 * phone. Nothing was logged on the recording path, so that route existed and
 * led nowhere. These are the handful of moments worth seeing after a drive
 * that behaved oddly.
 *
 * ─── WHY EVERYTHING GOES THROUGH scrub() ─────────────────────────────────────
 * os_log is not private. Anyone who can plug the phone into a Mac can read it,
 * and entries persist. This app records precise location, so a `console.log` of
 * a Fix would write someone's home address into a system log that outlives the
 * app. Every payload is scrubbed with the same function used before anything
 * reaches Sentry — coordinates, route geometry, tokens and identifiers are
 * removed; speed, accuracy and counts survive, because those are the numbers
 * worth reading.
 *
 * ─── READING IT ──────────────────────────────────────────────────────────────
 *   Console.app → select the iPhone in the sidebar → filter on "GAPPED"
 * or, from a terminal with the phone tethered:
 *   xcrun devicectl device info processes --device <UDID>   # find the app
 *   log stream --predicate 'eventMessage CONTAINS "GAPPED"' # macOS-side stream
 */

import { scrub } from './scrub';

/** Prefix chosen to be greppable and unlikely to collide in a noisy system log. */
const TAG = 'GAPPED';

/**
 * Logs a lifecycle moment. Deliberately not a general-purpose logger: the point
 * is a small, fixed set of events that answer "what did the recorder do?", not
 * a firehose that buries them.
 */
export function driveLog(event: string, data?: Record<string, unknown>): void {
  const payload = data ? JSON.stringify(scrub(data)) : '';
  console.log(`${TAG} ${event}${payload ? ' ' + payload : ''}`);
}
