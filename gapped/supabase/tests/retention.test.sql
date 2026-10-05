-- ─────────────────────────────────────────────────────────────────────────────
-- Retention (0021): the three promises the privacy policy makes about time,
-- each held to both sides of its boundary.
--
--   raw fixes and the untrimmed route   gone 90 days after the drive, final
--                                       verdict or still pending; the drive
--                                       and what was derived from it stay
--   rate-limit counters                 gone after 2 days
--   abandoned anonymous accounts        gone after 30 days — only when
--                                       anonymous, nameless, driveless and
--                                       unused, all at once
--
-- and the schedule: three named daily jobs, scheduled once however often the
-- migration runs. Rows already in the local database are set aside first, so
-- they cannot move the counts. All of it is rolled back.
--
--   npm run test:db
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(27);

-- ══ shape ════════════════════════════════════════════════════════════════════

select has_column('public', 'drives', 'fixes_purged_at', 'drives.fixes_purged_at exists');
select col_type_is('public', 'drives', 'fixes_purged_at', 'timestamp with time zone',
  'fixes_purged_at is a timestamptz');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.oid in ('public.purge_drive_raw_data(interval, int)'::regprocedure,
                      'public.purge_rate_limits(interval)'::regprocedure,
                      'public.purge_abandoned_anonymous_users(interval)'::regprocedure,
                      'public.schedule_retention_jobs()'::regprocedure)
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE')) $$,
  'no client can run a retention function'
);

-- ══ 1. raw drive data ════════════════════════════════════════════════════════

-- Anything already due in the local database is marked done, so the counts
-- below are this fixture's.
update drives set fixes_purged_at = '-infinity'
where fixes_purged_at is null and started_at < now() - interval '90 days';

insert into auth.users (id, instance_id, aud, role, email) values
  ('a0a0a0a0-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'retention@example.com');
update profiles set username = 'retention_driver', country = 'GG'
where id = 'a0a0a0a0-0000-0000-0000-000000000001';

--   old_verified   started 100 days ago, verified    → purged
--   old_rejected   started  91 days ago, rejected    → purged
--   old_pending    started 120 days ago, pending     → purged (nobody is still checking it)
--   recent         started  89 days ago, verified    → kept
--   recent_pending started  30 days ago, pending     → kept
insert into drives (id, profile_id, started_at, ended_at, distance_m, duration_s,
                    max_speed_ms, avg_speed_ms, verification)
select v.id::uuid, 'a0a0a0a0-0000-0000-0000-000000000001', now() - v.age, now() - v.age + interval '1 hour',
       12345, 3600, 30, 10, v.verification
from (values
  ('a1a1a1a1-0000-0000-0000-000000000001', interval '100 days', 'verified'),
  ('a1a1a1a1-0000-0000-0000-000000000002', interval '91 days',  'rejected'),
  ('a1a1a1a1-0000-0000-0000-000000000003', interval '120 days', 'pending'),
  ('a1a1a1a1-0000-0000-0000-000000000004', interval '89 days',  'verified'),
  ('a1a1a1a1-0000-0000-0000-000000000005', interval '30 days',  'pending')
) as v(id, age, verification);

update drives set route_polyline = '_p~iF~ps|U_ulLnnqC'
where id = 'a1a1a1a1-0000-0000-0000-000000000001';

insert into drive_fixes (drive_id, t, lat, lon, speed_ms)
select d.id, d.started_at + make_interval(secs => s), 49.45, -2.58 + s * 0.0001, 20
from drives d, generate_series(1, 5) s
where d.id::text like 'a1a1a1a1-0000-0000-0000-%';

insert into drive_routes_private (drive_id, route_full)
select d.id, 'LINESTRING(-2.58 49.45, -2.57 49.46)'::geography
from drives d where d.id::text like 'a1a1a1a1-0000-0000-0000-%';

select is(public.purge_drive_raw_data(interval '90 days', 1), 1,
  'a batch is honoured: one drive per run when asked for one');
select is(public.purge_drive_raw_data(), 2, 'the next run takes the other due drives, the old pending one included');
select is(public.purge_drive_raw_data(), 0, 'and a run after that finds nothing: idempotent');

select results_eq(
  $$ select d.id::text,
            (select count(*)::int from drive_fixes f where f.drive_id = d.id),
            (select count(*)::int from drive_routes_private r where r.drive_id = d.id),
            d.fixes_purged_at is not null
       from drives d where d.id::text like 'a1a1a1a1-0000-0000-0000-%' order by d.id $$,
  $$ values ('a1a1a1a1-0000-0000-0000-000000000001', 0, 0, true),
            ('a1a1a1a1-0000-0000-0000-000000000002', 0, 0, true),
            ('a1a1a1a1-0000-0000-0000-000000000003', 0, 0, true),
            ('a1a1a1a1-0000-0000-0000-000000000004', 5, 1, false),
            ('a1a1a1a1-0000-0000-0000-000000000005', 5, 1, false) $$,
  'over 90 days, verified, rejected or pending: fixes and untrimmed route gone and stamped; recent: kept'
);

select results_eq(
  $$ select distance_m, verification, route_polyline from drives
      where id = 'a1a1a1a1-0000-0000-0000-000000000001' $$,
  $$ values (12345::double precision, 'verified'::text, '_p~iF~ps|U_ulLnnqC'::text) $$,
  'the drive itself, its derived numbers and its trimmed route stay'
);

select is(
  (select fixes_purged_at from drives where id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  now(),
  'fixes_purged_at records when'
);

-- The window is the parameter: a shorter one takes the recent drives too,
-- pending or not.
select is(public.purge_drive_raw_data(interval '20 days'), 2,
  'a shorter window takes what it covers, verified or pending');

-- ══ 2. rate-limit counters ═══════════════════════════════════════════════════

update rate_limits set window_start = now() where window_start < now() - interval '2 days';

insert into rate_limits (profile_id, bucket, window_start, count) values
  ('a0a0a0a0-0000-0000-0000-000000000001', 'old_bucket', now() - interval '2 days 1 minute', 3),
  ('a0a0a0a0-0000-0000-0000-000000000001', 'new_bucket', now() - interval '1 day 23 hours', 3);

select is(public.purge_rate_limits(), 1, 'one counter is over two days old');
select results_eq(
  $$ select bucket from rate_limits where profile_id = 'a0a0a0a0-0000-0000-0000-000000000001' $$,
  $$ values ('new_bucket'::text) $$,
  'the one inside two days is kept'
);

-- ══ 3. abandoned anonymous accounts ══════════════════════════════════════════

-- Local anonymous users that happen to qualify are set aside.
update auth.users set created_at = now() where is_anonymous and created_at < now() - interval '30 days';

--   01 anonymous, 31 days, no name, no drives, unused   → deleted
--   02 anonymous, 31 days, has a username               → kept
--   03 anonymous, 31 days, has a drive                  → kept
--   04 anonymous, 29 days                               → kept
--   05 NOT anonymous (signed up), 31 days, no name      → kept
--   06 anonymous, 31 days, a session refreshed 2 days ago → kept
--   07 anonymous, 31 days, signed in yesterday          → kept
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, last_sign_in_at)
select ('a2a2a2a2-0000-0000-0000-0000000000' || v.k)::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', v.anon, now() - v.age, now() - v.last_in
from (values
  ('01', true,  interval '31 days', interval '31 days'),
  ('02', true,  interval '31 days', interval '31 days'),
  ('03', true,  interval '31 days', interval '31 days'),
  ('04', true,  interval '29 days', interval '29 days'),
  ('05', false, interval '31 days', interval '31 days'),
  ('06', true,  interval '31 days', interval '31 days'),
  ('07', true,  interval '31 days', interval '1 day')
) as v(k, anon, age, last_in);

update profiles set username = 'anon_with_name' where id = 'a2a2a2a2-0000-0000-0000-000000000002';
insert into drives (profile_id, started_at, ended_at, distance_m, duration_s, max_speed_ms, avg_speed_ms)
values ('a2a2a2a2-0000-0000-0000-000000000003', now() - interval '40 days', now() - interval '40 days',
        100, 60, 10, 5);
insert into auth.sessions (id, user_id, created_at, updated_at)
values (gen_random_uuid(), 'a2a2a2a2-0000-0000-0000-000000000006',
        now() - interval '31 days', now() - interval '2 days');

-- What 01 leaves behind besides the profile: a car and onboarding answers.
insert into vehicles (profile_id, kind, make, model, is_primary)
values ('a2a2a2a2-0000-0000-0000-000000000001', 'car', 'Fiat', 'Panda', true);
insert into onboarding_answers (profile_id, focus)
values ('a2a2a2a2-0000-0000-0000-000000000001', 'topSpeed');

select is(public.purge_abandoned_anonymous_users(), 1, 'exactly one account qualifies');
select results_eq(
  $$ select substr(id::text, 35) from auth.users
      where id::text like 'a2a2a2a2-0000-0000-0000-%' order by id $$,
  $$ values ('02'), ('03'), ('04'), ('05'), ('06'), ('07') $$,
  'the anonymous, nameless, driveless, unused one went; every other is kept'
);
select is_empty(
  $$ select 1 from profiles where id = 'a2a2a2a2-0000-0000-0000-000000000001'
     union all select 1 from vehicles where profile_id = 'a2a2a2a2-0000-0000-0000-000000000001'
     union all select 1 from onboarding_answers where profile_id = 'a2a2a2a2-0000-0000-0000-000000000001' $$,
  'its profile, car and answers went with it'
);
select is(public.purge_abandoned_anonymous_users(), 0, 'a second run finds nothing');

-- ══ 4. the schedule ══════════════════════════════════════════════════════════
-- pg_cron is enabled on the local stack and on Supabase. Where it is not, the
-- migration still applies and schedules nothing — and these fail, because the
-- policy's promises are then not being kept by anything.

select ok(
  exists (select 1 from pg_extension where extname = 'pg_cron'),
  'pg_cron is enabled'
);

select results_eq(
  $$ select jobname::text, schedule::text, command::text, active
       from cron.job where jobname like 'gapped\_%' order by jobname $$,
  $$ values ('gapped_purge_anonymous_users', '40 3 * * *', 'select public.purge_abandoned_anonymous_users()', true),
            ('gapped_purge_drive_raw_data',  '10 3 * * *', 'select public.purge_drive_raw_data()',            true),
            ('gapped_purge_rate_limits',     '25 3 * * *', 'select public.purge_rate_limits()',               true) $$,
  'three daily jobs, by name, each calling its function'
);

select is(public.schedule_retention_jobs(), 3, 'scheduling again…');
select is(
  (select count(*)::int from cron.job where jobname like 'gapped\_%'),
  3,
  '…replaces the jobs by name instead of adding copies'
);

select is(
  (select username::text from cron.job where jobname = 'gapped_purge_anonymous_users'),
  'postgres',
  'the jobs run as postgres, which owns the functions and may delete auth users'
);

-- ══ 5. a client cannot reach any of it ═══════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0a0a0a0-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok($$ select public.purge_drive_raw_data() $$, '42501', null,
  'ATTACK BLOCKED: a client cannot purge drives');
select throws_ok($$ select public.purge_abandoned_anonymous_users() $$, '42501', null,
  'ATTACK BLOCKED: a client cannot delete accounts');
select throws_ok($$ select public.purge_rate_limits() $$, '42501', null,
  'ATTACK BLOCKED: a client cannot reset rate limits');
select throws_ok($$ select public.schedule_retention_jobs() $$, '42501', null,
  'ATTACK BLOCKED: a client cannot reschedule the jobs');
select throws_ok($$ update drives set fixes_purged_at = null $$, '42501', null,
  'ATTACK BLOCKED: a client cannot un-mark a purge (drives has no client UPDATE)');

-- The column is readable with the rest of the driver's own drive: all five,
-- once the shorter window above took the two recent ones.
select results_eq(
  $$ select count(*)::int from drives where fixes_purged_at is not null $$,
  $$ values (5) $$,
  'a driver sees which of their own drives have been purged'
);

reset role;

select * from finish();
rollback;
