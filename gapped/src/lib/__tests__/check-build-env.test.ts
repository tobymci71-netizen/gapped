/**
 * scripts/check-build-env.mjs, run as EAS and `npm run check:release` run it:
 * a separate node process, configured only by its environment.
 *
 * The release checks exist because the silent failure is the likely one. A
 * local .env points at the local stack, the archive builds and uploads, and
 * every person who installs it gets an app that cannot reach a server — or one
 * that reports crashes the privacy policy says are never collected.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '../../../scripts/check-build-env.mjs');
const PROD_URL = 'https://esyffuzecjvgddidfeph.supabase.co';

/** A JWT-shaped key with the given claims. The signature is never checked. */
function jwt(claims: Record<string, unknown>): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.c2lnbmF0dXJl`;
}

const ANON = jwt({ iss: 'supabase', ref: 'esyffuzecjvgddidfeph', role: 'anon' });

function run(env: Record<string, string>, args: string[] = []) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    // Only what the test sets, so a developer's own shell cannot change the answer.
    // (Cast: expo's types make NODE_ENV a required key of every env.)
    env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv,
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const release = (env: Record<string, string>) => run(env, ['--release']);

describe('release mode', () => {
  test('passes on the production project with its anon key', () => {
    const r = release({ EXPO_PUBLIC_SUPABASE_URL: PROD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON });
    expect(r.status).toBe(0);
    expect(r.out).toContain('release build against esyffuzecjvgddidfeph.supabase.co');
  });

  test('EXPO_PUBLIC_ENV=production turns it on without the flag (the EAS hook)', () => {
    const r = run({
      EXPO_PUBLIC_ENV: 'production',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON,
    });
    expect(r.status).toBe(1);
  });

  test.each([
    ['the local stack', 'http://127.0.0.1:54421', 'loopback or private'],
    ['localhost over https', 'https://localhost:54421', 'loopback or private'],
    ['a LAN address', 'http://192.168.1.20:54421', 'loopback or private'],
    ['a 10/8 address', 'https://10.0.0.5', 'loopback or private'],
    ['an IPv6 loopback', 'http://[::1]:54421', 'loopback or private'],
    ['another project', 'https://abcdefghijklmnopqrst.supabase.co', 'project abcdefghijklmnopqrst'],
    ['a custom host', 'https://api.example.com', 'api.example.com'],
    ['plain http to production', 'http://esyffuzecjvgddidfeph.supabase.co', 'must use https'],
    ['not a URL', 'esyffuzecjvgddidfeph', 'not a URL'],
  ])('refuses %s', (_name, url, says) => {
    const r = release({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON });
    expect(r.status).toBe(1);
    expect(r.out).toContain(says);
  });

  test('a host that merely starts like an IPv6 prefix is not mistaken for one', () => {
    const r = release({
      EXPO_PUBLIC_SUPABASE_URL: 'https://fcbarcelona.example',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON,
    });
    expect(r.out).not.toContain('loopback or private');
    expect(r.out).toContain('fcbarcelona.example');
  });

  test('refuses a service-role key, without printing it', () => {
    const key = jwt({ iss: 'supabase', ref: 'esyffuzecjvgddidfeph', role: 'service_role' });
    const r = release({ EXPO_PUBLIC_SUPABASE_URL: PROD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: key });
    expect(r.status).toBe(1);
    expect(r.out).toContain('role "service_role"');
    expect(r.out).not.toContain(key);
  });

  test('refuses a new-style secret key', () => {
    const r = release({
      EXPO_PUBLIC_SUPABASE_URL: PROD_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_abc123',
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('is a secret key');
    expect(r.out).not.toContain('sb_secret_abc123');
  });

  test("refuses another project's anon key on the right URL", () => {
    const key = jwt({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role: 'anon' });
    const r = release({ EXPO_PUBLIC_SUPABASE_URL: PROD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: key });
    expect(r.status).toBe(1);
    expect(r.out).toContain('belongs to project abcdefghijklmnopqrst');
  });

  test('accepts a new-style publishable key, which carries no claims to check', () => {
    const r = release({
      EXPO_PUBLIC_SUPABASE_URL: PROD_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_abc123',
    });
    expect(r.status).toBe(0);
  });

  test.each(['EXPO_PUBLIC_SENTRY_DSN', 'EXPO_PUBLIC_POSTHOG_API_KEY'])(
    'refuses %s: the privacy policy says nothing is collected',
    (k) => {
      const r = release({
        EXPO_PUBLIC_SUPABASE_URL: PROD_URL,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON,
        [k]: 'set-for-the-test',
      });
      expect(r.status).toBe(1);
      expect(r.out).toContain(`${k} is set`);
    },
  );

  test('still refuses missing variables first of all', () => {
    const r = release({});
    expect(r.status).toBe(1);
    expect(r.out).toContain('MISSING EXPO_PUBLIC_SUPABASE_URL');
    expect(r.out).toContain('MISSING EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });
});

describe('other builds are unchanged', () => {
  test('development is allowed through with nothing set', () => {
    expect(run({ EXPO_PUBLIC_ENV: 'development' }).status).toBe(0);
    expect(run({}).status).toBe(0);
  });

  test('staging needs a backend but may point anywhere', () => {
    expect(run({ EXPO_PUBLIC_ENV: 'staging' }).status).toBe(1);
    expect(
      run({
        EXPO_PUBLIC_ENV: 'staging',
        EXPO_PUBLIC_SUPABASE_URL: 'http://192.168.1.20:54421',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON,
      }).status,
    ).toBe(0);
  });
});
