#!/usr/bin/env node
/**
 * Fails an EAS build that would ship with no backend.
 *
 * Runs as the `eas-build-pre-install` hook, so it executes on EAS before
 * anything is compiled.
 *
 * ─── THE FAILURE THIS PREVENTS ───────────────────────────────────────────────
 * `.env` is gitignored, so it never reaches EAS. `src/lib/supabase.ts` exports
 * `null` when its two variables are missing, and every caller handles null by
 * design — that is what makes the app work offline on a plane.
 *
 * The result is a TestFlight build that installs, launches, onboards, and
 * records drives, with no account, no leaderboards, no sync and no
 * verification. Nothing errors. Nothing looks broken. You find out when you get
 * back from the drive and the board is empty.
 *
 * A build is cheap. A wasted drive is not.
 */

const env = process.env.EXPO_PUBLIC_ENV ?? 'development';

// Development builds are expected to run offline or against a LAN stack, so
// they are allowed through.
if (env === 'development') {
  console.log(`[check-build-env] EXPO_PUBLIC_ENV=${env} — offline build allowed.`);
  process.exit(0);
}

const REQUIRED = [
  ['EXPO_PUBLIC_SUPABASE_URL', 'the app runs fully offline: no account, no leaderboards, no sync'],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'same as above — both are needed, either alone does nothing'],
];

// Not required, but shipping a build that cannot report a crash wastes the
// tester's time when something does go wrong.
const RECOMMENDED = [
  ['EXPO_PUBLIC_SENTRY_DSN', 'crashes are never reported; a tester saying "it crashed" is unactionable'],
  ['SENTRY_AUTH_TOKEN', 'source maps are not uploaded, so stacks CANNOT be symbolicated later'],
];

const missing = REQUIRED.filter(([k]) => !process.env[k]);
const absent = RECOMMENDED.filter(([k]) => !process.env[k]);

for (const [key, why] of absent) {
  console.warn(`[check-build-env] WARNING ${key} is not set — ${why}`);
}

if (missing.length > 0) {
  console.error(`\n[check-build-env] BUILD STOPPED (EXPO_PUBLIC_ENV=${env})\n`);
  for (const [key, why] of missing) {
    console.error(`  MISSING ${key}`);
    console.error(`          without it, ${why}\n`);
  }
  console.error('  Set them on EAS, then rebuild:\n');
  console.error('    eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value <url>');
  console.error('    eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <key>\n');
  process.exit(1);
}

console.log(`[check-build-env] OK — backend configured for EXPO_PUBLIC_ENV=${env}.`);
