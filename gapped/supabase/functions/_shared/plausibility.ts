// AUTO-GENERATED from src/ by scripts/build-edge-shared.mjs — do not edit here.
/**
 * Client-side plausibility envelope (spec Phase 3, item 4 — the cheap checks).
 *
 * This runs locally as a preview; the server re-runs everything from the raw
 * fix array and is the only authority for verification state. Failing here
 * never silently drops a run — it explains itself (`detail`) so the UI can
 * show the user exactly which check failed.
 */

import { Fix, PlausibilityCheck, PlausibilityReport } from './types.ts';
import { Metres } from './unit-types.ts';
import { deriveSpeeds, gateFixes, haversineM } from './stats.ts';

/** Sustained acceleration beyond this (g) over the window is flagged. */
const MAX_SUSTAINED_G = 1.5;
const SUSTAINED_WINDOW_S = 3;
/** Implied point-to-point speed beyond this is a teleport (m/s ≈ 540 km/h). */
const TELEPORT_MS = 150;
/** A real GNSS fix stream has accuracy jitter; near-zero variance is a spoof signature. */
const MIN_ACCURACY_STDDEV = 0.05;

const G = 9.80665;

export function checkPlausibility(rawFixes: Fix[]): PlausibilityReport {
  const checks: PlausibilityCheck[] = [];
  const fixes = gateFixes(rawFixes);
  const speeds = deriveSpeeds(fixes);

  // mock provider flag (Android)
  const mockCount = rawFixes.filter((f) => f.isMock).length;
  checks.push({
    check: 'mock_provider',
    pass: mockCount === 0,
    detail:
      mockCount === 0
        ? 'No fixes from a mock location provider.'
        : `${mockCount} fix${mockCount === 1 ? '' : 'es'} came from a mock location provider.`,
  });

  // teleport gaps
  let teleports = 0;
  for (let i = 1; i < fixes.length; i++) {
    const dt = (fixes[i].t - fixes[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const d = haversineM(fixes[i - 1].lat, fixes[i - 1].lon, fixes[i].lat, fixes[i].lon);
    if (d / dt > TELEPORT_MS) teleports++;
  }
  checks.push({
    check: 'teleport',
    pass: teleports === 0,
    detail:
      teleports === 0
        ? 'No implausible position jumps.'
        : `${teleports} position jump${teleports === 1 ? '' : 's'} impl${teleports === 1 ? 'ies' : 'y'} speeds beyond ${TELEPORT_MS} m/s.`,
  });

  // sustained acceleration from the GPS speed profile
  let sustainedViolation = false;
  for (let i = 0; i < fixes.length && !sustainedViolation; i++) {
    let j = i;
    while (j + 1 < fixes.length && fixes[j + 1].t - fixes[i].t <= SUSTAINED_WINDOW_S * 1000) j++;
    const dt = (fixes[j].t - fixes[i].t) / 1000;
    if (dt < SUSTAINED_WINDOW_S * 0.8) continue;
    const accel = (speeds[j] - speeds[i]) / dt;
    if (Math.abs(accel) > MAX_SUSTAINED_G * G) sustainedViolation = true;
  }
  checks.push({
    check: 'sustained_accel',
    pass: !sustainedViolation,
    detail: sustainedViolation
      ? `Speed profile implies sustained acceleration beyond ${MAX_SUSTAINED_G} g — outside road-vehicle envelope.`
      : 'Acceleration profile within road-vehicle envelope.',
  });

  // zero-jitter accuracy variance (simulated-location signature)
  const accuracies = rawFixes
    .map((f) => f.accuracyM)
    .filter((a): a is Metres => a != null && a > 0);
  let jitterPass = true;
  if (accuracies.length >= 10) {
    const mean = accuracies.reduce((s, a) => s + a, 0) / accuracies.length;
    const variance =
      accuracies.reduce((s, a) => s + (a - mean) ** 2, 0) / accuracies.length;
    jitterPass = Math.sqrt(variance) >= MIN_ACCURACY_STDDEV;
  }
  checks.push({
    check: 'zero_jitter',
    pass: jitterPass,
    detail: jitterPass
      ? 'GNSS accuracy shows natural jitter.'
      : 'Reported accuracy is implausibly constant — simulated-location signature.',
  });

  // device speed vs positional speed agreement
  let disagreements = 0;
  let compared = 0;
  for (let i = 1; i < fixes.length; i++) {
    const f = fixes[i];
    if (f.speedMs == null) continue;
    const dt = (f.t - fixes[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const positional =
      haversineM(fixes[i - 1].lat, fixes[i - 1].lon, f.lat, f.lon) / dt;
    compared++;
    if (Math.abs(positional - f.speedMs) > Math.max(10, f.speedMs * 0.5)) disagreements++;
  }
  const agreementPass = compared === 0 || disagreements / compared < 0.2;
  checks.push({
    check: 'speed_agreement',
    pass: agreementPass,
    detail: agreementPass
      ? 'Device-reported speed agrees with positional speed.'
      : `Device speed disagrees with positional speed on ${disagreements}/${compared} fixes.`,
  });

  return {
    verdict: checks.every((c) => c.pass) ? 'plausible' : 'implausible',
    checks,
  };
}
