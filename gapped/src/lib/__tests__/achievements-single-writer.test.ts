/**
 * achievements.payload->>'country' has no database constraint, deliberately.
 * The argument is that it is not an independent input: the only writer is
 * `grantAchievements` in verify-drive, running under the service role, and it
 * copies the value straight out of profiles.country — which has a foreign key
 * onto countries. The payload inherits that constraint transitively.
 *
 * That argument has two assumptions, and they fail in different ways:
 *
 *   1. No CLIENT can write. That is a property of grants and RLS, and is
 *      asserted in supabase/tests/achievements_permissions.test.sql. Source
 *      code cannot tell you anything about it.
 *
 *   2. No SECOND SERVER-SIDE writer exists. The grants say nothing about this —
 *      anything running under the service role passes them — so it needs a
 *      check over the source, which is this file.
 *
 * Neither test subsumes the other. A new Edge Function writing achievements
 * would sail through the permissions test; a loosened grant would sail through
 * this one.
 */

// Scoped to this file rather than added to tsconfig's `types`, which would pull
// Node's globals into the whole React Native app — where `setTimeout` returns a
// number, not a Timeout, among other conflicts. This is the only test that
// reads the source tree off disk.
/// <reference types="node" />

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

/** Directories that hold hand-written code which could talk to Supabase. */
const SEARCH_ROOTS = ['src', 'app', 'supabase/functions'];

/** Generated from src/ by scripts/build-edge-shared.mjs — not a source of truth. */
const GENERATED = 'supabase/functions/_shared';

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const FILES = SEARCH_ROOTS.flatMap((r) => walk(join(ROOT, r))).filter(
  (f) => !relative(ROOT, f).startsWith(GENERATED),
);

/** PostgREST write verbs. A read is `.select`, which is not in this list. */
const WRITE_VERBS = /\.(insert|upsert|update|delete)\s*\(/;

type Site = { file: string; fn: string | null; write: boolean };

/**
 * Every `.from('achievements')` call site, classified. The verb follows the
 * `.from(...)`, often on the next line, so a window after the match is
 * examined rather than the same line.
 */
function callSites(): Site[] {
  const sites: Site[] = [];
  for (const file of FILES) {
    const src = readFileSync(file, 'utf8');
    const re = /\.from\(\s*['"`]achievements['"`]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) != null) {
      const after = src.slice(m.index, m.index + 200);
      const before = src.slice(0, m.index);
      const fns = [...before.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)];
      sites.push({
        file: relative(ROOT, file),
        fn: fns.length > 0 ? fns[fns.length - 1][1] : null,
        write: WRITE_VERBS.test(after),
      });
    }
  }
  return sites;
}

describe('achievements has exactly one writer', () => {
  const sites = callSites();
  const writes = sites.filter((s) => s.write);

  test('the detector actually finds call sites — guards a vacuous pass', () => {
    // Without this, a regex that silently matched nothing would make every
    // assertion below trivially true.
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(sites.filter((s) => !s.write).length).toBeGreaterThanOrEqual(1);
  });

  test('exactly one write site exists in the whole codebase', () => {
    expect(writes.map((w) => `${w.file}:${w.fn}`)).toEqual([
      'supabase/functions/verify-drive/index.ts:grantAchievements',
    ]);
  });

  test('no client code writes achievements', () => {
    // A client write would run as anon or authenticated, which the grants
    // already forbid — but it would fail at runtime rather than in review.
    const clientWrites = writes.filter(
      (w) => w.file.startsWith('src/') || w.file.startsWith('app/'),
    );
    expect(clientWrites).toEqual([]);
  });

  test('the writer copies country from profiles rather than accepting one', () => {
    // The transitive-constraint argument depends on where the value comes
    // from. If grantAchievements ever took a country as a parameter or read it
    // from the request body, the payload would become an independent input.
    const src = readFileSync(
      join(ROOT, 'supabase/functions/verify-drive/index.ts'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('function grantAchievements'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 1);

    // The only country in the payload is the `country` already resolved from
    // profiles earlier in the request, not anything parsed from the caller.
    expect(body).toContain("payload: { country, value: top[0].value }");
    expect(body).not.toMatch(/country\s*[:=]\s*(body|req|payload|input)\b/);
  });

  test('the grant is write-once, which is what makes the payload historical', () => {
    // ignoreDuplicates is why payload->>'country' is a permanent snapshot
    // rather than a stale cache: the row is never updated after first grant.
    // Migration 0010 canonicalises it in place for exactly this reason, and
    // must never re-derive it from profiles.
    const src = readFileSync(
      join(ROOT, 'supabase/functions/verify-drive/index.ts'),
      'utf8',
    );
    const upsert = src.slice(src.indexOf(".from('achievements')"));
    expect(upsert.slice(0, 400)).toContain('ignoreDuplicates: true');
  });
});
