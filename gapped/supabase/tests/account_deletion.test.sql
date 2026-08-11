-- ─────────────────────────────────────────────────────────────────────────────
-- Account deletion leaves nothing behind.
--
-- The App Store reviewer will create an account, record something, and delete
-- it. If any row survives, that is a rejection and a data-protection failure at
-- the same time. Cascades are easy to believe in and easy to get wrong: 0002
-- found that profiles → auth.users had NO ON DELETE action, so deleting a user
-- failed on profiles_id_fkey and rolled the whole thing back. Nothing could
-- ever have been deleted, and nothing said so.
--
-- So this asserts the outcome (no orphans anywhere) rather than the mechanism.
--
--   npm run test:db
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(15);

-- ── fixture: a user with a row in every table that references them ──────────

insert into auth.users (id, instance_id, aud, role, email)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'delete-test@example.com');

-- A trigger may already have created the profile row; make it ours either way.
insert into profiles (id, username, country)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'delete_test_user', 'GG')
on conflict (id) do update set username = 'delete_test_user', country = 'GG';

insert into vehicles (id, profile_id, kind, make, model)
values ('aaaaaaaa-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001', 'car', 'BMW', '1M');

insert into drives (id, profile_id, vehicle_id, started_at, ended_at,
                    distance_m, duration_s, max_speed_ms, avg_speed_ms)
values ('aaaaaaaa-0000-0000-0000-000000000003',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000002',
        now(), now(), 1000, 60, 30, 16);

insert into leaderboard_entries (id, drive_id, profile_id, metric, value, scope,
                                 period, verification, country, recorded_at)
values ('aaaaaaaa-0000-0000-0000-000000000004',
        'aaaaaaaa-0000-0000-0000-000000000003',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'top_speed', 30, 'country', 'all', 'verified', 'GG', now());

insert into achievements (profile_id, kind, payload)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        'country_number_one', '{"country":"GG","value":30}'::jsonb);

-- ── the fixture is really there ─────────────────────────────────────────────

select is((select count(*)::int from profiles            where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'fixture: profile exists');
select is((select count(*)::int from drives              where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'fixture: drive exists');
select is((select count(*)::int from leaderboard_entries where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'fixture: leaderboard entry exists');
select is((select count(*)::int from achievements        where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'fixture: achievement exists');
select is((select count(*)::int from vehicles            where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'fixture: vehicle exists');

-- ── delete as that user ─────────────────────────────────────────────────────
-- Impersonates the caller the way PostgREST does, so auth.uid() resolves and
-- the function can only reach its own rows.

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select public.delete_account() $$,
  'delete_account() runs as an ordinary authenticated user'
);

reset role;

-- ── nothing survives ────────────────────────────────────────────────────────

select is((select count(*)::int from auth.users          where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'auth user is gone');
select is((select count(*)::int from profiles            where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'profile is gone');
select is((select count(*)::int from drives              where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'drives are gone');
select is((select count(*)::int from leaderboard_entries where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'leaderboard entries are VACATED, not anonymised');
select is((select count(*)::int from achievements        where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'achievements are gone');
select is((select count(*)::int from vehicles            where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'vehicles are gone');

-- The drive is gone, so its children must be too. Asserted by orphan search
-- rather than by id: this catches a table nobody remembered to check.
select is_empty(
  $$ select f.drive_id from drive_fixes f
      left join drives d on d.id = f.drive_id where d.id is null $$,
  'no orphaned drive_fixes anywhere in the table'
);

select is_empty(
  $$ select p.id from profiles p
      left join auth.users u on u.id = p.id where u.id is null $$,
  'no profile anywhere outlives its auth user'
);

-- ── tripwire ────────────────────────────────────────────────────────────────
-- delete_account() cannot remove storage objects: Supabase's
-- storage.protect_delete() trigger blocks direct SQL deletion, and
-- storage.objects.owner has no FK to cascade through. That is harmless only
-- while no bucket exists.
--
-- This assertion exists to fail loudly the first time someone adds one, which
-- is the moment account deletion silently starts leaving files behind. When it
-- fails, the fix is not to delete this test: it is to clean storage through the
-- Storage API before calling delete_account(), then update this to assert the
-- objects are gone.
select is_empty(
  $$ select id from storage.buckets $$,
  'no storage buckets yet — if this fails, account deletion now leaks files (see 0011)'
);

select * from finish();
rollback;
