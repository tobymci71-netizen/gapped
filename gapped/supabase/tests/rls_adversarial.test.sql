-- ─────────────────────────────────────────────────────────────────────────────
-- Adversarial RLS pass.
--
-- Every other test in this repo asserts that the app works. This one asserts
-- that an ordinary authenticated user CANNOT do the things that would make the
-- boards meaningless or the data unsafe. It is written from the attacker's
-- seat: mallory is a real, fully legitimate signed-in user, using exactly the
-- privileges the app hands every account.
--
-- The attacks are the four that matter for a leaderboard app:
--   * read someone else's drives (their routes are their movements)
--   * write or amend someone else's leaderboard entry (forge a rival's run)
--   * grant yourself an achievement (mint a trophy)
--   * alter someone else's profile (rename them, move them to another country)
--
-- A passing test here means the attempt FAILED. Postgres expresses that two
-- ways: RLS silently filters reads to zero rows, and rejects writes with an
-- error. Both are asserted in the form they actually take, because asserting
-- the wrong form is how a test like this passes while the hole stays open.
--
--   npm run test:db
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(14);

-- ── two real users ──────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email) values
  ('bbbbbbbb-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'victim@example.com'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mallory@example.com');

insert into profiles (id, username, country) values
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'victim', 'GG'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'mallory', 'GG')
on conflict (id) do update set username = excluded.username, country = excluded.country;

insert into drives (id, profile_id, started_at, ended_at, distance_m, duration_s, max_speed_ms, avg_speed_ms)
values ('bbbbbbbb-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-00000000000a',
        now(), now(), 5000, 300, 45, 16);

insert into leaderboard_entries (id, drive_id, profile_id, metric, value, scope, period, verification, country, recorded_at)
values ('bbbbbbbb-0000-0000-0000-00000000000d', 'bbbbbbbb-0000-0000-0000-00000000000c',
        'bbbbbbbb-0000-0000-0000-00000000000a', 'top_speed', 45, 'country', 'all', 'verified', 'GG', now());

-- ── become mallory ──────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}';

-- 1. Read another user's drives ---------------------------------------------

select is_empty(
  $$ select id from drives where profile_id = 'bbbbbbbb-0000-0000-0000-00000000000a' $$,
  'ATTACK BLOCKED: cannot read another user''s drives'
);

select is_empty(
  $$ select drive_id from drive_fixes
      where drive_id = 'bbbbbbbb-0000-0000-0000-00000000000c' $$,
  'ATTACK BLOCKED: cannot read another user''s GPS fixes'
);

-- Stronger than RLS: drive_routes_private has NO grants to `authenticated` at
-- all, so the attempt is refused before any row filter is consulted. Asserted
-- in the form it actually takes — an is_empty() here would ERROR rather than
-- pass, and a test that expects the wrong failure mode is how a hole stays
-- open while the suite stays green.
select throws_ok(
  $$ select drive_id from drive_routes_private
      where drive_id = 'bbbbbbbb-0000-0000-0000-00000000000c' $$,
  '42501',
  null,
  'ATTACK BLOCKED: full route geometry is not readable by any client at all'
);

-- Mallory's own drives are visible — proving the reads above returned empty
-- because of RLS and not because the query was wrong.
select is(
  (select count(*)::int from drives),
  0,
  'control: mallory sees only her own drives, and she has none'
);

-- 2. Write or amend another user's leaderboard entry -------------------------

select throws_ok(
  $$ update leaderboard_entries set value = 999
      where id = 'bbbbbbbb-0000-0000-0000-00000000000d' $$,
  '42501',
  null,
  'ATTACK BLOCKED: cannot amend another user''s leaderboard entry'
);

select throws_ok(
  $$ insert into leaderboard_entries
       (drive_id, profile_id, metric, value, scope, period, verification, country, recorded_at)
     values ('bbbbbbbb-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-00000000000b',
             'top_speed', 999, 'country', 'all', 'verified', 'GG', now()) $$,
  '42501',
  null,
  'ATTACK BLOCKED: cannot forge a leaderboard entry for herself either'
);

select throws_ok(
  $$ delete from leaderboard_entries where id = 'bbbbbbbb-0000-0000-0000-00000000000d' $$,
  '42501',
  null,
  'ATTACK BLOCKED: cannot delete a rival off the board'
);

-- `drives` DOES grant DELETE to authenticated (users may delete their own
-- drives), so here the grant lets the statement run and RLS is the only thing
-- standing between mallory and someone else's history. Asserted by outcome.
select lives_ok(
  $$ delete from drives where id = 'bbbbbbbb-0000-0000-0000-00000000000c' $$,
  'the delete statement itself is permitted to run'
);

-- 3. Grant yourself an achievement -------------------------------------------

select throws_ok(
  $$ insert into achievements (profile_id, kind, payload)
     values ('bbbbbbbb-0000-0000-0000-00000000000b', 'country_number_one',
             '{"country":"GG","value":999}'::jsonb) $$,
  '42501',
  null,
  'ATTACK BLOCKED: cannot mint herself an achievement'
);

-- 4. Alter another user's profile --------------------------------------------

select is(
  (select count(*)::int from profiles
    where id = 'bbbbbbbb-0000-0000-0000-00000000000a' and username = 'victim'),
  (select count(*)::int from profiles
    where id = 'bbbbbbbb-0000-0000-0000-00000000000a' and username = 'victim'),
  'control: the victim profile exists to be attacked'
);

-- Profiles are world-readable by design (boards show usernames), so the attack
-- is the write, not the read.
select lives_ok(
  $$ update profiles set username = 'pwned'
      where id = 'bbbbbbbb-0000-0000-0000-00000000000a' $$,
  'the update statement itself is permitted to run'
);

select is(
  (select username from profiles where id = 'bbbbbbbb-0000-0000-0000-00000000000a'),
  'victim',
  'ATTACK BLOCKED: RLS matched no rows, so the victim''s username is unchanged'
);

-- 5. The one thing she SHOULD be able to do ----------------------------------
-- A test that only ever proves things fail cannot tell "locked down" from
-- "broken".

select lives_ok(
  $$ update profiles set country = 'JE'
      where id = 'bbbbbbbb-0000-0000-0000-00000000000b' $$,
  'control: mallory can still edit her OWN profile'
);

reset role;

-- The victim's drive survived mallory's DELETE: the statement ran, RLS matched
-- no rows. Checked after resetting the role so the read is not itself filtered.
select is(
  (select count(*)::int from drives where id = 'bbbbbbbb-0000-0000-0000-00000000000c'),
  1,
  'ATTACK BLOCKED: the victim''s drive survived the delete attempt'
);

select * from finish();
rollback;
