#!/usr/bin/env node
/**
 * Fails a build that would ship with no backend — and, for a release, one that
 * would ship pointing at the wrong backend.
 *
 * Runs as the `eas-build-pre-install` hook, so it executes on EAS before
 * anything is compiled. For a local Xcode archive, run it by hand against
 * .env first:
 *
 *   npm run check:release
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
 *
 * ─── RELEASE MODE ────────────────────────────────────────────────────────────
 * EXPO_PUBLIC_ENV=production (EAS's production profile) or `--release`. A
 * local .env is usually pointed at the local stack, and an archive built from
 * it is an App Store build talking to a laptop: the same silent failure, for
 * every person who installs it. So a release also requires:
 *
 *   - an https URL on the production project's own host
 *     (RELEASE_PROJECT_REF.supabase.co) — not loopback, not a LAN address,
 *     not another project;
 *   - an anon key for that project, never a service-role or secret key;
 *   - no Sentry DSN and no PostHog key. The privacy policy and app.json's
 *     privacy manifest say no crash or analytics data is collected; a build
 *     that sets either would make both untrue.
 *
 * Nothing printed here includes a key.
 */

import { Buffer } from 'node:buffer';

const RELEASE_PROJECT_REF = 'esyffuzecjvgddidfeph';

const release = process.argv.includes('--release') || process.env.EXPO_PUBLIC_ENV === 'production';
const env = process.env.EXPO_PUBLIC_ENV ?? (release ? 'production' : 'development');

// Development builds are expected to run offline or against a LAN stack, so
// they are allowed through.
if (env === 'development' && !release) {
  console.log(`[check-build-env] EXPO_PUBLIC_ENV=${env} — offline build allowed.`);
  process.exit(0);
}

const REQUIRED = [
  ['EXPO_PUBLIC_SUPABASE_URL', 'the app runs fully offline: no account, no leaderboards, no sync'],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'same as above — both are needed, either alone does nothing'],
];

/** Problems that stop the build, as [what, why] pairs. */
const problems = REQUIRED.filter(([k]) => !process.env[k]).map(([key, why]) => [
  `MISSING ${key}`,
  `without it, ${why}`,
]);

/** Loopback and private-network hosts: a laptop or a LAN, never a release backend. */
function isLocalHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  // IPv6 literals only: loopback, unspecified, unique-local (fc00::/7) and
  // link-local (fe80::/10).
  if (h.includes(':')) {
    return h === '::1' || h === '::' || /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 127 ||
    a === 10 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** The payload of a JWT-shaped key, or null when it is not one (new-style keys). */
function jwtPayload(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function checkRelease() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (url) {
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      problems.push(['EXPO_PUBLIC_SUPABASE_URL is not a URL', 'the client cannot be created from it']);
    }
    if (parsed) {
      if (parsed.protocol !== 'https:') {
        problems.push([
          `EXPO_PUBLIC_SUPABASE_URL uses ${parsed.protocol.replace(':', '')}`,
          'a release must use https',
        ]);
      }
      if (isLocalHost(parsed.hostname)) {
        problems.push([
          `EXPO_PUBLIC_SUPABASE_URL points at ${parsed.hostname}`,
          'that is a loopback or private address — the local stack, not the production backend',
        ]);
      } else if (parsed.hostname !== `${RELEASE_PROJECT_REF}.supabase.co`) {
        const ref = parsed.hostname.endsWith('.supabase.co')
          ? `project ${parsed.hostname.split('.')[0]}`
          : parsed.hostname;
        problems.push([
          `EXPO_PUBLIC_SUPABASE_URL is ${ref}`,
          `a release must use the production project, ${RELEASE_PROJECT_REF}.supabase.co`,
        ]);
      }
    }
  }

  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (key) {
    if (key.startsWith('sb_secret_')) {
      problems.push([
        'EXPO_PUBLIC_SUPABASE_ANON_KEY is a secret key',
        'it bypasses row-level security and would ship inside the app to anyone who installs it',
      ]);
    }
    const claims = jwtPayload(key);
    if (claims) {
      if (claims.role !== 'anon') {
        problems.push([
          `EXPO_PUBLIC_SUPABASE_ANON_KEY has role "${claims.role}"`,
          'only the anon key may ship in the app; any other role bypasses row-level security',
        ]);
      }
      if (claims.ref && claims.ref !== RELEASE_PROJECT_REF) {
        problems.push([
          `EXPO_PUBLIC_SUPABASE_ANON_KEY belongs to project ${claims.ref}`,
          `a release must use the anon key of ${RELEASE_PROJECT_REF}`,
        ]);
      }
    }
  }

  for (const k of ['EXPO_PUBLIC_SENTRY_DSN', 'EXPO_PUBLIC_POSTHOG_API_KEY']) {
    if (process.env[k]) {
      problems.push([
        `${k} is set`,
        'the privacy policy and the privacy manifest say no crash or analytics data is collected; unset it, or change both first',
      ]);
    }
  }
}

if (release) checkRelease();

if (problems.length > 0) {
  console.error(
    `\n[check-build-env] BUILD STOPPED (EXPO_PUBLIC_ENV=${env}${release ? ', release' : ''})\n`,
  );
  for (const [what, why] of problems) {
    console.error(`  ${what}`);
    console.error(`          ${why}\n`);
  }
  const easEnv = release ? 'production' : 'preview';
  console.error('  Set them on EAS (or in .env for a local archive), then rebuild:\n');
  console.error(`    eas env:create --environment ${easEnv} --name EXPO_PUBLIC_SUPABASE_URL --value <url>`);
  console.error(`    eas env:create --environment ${easEnv} --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <key>\n`);
  process.exit(1);
}

console.log(
  release
    ? `[check-build-env] OK — release build against ${RELEASE_PROJECT_REF}.supabase.co, no crash or analytics keys.`
    : `[check-build-env] OK — backend configured for EXPO_PUBLIC_ENV=${env}.`,
);
