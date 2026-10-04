-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding's proof numbers, and where its answers go (0017).
--
-- docs/ONBOARDING.md, rule 1: every count on a proof screen comes from the
-- backend, and the backend must not count wrongly or say too much. So this
-- holds the two functions to their definitions — who counts, which vehicle,
-- which day, which floor — on both sides of every boundary, from the seat of a
-- client that can see none of the rows being counted. And it holds
-- onboarding_answers to "your own row, and nobody else's", in the forms the
-- refusals actually take: an error where there is no privilege, zero rows
-- where RLS filters.
--
-- Rows already in the local database must not move these numbers, so the
-- fixture first sets them aside: every existing vehicle stops being primary,
-- and the test country is emptied. All of it is rolled back at the end.
--
--   npm run test:db
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(64);

-- ══ shape and security ═══════════════════════════════════════════════════════

select is_definer('public', 'make_popularity', array['text'],
  'make_popularity is SECURITY DEFINER: it counts vehicles no caller may read');
select is_definer('public', 'country_activity', array['text'],
  'country_activity is SECURITY DEFINER: it counts drives no caller may read');
select volatility_is('public', 'make_popularity', array['text'], 'stable',
  'make_popularity is STABLE');
select volatility_is('public', 'country_activity', array['text'], 'stable',
  'country_activity is STABLE');

-- A definer function without a pinned search_path runs whatever a caller's
-- schema puts first. Both pin it empty and name every object in full.
select is(
  (select proconfig from pg_proc where oid = 'public.make_popularity(text)'::regprocedure),
  array['search_path=""'],
  'make_popularity pins an empty search_path'
);
select is(
  (select proconfig from pg_proc where oid = 'public.country_activity(text)'::regprocedure),
  array['search_path=""'],
  'country_activity pins an empty search_path'
);

-- What comes back: aggregates, in exactly these columns. An id or a username
-- added here later fails this before it reaches a screen.
select is(
  (select array_agg(a.n || ' ' || format_type(a.t, null) order by a.i)
     from pg_proc p,
          unnest(p.proargnames, p.proallargtypes, p.proargmodes)
            with ordinality as a(n, t, m, i)
    where p.oid = 'public.make_popularity(text)'::regprocedure and a.m = 't'),
  array['make text', 'drivers bigint', 'rank integer', 'share numeric'],
  'make_popularity returns (make, drivers, rank, share) and nothing else'
);
select is(
  (select array_agg(a.n || ' ' || format_type(a.t, null) order by a.i)
     from pg_proc p,
          unnest(p.proargnames, p.proallargtypes, p.proargmodes)
            with ordinality as a(n, t, m, i)
    where p.oid = 'public.country_activity(text)'::regprocedure and a.m = 't'),
  array['drivers bigint', 'drove_yesterday bigint'],
  'country_activity returns (drivers, drove_yesterday) and nothing else'
);

-- Explicit grants, per 0007 and 0015. PUBLIC must not hold EXECUTE: that is the
-- default this migration revokes, and the one 0007 exists to stop inheriting.
select function_privs_are('public', 'make_popularity', array['text'], 'anon', array['EXECUTE'],
  'anon may call make_popularity');
select function_privs_are('public', 'make_popularity', array['text'], 'authenticated', array['EXECUTE'],
  'authenticated may call make_popularity');
select function_privs_are('public', 'make_popularity', array['text'], 'service_role', array['EXECUTE'],
  'service_role may call make_popularity');
select function_privs_are('public', 'country_activity', array['text'], 'anon', array['EXECUTE'],
  'anon may call country_activity');
select function_privs_are('public', 'country_activity', array['text'], 'authenticated', array['EXECUTE'],
  'authenticated may call country_activity');
select function_privs_are('public', 'country_activity', array['text'], 'service_role', array['EXECUTE'],
  'service_role may call country_activity');
select is_empty(
  $$ select p.proname
       from pg_proc p, aclexplode(p.proacl) a
      where p.oid in ('public.make_popularity(text)'::regprocedure,
                      'public.country_activity(text)'::regprocedure,
                      'public.touch_onboarding_answers()'::regprocedure)
        and a.grantee = 0 $$,
  'PUBLIC holds no privilege on any 0017 function'
);

-- ══ fixture ══════════════════════════════════════════════════════════════════
-- Forty-four drivers, numbered: dddddddd-0000-0000-0000-0000000000NN.

update vehicles set is_primary = false where is_primary;
delete from leaderboard_entries where country = 'LI';
update profiles set country = null where country = 'LI';

insert into auth.users (id, instance_id, aud, role, email)
select ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'proof-' || n || '@example.com'
from generate_series(1, 44) n;

-- The signup trigger made the profiles; name all but #19.
update profiles set username = 'proof_' || substr(id::text, 31)
where id::text like 'dddddddd-0000-0000-0000-%'
  and id <> 'dddddddd-0000-0000-0000-000000000019';

-- ── cars ─────────────────────────────────────────────────────────────────────
--   1–6    BMW, in three spellings ("BMW" ×4, "bmw", "  BMW ")
--   7–11   Audi
--   12–16  Honda
--   17–18  Fiat — two drivers, under the floor
--   19     BMW, but no username yet: mid-onboarding, not a driver
--   20     two primaries left by an older build: BMW (lower id, never driven)
--          and Audi (drove last). Counts once, as Audi.
--   1      also an extra Porsche from the garage step (is_primary = false)
--   21     a motorbike: Ducati
insert into vehicles (id, profile_id, kind, make, model, is_primary)
select ('eeeeeeee-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'car',
       case
         when n <= 4  then 'BMW'
         when n = 5   then 'bmw'
         when n = 6   then '  BMW '
         when n <= 11 then 'Audi'
         when n <= 16 then 'Honda'
         when n <= 18 then 'Fiat'
         else 'BMW'
       end,
       'Model', true
from generate_series(1, 19) n;

insert into vehicles (id, profile_id, kind, make, model, is_primary) values
  ('eeeeeeee-0000-0000-0000-0000000000a0', 'dddddddd-0000-0000-0000-000000000020', 'car', 'BMW',  '1M', true),
  ('eeeeeeee-0000-0000-0000-0000000000b0', 'dddddddd-0000-0000-0000-000000000020', 'car', 'Audi', 'S3', true),
  ('eeeeeeee-0000-0000-0000-0000000000c0', 'dddddddd-0000-0000-0000-000000000001', 'car', 'Porsche', '911', false),
  ('eeeeeeee-0000-0000-0000-000000000021', 'dddddddd-0000-0000-0000-000000000021', 'motorbike', 'Ducati', 'Monster', true);

-- #20 drove the BMW a month ago and the Audi last week.
insert into drives (id, profile_id, vehicle_id, started_at, ended_at, distance_m, duration_s,
                    max_speed_ms, avg_speed_ms)
values
  ('ffffffff-0000-0000-0000-0000000000a0', 'dddddddd-0000-0000-0000-000000000020',
   'eeeeeeee-0000-0000-0000-0000000000a0', now() - interval '30 days', now() - interval '30 days',
   1000, 60, 30, 16),
  ('ffffffff-0000-0000-0000-0000000000b0', 'dddddddd-0000-0000-0000-000000000020',
   'eeeeeeee-0000-0000-0000-0000000000b0', now() - interval '7 days', now() - interval '7 days',
   1000, 60, 30, 16);

-- ══ make_popularity, from a client's seat ════════════════════════════════════
-- anon holds no SELECT on vehicles at all, so every row below was counted by
-- the function, not seen by the caller.

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select 1 from vehicles $$,
  '42501', null,
  'control: the caller cannot read a single vehicle'
);

-- 19 car drivers: BMW 6, Audi 6, Honda 5, Fiat 2. Audi and BMW tie on six and
-- rank alphabetically. Fiat is withheld but still in the denominator, so the
-- shares are of 19, not 17.
select results_eq(
  $$ select make, drivers, rank, share from public.make_popularity('car') order by rank $$,
  $$ values ('Audi'::text, 6::bigint, 1, 31.6::numeric),
            ('BMW',        6,         2, 31.6),
            ('Honda',      5,         3, 26.3) $$,
  'cars: counted once per driver, ranked by drivers then make, shared of every driver'
);

select is(
  (select make from public.make_popularity('car') where lower(make) = 'bmw'),
  'BMW',
  'three spellings are one make, shown the way most of its drivers wrote it'
);

select is_empty(
  $$ select make from public.make_popularity('car') where make = 'Fiat' $$,
  'FLOOR: a make with two drivers is withheld'
);

select is_empty(
  $$ select make from public.make_popularity('car') where make = 'Porsche' $$,
  'an extra garage vehicle is not anyone''s main car'
);

select is_empty(
  $$ select make from public.make_popularity('motorbike') $$,
  'one Ducati is under the floor, and no car leaks into the motorbike list'
);

select is_empty(
  $$ select make from public.make_popularity('tractor') $$,
  'an unknown kind lists nothing'
);

reset role;

-- ── the floor, from the other side ──────────────────────────────────────────
-- Three more Fiat drivers: five is enough to be listed. 22 drivers now, and
-- Fiat ties Honda on five, so takes third place alphabetically.

insert into vehicles (id, profile_id, kind, make, model, is_primary)
select ('eeeeeeee-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'car', 'Fiat', '500', true
from generate_series(22, 24) n;

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';

select results_eq(
  $$ select make, drivers, rank, share from public.make_popularity('car') where make = 'Fiat' $$,
  $$ values ('Fiat'::text, 5::bigint, 3, 22.7::numeric) $$,
  'FLOOR: five drivers are listed, and ranked among the rest'
);

select is(
  (select count(*)::int from public.make_popularity('car')),
  4,
  'an authenticated caller gets the same aggregate, with no row of its own singled out'
);

reset role;

-- ── which of several primaries counts ────────────────────────────────────────
-- #20 now drives the old BMW again, more recently than the Audi: BMW 7, Audi 5.

insert into drives (id, profile_id, vehicle_id, started_at, ended_at, distance_m, duration_s,
                    max_speed_ms, avg_speed_ms)
values ('ffffffff-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-000000000020',
        'eeeeeeee-0000-0000-0000-0000000000a0', now() - interval '1 day', now() - interval '1 day',
        1000, 60, 30, 16);

select results_eq(
  $$ select make, drivers from public.make_popularity('car')
      where make in ('Audi', 'BMW') order by rank $$,
  $$ values ('BMW'::text, 7::bigint), ('Audi', 5) $$,
  'a driver with two primaries counts under the one they drove last, and only once'
);

-- #19 picks a username: now a driver.
update profiles set username = 'proof_late' where id = 'dddddddd-0000-0000-0000-000000000019';

select is(
  (select drivers from public.make_popularity('car') where make = 'BMW'),
  8::bigint,
  'a profile counts from the moment it has a username'
);

-- ── several primaries of different kinds, never driven ──────────────────────
-- #26 holds a Ducati (the lower id) and a Fiat, both primary, and has never
-- driven: the lowest id decides, so #26 is a rider and the Fiat counts
-- nowhere. #27–29 ride Ducatis too, one of them spelt "ducati". #30's make is
-- blank: never listed, but still one of the riders every share is out of.
insert into vehicles (id, profile_id, kind, make, model, is_primary) values
  ('eeeeeeee-0000-0000-0000-0000000000d0', 'dddddddd-0000-0000-0000-000000000026', 'motorbike', 'Ducati', 'Panigale', true),
  ('eeeeeeee-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-000000000026', 'car', 'Fiat', 'Panda', true),
  ('eeeeeeee-0000-0000-0000-000000000027', 'dddddddd-0000-0000-0000-000000000027', 'motorbike', 'Ducati', 'Monster', true),
  ('eeeeeeee-0000-0000-0000-000000000028', 'dddddddd-0000-0000-0000-000000000028', 'motorbike', 'ducati', 'Monster', true),
  ('eeeeeeee-0000-0000-0000-000000000029', 'dddddddd-0000-0000-0000-000000000029', 'motorbike', 'Ducati', 'Monster', true),
  ('eeeeeeee-0000-0000-0000-000000000030', 'dddddddd-0000-0000-0000-000000000030', 'motorbike', '   ', 'Unknown', true);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select results_eq(
  $$ select make, drivers, rank, share from public.make_popularity('motorbike') $$,
  $$ values ('Ducati'::text, 5::bigint, 1, 83.3::numeric) $$,
  'motorbikes: two undriven primaries count once, by the lower id; a blank make is not listed but is in the share'
);

select is(
  (select drivers from public.make_popularity('car') where make = 'Fiat'),
  5::bigint,
  'and that driver''s other primary, a car, is counted nowhere'
);

reset role;

-- The main-car demotion in sync.ts filters vehicles by driver on every
-- identity change; without this it reads the whole table each time.
select has_index('public', 'vehicles', 'vehicles_profile_id_idx', array['profile_id'],
  'vehicles are indexed by driver');

-- ══ country_activity ═════════════════════════════════════════════════════════
-- Liechtenstein, emptied above. Drivers 31–43 live there; 44 is in Guernsey.
--
-- "Yesterday" is the previous UTC day. Computed the same way the function
-- does, from the same now(), which a transaction holds still.

update profiles set country = 'LI'
where id in (select ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
             from generate_series(31, 43) n);
update profiles set country = 'GG' where id = 'dddddddd-0000-0000-0000-000000000044';

create temp table yday on commit drop as
select (date_trunc('day', now() at time zone 'utc') - interval '1 day') at time zone 'utc' as starts,
       date_trunc('day', now() at time zone 'utc') at time zone 'utc' as ends;

-- 31–39: a drive at noon yesterday, verified or not. 31 drives twice.
-- 40: a drive at exactly 00:00 UTC yesterday (the window's first instant).
-- 41: a drive at exactly 00:00 UTC today (the first instant after it).
-- 42: one a microsecond before the window, and a rejected one inside it.
-- 43: drove two days ago only.
-- 44: drove yesterday, from Guernsey.
insert into drives (id, profile_id, started_at, ended_at, distance_m, duration_s,
                    max_speed_ms, avg_speed_ms, verification)
select ('ffffffff-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       y.starts + interval '12 hours', y.starts + interval '13 hours', 1000, 60, 30, 16,
       case when n % 2 = 0 then 'verified' else 'unverified' end
from generate_series(31, 39) n, yday y;

insert into drives (id, profile_id, started_at, ended_at, distance_m, duration_s,
                    max_speed_ms, avg_speed_ms, verification)
select v.id::uuid, v.profile_id::uuid, v.started_at, v.started_at + interval '1 hour',
       1000, 60, 30, 16, v.verification
from yday y, lateral (values
  ('ffffffff-0000-0000-0000-000000000131', 'dddddddd-0000-0000-0000-000000000031', y.starts + interval '18 hours', 'pending'),
  ('ffffffff-0000-0000-0000-000000000040', 'dddddddd-0000-0000-0000-000000000040', y.starts, 'pending'),
  ('ffffffff-0000-0000-0000-000000000041', 'dddddddd-0000-0000-0000-000000000041', y.ends, 'verified'),
  ('ffffffff-0000-0000-0000-000000000042', 'dddddddd-0000-0000-0000-000000000042', y.starts - interval '1 microsecond', 'verified'),
  ('ffffffff-0000-0000-0000-000000000142', 'dddddddd-0000-0000-0000-000000000042', y.starts + interval '6 hours', 'rejected'),
  ('ffffffff-0000-0000-0000-000000000043', 'dddddddd-0000-0000-0000-000000000043', y.starts - interval '1 day', 'verified'),
  ('ffffffff-0000-0000-0000-000000000044', 'dddddddd-0000-0000-0000-000000000044', y.starts + interval '12 hours', 'verified')
) as v(id, profile_id, started_at, verification);

-- The LI board: verified runs for 31–39 (nine drivers; 31 holds two periods),
-- an unverified run for 40, a global-scope run for 41 and a GG run for 44.
insert into leaderboard_entries (drive_id, profile_id, metric, value, scope, country, period,
                                 verification, recorded_at)
select ('ffffffff-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       ('dddddddd-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'top_speed', 30, 'country', 'LI', 'all', 'verified', now()
from generate_series(31, 39) n;

insert into leaderboard_entries (drive_id, profile_id, metric, value, scope, country, period,
                                 verification, recorded_at)
values
  ('ffffffff-0000-0000-0000-000000000031', 'dddddddd-0000-0000-0000-000000000031',
   'top_speed', 30, 'country', 'LI', 'week', 'verified', now()),
  ('ffffffff-0000-0000-0000-000000000040', 'dddddddd-0000-0000-0000-000000000040',
   'top_speed', 30, 'country', 'LI', 'all', 'unverified', now()),
  ('ffffffff-0000-0000-0000-000000000041', 'dddddddd-0000-0000-0000-000000000041',
   'top_speed', 30, 'global', null, 'all', 'verified', now()),
  ('ffffffff-0000-0000-0000-000000000044', 'dddddddd-0000-0000-0000-000000000044',
   'top_speed', 30, 'country', 'GG', 'all', 'verified', now());

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select 1 from drives $$,
  '42501', null,
  'control: the caller cannot read a single drive'
);

-- 31–40 drove yesterday (ten); 41, 42, 43 and 44 did not count. The board
-- holds nine verified LI drivers: one short, so withheld.
select results_eq(
  $$ select drivers, drove_yesterday from public.country_activity('LI') $$,
  $$ values (null::bigint, 10::bigint) $$,
  'ten drove yesterday, counted once each; nine on the board are withheld'
);

select results_eq(
  $$ select drivers, drove_yesterday from public.country_activity('li') $$,
  $$ values (null::bigint, 10::bigint) $$,
  'the code is matched whatever its case'
);

select results_eq(
  $$ select drivers, drove_yesterday from public.country_activity('ZZ') $$,
  $$ values (null::bigint, null::bigint) $$,
  'an unknown country is one row of withheld counts, not an error and not no row'
);

reset role;

-- ── each floor, from the other side ─────────────────────────────────────────
-- 40's run is verified: ten on the board.
update leaderboard_entries set verification = 'verified'
where drive_id = 'ffffffff-0000-0000-0000-000000000040';

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000031","role":"authenticated"}';

select results_eq(
  $$ select drivers, drove_yesterday from public.country_activity('LI') $$,
  $$ values (10::bigint, 10::bigint) $$,
  'FLOOR: ten verified drivers on the board are printed'
);

reset role;

-- 39's drive is rejected after all: nine drove yesterday.
update drives set verification = 'rejected' where id = 'ffffffff-0000-0000-0000-000000000039';

select results_eq(
  $$ select drivers, drove_yesterday from public.country_activity('LI') $$,
  $$ values (10::bigint, null::bigint) $$,
  'FLOOR: a rejected drive does not count, and nine who drove are withheld'
);

-- ══ onboarding_answers ═══════════════════════════════════════════════════════

select has_table('public', 'onboarding_answers', 'onboarding_answers exists');
select col_is_pk('public', 'onboarding_answers', 'profile_id', 'one row per profile');
select fk_ok('public', 'onboarding_answers', 'profile_id', 'public', 'profiles', 'id',
  'profile_id references profiles');
select is(
  (select confdeltype from pg_constraint
    where conrelid = 'public.onboarding_answers'::regclass and contype = 'f'),
  'c'::"char",
  'and is deleted with it'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.onboarding_answers'::regclass),
  'RLS is enabled on onboarding_answers'
);
select policies_are('public', 'onboarding_answers',
  array['onboarding_answers_select', 'onboarding_answers_insert', 'onboarding_answers_update'],
  'own-row select, insert and update; no delete policy'
);

-- Exact privilege sets. Writes are column grants, so the table-level set for
-- authenticated is SELECT alone, and updated_at is writable by nobody.
select table_privs_are('public', 'onboarding_answers', 'anon', array[]::text[],
  'anon holds no privilege on onboarding_answers');
select table_privs_are('public', 'onboarding_answers', 'authenticated', array['SELECT'],
  'authenticated may only SELECT the table as a whole');
select column_privs_are('public', 'onboarding_answers', 'focus', 'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'], 'authenticated may write focus');
select column_privs_are('public', 'onboarding_answers', 'attribution', 'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'], 'authenticated may write attribution');
select column_privs_are('public', 'onboarding_answers', 'profile_id', 'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'], 'authenticated may name profile_id (RLS keeps it theirs)');
select column_privs_are('public', 'onboarding_answers', 'updated_at', 'authenticated',
  array['SELECT'], 'updated_at is the server''s: no client writes it');
select table_privs_are('public', 'onboarding_answers', 'service_role',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has full access');

-- A row of someone else's to attack.
insert into onboarding_answers (profile_id, focus, attribution)
values ('dddddddd-0000-0000-0000-000000000002', 'beatFriends', 'reddit');

-- ── as driver 1 ──────────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';

-- Exactly the statement supabase-js sends for upsert({ profile_id, focus },
-- { onConflict: 'profile_id' }): the answer it has, and nothing it doesn't.
select lives_ok(
  $$ insert into onboarding_answers (profile_id, focus)
     values ('dddddddd-0000-0000-0000-000000000001', 'topSpeed')
     on conflict (profile_id) do update
       set profile_id = excluded.profile_id, focus = excluded.focus $$,
  'a driver can save their focus'
);

select lives_ok(
  $$ insert into onboarding_answers (profile_id, attribution)
     values ('dddddddd-0000-0000-0000-000000000001', 'tiktok')
     on conflict (profile_id) do update
       set profile_id = excluded.profile_id, attribution = excluded.attribution $$,
  'and then their attribution, by the same upsert'
);

select results_eq(
  $$ select profile_id::text, focus, attribution from onboarding_answers $$,
  $$ values ('dddddddd-0000-0000-0000-000000000001', 'topSpeed', 'tiktok') $$,
  'the second answer did not blank the first, and only their own row is visible'
);

select throws_ok(
  $$ insert into onboarding_answers (profile_id, focus)
     values ('dddddddd-0000-0000-0000-000000000003', 'topSpeed') $$,
  '42501', null,
  'ATTACK BLOCKED: cannot answer for another driver'
);

select throws_ok(
  $$ insert into onboarding_answers (profile_id, focus)
     values ('dddddddd-0000-0000-0000-000000000002', 'topSpeed')
     on conflict (profile_id) do update set focus = excluded.focus $$,
  '42501', null,
  'ATTACK BLOCKED: cannot overwrite another driver''s answers through an upsert'
);

select lives_ok(
  $$ update onboarding_answers set attribution = 'x'
      where profile_id = 'dddddddd-0000-0000-0000-000000000002' $$,
  'an update aimed at another driver runs…'
);

select throws_ok(
  $$ update onboarding_answers set profile_id = 'dddddddd-0000-0000-0000-000000000003'
      where profile_id = 'dddddddd-0000-0000-0000-000000000001' $$,
  '42501', null,
  'ATTACK BLOCKED: cannot move their row onto another driver'
);

select throws_ok(
  $$ update onboarding_answers set updated_at = '2000-01-01'
      where profile_id = 'dddddddd-0000-0000-0000-000000000001' $$,
  '42501', null,
  'cannot backdate updated_at'
);

select throws_ok(
  $$ delete from onboarding_answers where profile_id = 'dddddddd-0000-0000-0000-000000000001' $$,
  '42501', null,
  'no client deletes answers: they go with the account'
);

select throws_ok(
  $$ update onboarding_answers set focus = 'fastest' $$,
  '23514', null,
  'a focus outside the four keys is refused'
);

select throws_ok(
  $$ update onboarding_answers set attribution = 'facebook' $$,
  '23514', null,
  'an attribution outside the eight keys is refused'
);

reset role;

select is(
  (select attribution from onboarding_answers
    where profile_id = 'dddddddd-0000-0000-0000-000000000002'),
  'reddit',
  '…and RLS matched no rows: the other driver''s answer is unchanged'
);

-- Every key the client stores is accepted.
select lives_ok(
  $$ insert into onboarding_answers (profile_id, focus, attribution)
     select ('dddddddd-0000-0000-0000-' || lpad((10 + i)::text, 12, '0'))::uuid, f, a
     from unnest(
       array['topSpeed', 'zeroToSixty', 'localRanking', 'beatFriends',
             'topSpeed', 'zeroToSixty', 'localRanking', 'beatFriends'],
       array['tiktok', 'appStore', 'friend', 'x', 'other', 'reddit', 'youtube', 'instagram']
     ) with ordinality as k(f, a, i) $$,
  'all four focus keys and all eight attribution keys are accepted'
);

-- The trigger stamps every write, whatever the row said before.
update onboarding_answers set updated_at = '2000-01-01'
where profile_id = 'dddddddd-0000-0000-0000-000000000001';
select is(
  (select updated_at from onboarding_answers
    where profile_id = 'dddddddd-0000-0000-0000-000000000001'),
  now(),
  'updated_at is set by the server on every write'
);

-- ── signed out ───────────────────────────────────────────────────────────────

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select 1 from onboarding_answers $$,
  '42501', null,
  'ATTACK BLOCKED: a signed-out caller cannot read anyone''s answers'
);

reset role;

-- ── the account goes, the answers go ─────────────────────────────────────────

delete from auth.users where id = 'dddddddd-0000-0000-0000-000000000001';

select is_empty(
  $$ select profile_id from onboarding_answers
      where profile_id = 'dddddddd-0000-0000-0000-000000000001' $$,
  'deleting the account deletes its answers'
);

select * from finish();
rollback;
