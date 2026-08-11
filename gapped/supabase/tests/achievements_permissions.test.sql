-- ─────────────────────────────────────────────────────────────────────────────
-- achievements.payload->>'country' carries no constraint of its own, and the
-- argument for that is a permissions argument, not a code-style one:
--
--   achievements grants no write privilege to any client role, so the only
--   writer is verify-drive under the service role, and it copies the value
--   straight out of profiles.country — which has a foreign key onto countries.
--   The payload therefore inherits that constraint transitively.
--
-- That reasoning is only as good as the grants. If someone later adds an
-- INSERT grant or a permissive write policy to anon or authenticated, the
-- payload becomes an independent, unconstrained input and a client can put
-- anything in it. Nothing about the code would change; the invariant would
-- simply stop being true.
--
-- So this asserts the permissions themselves rather than the convention.
-- Its companion — src/lib/__tests__/achievements-single-writer.test.ts —
-- catches a second *server-side* writer, which these grants would not.
--
--   npm run test:db
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(8);

-- ── row level security ───────────────────────────────────────────────────────

select ok(
  (select relrowsecurity from pg_class where oid = 'public.achievements'::regclass),
  'RLS is enabled on achievements'
);

select is_empty(
  $$ select policyname from pg_policies
      where schemaname = 'public' and tablename = 'achievements' and cmd <> 'SELECT' $$,
  'no INSERT, UPDATE or DELETE policy exists on achievements'
);

-- ── grants ───────────────────────────────────────────────────────────────────
-- table_privs_are asserts the privilege set EXACTLY, so an added INSERT fails
-- here rather than passing a "does not have INSERT" spot check.

select table_privs_are(
  'public', 'achievements', 'anon', array['SELECT'],
  'anon may only SELECT achievements'
);

select table_privs_are(
  'public', 'achievements', 'authenticated', array['SELECT'],
  'authenticated may only SELECT achievements'
);

-- ── the source the payload inherits its constraint from ──────────────────────
-- If either of these disappears, the transitive argument collapses and the
-- payload needs a constraint of its own.

select ok(
  exists (select 1 from pg_constraint where conname = 'profiles_country_fkey'),
  'profiles.country has a foreign key onto countries'
);

select ok(
  exists (select 1 from pg_constraint where conname = 'leaderboard_entries_country_fkey'),
  'leaderboard_entries.country has a foreign key onto countries'
);

-- ── the canonical set itself ─────────────────────────────────────────────────

select is(
  (select count(*)::int from countries), 250,
  'countries holds 249 assigned ISO 3166-1 codes plus XK'
);

select is_empty(
  $$ select code from countries where code in ('UK','ZR','SU','YU','CQ','ZZ','AC','EA','IC') $$,
  'no alias or reserved code is present in the canonical set'
);

select * from finish();
rollback;
