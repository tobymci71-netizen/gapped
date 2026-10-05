-- ─────────────────────────────────────────────────────────────────────────────
-- What the boards show, and to whom (0020).
--
--   * hidden drivers are on nobody's board, bracket count, friends list or
--     make count; blocked drivers are on none of the blocker's, and still on
--     everyone else's
--   * leaderboard_entries is read only through the board functions, which
--     keep their signatures and columns, return the day rather than the
--     minute, and return at most 100 rows
--   * trip_count counts distance rows, so a drive with no top_speed row (over
--     the national limit) still counts
--   * achievements are their owner's
--
-- The fixture boards are San Marino and Andorra, emptied first; existing rows
-- elsewhere cannot move these numbers. All of it is rolled back.
--
--   npm run test:db
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(45);

-- ══ shape ════════════════════════════════════════════════════════════════════

select is_definer('public', 'board_top', array['text', 'text', 'text', 'text', 'boolean', 'integer', 'text'],
  'board_top is SECURITY DEFINER');
select is_definer('public', 'board_brackets', array['text', 'text', 'text', 'text', 'boolean'],
  'board_brackets is SECURITY DEFINER');
select is_definer('public', 'list_friends', array[]::text[], 'list_friends is SECURITY DEFINER');
select is_definer('public', 'make_popularity', array['text'], 'make_popularity is SECURITY DEFINER');
select is_definer('public', 'country_activity', array['text'], 'country_activity is SECURITY DEFINER');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.oid in ('public.board_top(text, text, text, text, boolean, int, text)'::regprocedure,
                      'public.board_brackets(text, text, text, text, boolean)'::regprocedure,
                      'public.list_friends()'::regprocedure,
                      'public.make_popularity(text)'::regprocedure,
                      'public.country_activity(text)'::regprocedure)
        and p.proconfig is distinct from array['search_path=""'] $$,
  'all five pin an empty search_path'
);

-- Same signatures, same columns: the app (src/board/boards.ts,
-- src/social/friends.ts) reads them by name.
create temp view returned_columns as
select p.oid as fn, array_agg(a.n || ' ' || format_type(a.t, null) order by a.i) as cols
from pg_proc p,
     unnest(p.proargnames, p.proallargtypes, p.proargmodes) with ordinality as a(n, t, m, i)
where a.m = 't'
group by p.oid;

select is(
  (select cols from returned_columns
    where fn = 'public.board_top(text, text, text, text, boolean, int, text)'::regprocedure),
  array['id uuid', 'profile_id uuid', 'username text', 'country character', 'value double precision',
        'verification text', 'recorded_at timestamp with time zone', 'bracket_key text'],
  'board_top returns the same columns'
);
select is(
  (select cols from returned_columns
    where fn = 'public.board_brackets(text, text, text, text, boolean)'::regprocedure),
  array['bracket_key text', 'entries bigint'],
  'board_brackets returns the same columns'
);
select is(
  (select cols from returned_columns where fn = 'public.list_friends()'::regprocedure),
  array['friend_id uuid', 'username text', 'country character', 'best_speed double precision',
        'added_at timestamp with time zone'],
  'list_friends returns the same columns'
);

-- ══ leaderboard_entries: through the functions only ══════════════════════════

select table_privs_are('public', 'leaderboard_entries', 'anon', array[]::text[],
  'anon holds no privilege on leaderboard_entries');
select table_privs_are('public', 'leaderboard_entries', 'authenticated', array[]::text[],
  'authenticated holds no privilege on leaderboard_entries');
select policies_are('public', 'leaderboard_entries', array[]::name[],
  'no policy is left to re-open it if a grant comes back');

-- ══ fixture ══════════════════════════════════════════════════════════════════
--   V  bp_viewer   follows A, B, C          W  bp_other
--   A  bp_alpha    SM, top speed 50  class zz-a
--   B  bp_bravo    SM, top speed 45  class zz-a
--   C  bp_charlie  SM, top speed 40  class zz-c
--   D  bp_delta    SM, two drives with distance rows only (both over the limit)
--   105 bulk drivers on the SM top-speed board at 10, no class
--   10 Andorran drivers with verified distance rows only
--   A, B, C and bulk 1–3 drive a "Zzyzx": six drivers of one make

delete from leaderboard_entries where country in ('SM', 'AD');
update profiles set country = null where country in ('SM', 'AD');

insert into auth.users (id, instance_id, aud, role, email)
select ('adadadad-0000-0000-0000-0000000000' || k)::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', 'bp-' || k || '@example.com'
from unnest(array['01', '02', '0a', '0b', '0c', '0d']) k
union all
select ('aeaeaeae-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', 'bp-bulk-' || n || '@example.com'
from generate_series(1, 105) n
union all
select ('afafafaf-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', 'bp-ad-' || n || '@example.com'
from generate_series(1, 10) n;

update profiles p set username = v.username, country = v.country
from (values
  ('adadadad-0000-0000-0000-000000000001'::uuid, 'bp_viewer', 'GB'),
  ('adadadad-0000-0000-0000-000000000002'::uuid, 'bp_other', 'GB'),
  ('adadadad-0000-0000-0000-00000000000a'::uuid, 'bp_alpha', 'SM'),
  ('adadadad-0000-0000-0000-00000000000b'::uuid, 'bp_bravo', 'SM'),
  ('adadadad-0000-0000-0000-00000000000c'::uuid, 'bp_charlie', 'SM'),
  ('adadadad-0000-0000-0000-00000000000d'::uuid, 'bp_delta', 'SM')
) as v(id, username, country)
where p.id = v.id;

update profiles set username = 'bp_bulk_' || substr(id::text, 31), country = 'SM'
where id::text like 'aeaeaeae-0000-0000-0000-%';
update profiles set username = 'bp_ad_' || substr(id::text, 31), country = 'AD'
where id::text like 'afafafaf-0000-0000-0000-%';

insert into drives (id, profile_id, started_at, ended_at, distance_m, duration_s,
                    max_speed_ms, avg_speed_ms, verification)
values
  ('bdbdbdbd-0000-0000-0000-00000000000a', 'adadadad-0000-0000-0000-00000000000a',
   '2026-09-15 17:42:13+00', '2026-09-15 18:00:00+00', 1000, 1000, 50, 10, 'verified'),
  ('bdbdbdbd-0000-0000-0000-00000000000b', 'adadadad-0000-0000-0000-00000000000b',
   '2026-09-15 17:42:13+00', '2026-09-15 18:00:00+00', 1000, 1000, 45, 10, 'verified'),
  ('bdbdbdbd-0000-0000-0000-00000000000c', 'adadadad-0000-0000-0000-00000000000c',
   '2026-09-15 17:42:13+00', '2026-09-15 18:00:00+00', 1000, 1000, 40, 10, 'verified'),
  ('bdbdbdbd-0000-0000-0000-00000000000d', 'adadadad-0000-0000-0000-00000000000d',
   '2026-09-15 17:42:13+00', '2026-09-15 18:00:00+00', 1000, 1000, 60, 10, 'verified'),
  ('bdbdbdbd-0000-0000-0000-0000000001dd', 'adadadad-0000-0000-0000-00000000000d',
   '2026-09-16 08:00:00+00', '2026-09-16 09:00:00+00', 2000, 3600, 60, 10, 'verified');

insert into drives (id, profile_id, started_at, ended_at, distance_m, duration_s,
                    max_speed_ms, avg_speed_ms, verification)
select ('bebebebe-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       ('aeaeaeae-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '2026-09-15 12:00:00+00'::timestamptz, '2026-09-15 13:00:00+00'::timestamptz, 1000, 3600, 10, 5, 'verified'
from generate_series(1, 105) n
union all
select ('bfbfbfbf-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       ('afafafaf-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '2026-09-15 12:00:00+00', '2026-09-15 13:00:00+00', 500, 600, 20, 5, 'verified'
from generate_series(1, 10) n;

-- A, B, C: top speed, on the SM board and the global one (the friends board
-- reads global rows).
insert into leaderboard_entries (drive_id, profile_id, metric, value, scope, country,
                                 bracket_key, period, verification, recorded_at)
select d.id, d.profile_id, 'top_speed', v.speed, s.scope, s.country, v.bracket, 'all', 'verified',
       '2026-09-15 17:42:13+00'
from (values
  ('adadadad-0000-0000-0000-00000000000a'::uuid, 50::double precision, 'zz-a'),
  ('adadadad-0000-0000-0000-00000000000b'::uuid, 45, 'zz-a'),
  ('adadadad-0000-0000-0000-00000000000c'::uuid, 40, 'zz-c')
) as v(profile_id, speed, bracket)
join drives d on d.profile_id = v.profile_id
cross join (values ('country', 'SM'), ('global', null)) as s(scope, country);

-- D: distance rows only, as verify-drive writes a drive over the limit.
insert into leaderboard_entries (drive_id, profile_id, metric, value, scope, country,
                                 period, verification, recorded_at)
select d.id, d.profile_id, 'distance', d.distance_m, 'country', 'SM', 'all', 'verified', d.started_at
from drives d where d.profile_id = 'adadadad-0000-0000-0000-00000000000d';

insert into leaderboard_entries (drive_id, profile_id, metric, value, scope, country,
                                 period, verification, recorded_at)
select d.id, d.profile_id, 'top_speed', 10, 'country', 'SM', 'all', 'verified', d.started_at
from drives d where d.id::text like 'bebebebe-0000-0000-0000-%'
union all
select d.id, d.profile_id, 'distance', 500, 'country', 'AD', 'all', 'verified', d.started_at
from drives d where d.id::text like 'bfbfbfbf-0000-0000-0000-%';

insert into vehicles (profile_id, kind, make, model, is_primary)
select p.id, 'car', 'Zzyzx', 'Test', true
from profiles p
where p.id in ('adadadad-0000-0000-0000-00000000000a', 'adadadad-0000-0000-0000-00000000000b',
               'adadadad-0000-0000-0000-00000000000c', 'aeaeaeae-0000-0000-0000-000000000001',
               'aeaeaeae-0000-0000-0000-000000000002', 'aeaeaeae-0000-0000-0000-000000000003');

insert into friendships (profile_id, friend_id)
select 'adadadad-0000-0000-0000-000000000001', f
from unnest(array['adadadad-0000-0000-0000-00000000000a', 'adadadad-0000-0000-0000-00000000000b',
                  'adadadad-0000-0000-0000-00000000000c']::uuid[]) f;

select is(
  (select count(*)::int from leaderboard_entries where country = 'SM'),
  3 + 2 + 105,
  'fixture: the SM board holds A, B, C, D''s two drives and 105 bulk drivers'
);

-- ══ signed out ═══════════════════════════════════════════════════════════════

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select 1 from leaderboard_entries $$, '42501', null,
  'ATTACK BLOCKED: signed out, the entries table cannot be paged through');

select results_eq(
  $$ select username, value from public.board_top('top_speed', 'country', 'all', 'SM') limit 3 $$,
  $$ values ('bp_alpha'::text, 50::double precision), ('bp_bravo', 45), ('bp_charlie', 40) $$,
  'the SM board, best first'
);
select is_empty(
  $$ select 1 from public.board_top('top_speed', 'country', 'all', 'SM')
      where recorded_at <> '2026-09-15 00:00:00+00' and username in ('bp_alpha', 'bp_bravo', 'bp_charlie') $$,
  'recorded_at is the UTC day, not the minute (17:42:13 → 00:00)'
);
select is((select count(*)::int from public.board_top('top_speed', 'country', 'all', 'SM')), 50,
  'fifty rows by default');
select is((select count(*)::int from public.board_top('top_speed', 'country', 'all', 'SM', false, 1000)), 100,
  'and never more than 100, whatever the caller asks for');
select results_eq(
  $$ select username, value, verification from public.board_top('trip_count', 'country', 'all', 'SM') $$,
  $$ values ('bp_delta'::text, 2::double precision, 'verified'::text) $$,
  'trip_count counts distance rows: two drives with no top-speed row still count as two'
);
select results_eq(
  $$ select bracket_key, entries from public.board_brackets('top_speed', 'all', 'country', 'SM') $$,
  $$ values ('zz-a'::text, 2::bigint), ('zz-c', 1) $$,
  'the class picker counts A and B in zz-a, C in zz-c'
);
select results_eq(
  $$ select drivers from public.country_activity('AD') $$,
  $$ values (10::bigint) $$,
  'country_activity counts drivers on the board through distance rows too'
);
select results_eq(
  $$ select make, drivers from public.make_popularity('car') where make = 'Zzyzx' $$,
  $$ values ('Zzyzx'::text, 6::bigint) $$,
  'six Zzyzx drivers'
);

reset role;

-- ══ the owner hides B ════════════════════════════════════════════════════════

insert into moderation_hidden (profile_id, reason)
values ('adadadad-0000-0000-0000-00000000000b', 'test'),
       ('afafafaf-0000-0000-0000-000000000001', 'test');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select results_eq(
  $$ select username from public.board_top('top_speed', 'country', 'all', 'SM') limit 2 $$,
  $$ values ('bp_alpha'::text), ('bp_charlie') $$,
  'HIDDEN: B is off the SM board…'
);
select is_empty(
  $$ select 1 from public.board_top('top_speed', 'global', 'all', null, false, 100)
      where username = 'bp_bravo' $$,
  '…and off the global board'
);
select results_eq(
  $$ select bracket_key, entries from public.board_brackets('top_speed', 'all', 'country', 'SM') $$,
  $$ values ('zz-a'::text, 1::bigint), ('zz-c', 1) $$,
  'HIDDEN: B is not counted in zz-a'
);
select results_eq(
  $$ select make, drivers from public.make_popularity('car') where make = 'Zzyzx' $$,
  $$ values ('Zzyzx'::text, 5::bigint) $$,
  'HIDDEN: B''s car is not counted'
);
select results_eq(
  $$ select drivers from public.country_activity('AD') $$,
  $$ values (null::bigint) $$,
  'HIDDEN: a hidden Andorran is not counted, and nine is under the floor'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"adadadad-0000-0000-0000-000000000001","role":"authenticated"}';

select results_eq(
  $$ select username from public.board_top('top_speed', 'friends', 'all') $$,
  $$ values ('bp_alpha'::text), ('bp_charlie') $$,
  'HIDDEN: B is off the friends board of someone who follows them'
);
select results_eq(
  $$ select username, best_speed from public.list_friends() order by username $$,
  $$ values ('bp_alpha'::text, 50::double precision), ('bp_charlie', 40) $$,
  'HIDDEN: and off their friends list'
);

set local request.jwt.claims = '{"sub":"adadadad-0000-0000-0000-00000000000b","role":"authenticated"}';
select is_empty(
  $$ select 1 from public.board_top('top_speed', 'country', 'all', 'SM', false, 100)
      where username = 'bp_bravo' $$,
  'HIDDEN: B does not see themselves either'
);

-- ══ V blocks C ═══════════════════════════════════════════════════════════════

set local request.jwt.claims = '{"sub":"adadadad-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ insert into blocks (blocked_id) values ('adadadad-0000-0000-0000-00000000000c') $$,
  'V blocks C'
);
select results_eq(
  $$ select username from public.board_top('top_speed', 'country', 'all', 'SM') limit 1 $$,
  $$ values ('bp_alpha'::text) $$,
  'BLOCKED: V''s SM board goes A, then the bulk drivers…'
);
select is_empty(
  $$ select 1 from public.board_top('top_speed', 'country', 'all', 'SM', false, 100)
      where username = 'bp_charlie' $$,
  '…with C nowhere on it'
);
select results_eq(
  $$ select bracket_key, entries from public.board_brackets('top_speed', 'all', 'country', 'SM') $$,
  $$ values ('zz-a'::text, 1::bigint) $$,
  'BLOCKED: zz-c is not offered to V, whose zz-c board would be empty'
);
select results_eq(
  $$ select username from public.board_top('top_speed', 'friends', 'all') $$,
  $$ values ('bp_alpha'::text) $$,
  'BLOCKED: C is off V''s friends board'
);
select results_eq(
  $$ select username from public.list_friends() $$,
  $$ values ('bp_alpha'::text) $$,
  'BLOCKED: and off V''s friends list (the friendship itself is kept)'
);
select is_empty(
  $$ select 1 from public.make_popularity('car') where make = 'Zzyzx' $$,
  'BLOCKED: without C, four Zzyzx drivers are under the floor for V'
);
select throws_ok($$ select 1 from leaderboard_entries $$, '42501', null,
  'ATTACK BLOCKED: signed in, the entries table cannot be paged through either');

-- Everyone else's view is untouched.
set local request.jwt.claims = '{"sub":"adadadad-0000-0000-0000-000000000002","role":"authenticated"}';

select results_eq(
  $$ select username from public.board_top('top_speed', 'country', 'all', 'SM') limit 2 $$,
  $$ values ('bp_alpha'::text), ('bp_charlie') $$,
  'a block is private: W still sees C'
);
select results_eq(
  $$ select make, drivers from public.make_popularity('car') where make = 'Zzyzx' $$,
  $$ values ('Zzyzx'::text, 5::bigint) $$,
  'and W''s make count still includes C'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select results_eq(
  $$ select username from public.board_top('top_speed', 'country', 'all', 'SM') limit 2 $$,
  $$ values ('bp_alpha'::text), ('bp_charlie') $$,
  'and so does a signed-out caller'
);

reset role;

-- ══ the owner unhides B ══════════════════════════════════════════════════════

delete from moderation_hidden where profile_id = 'adadadad-0000-0000-0000-00000000000b';

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select results_eq(
  $$ select username from public.board_top('top_speed', 'country', 'all', 'SM') limit 3 $$,
  $$ values ('bp_alpha'::text), ('bp_bravo'), ('bp_charlie') $$,
  'unhidden, B is back where their run puts them'
);

reset role;

-- ══ achievements: their owner's ══════════════════════════════════════════════

insert into achievements (profile_id, kind, payload) values
  ('adadadad-0000-0000-0000-000000000001', 'first_verified_run', '{}'),
  ('adadadad-0000-0000-0000-00000000000a', 'first_verified_run', '{}');

select table_privs_are('public', 'achievements', 'anon', array[]::text[],
  'anon holds no privilege on achievements');

set local role authenticated;
set local request.jwt.claims = '{"sub":"adadadad-0000-0000-0000-000000000001","role":"authenticated"}';

select results_eq(
  $$ select profile_id::text, kind from achievements $$,
  $$ values ('adadadad-0000-0000-0000-000000000001', 'first_verified_run') $$,
  'a driver reads their own achievements and nobody else''s'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select 1 from achievements $$, '42501', null,
  'signed out, achievements are not readable at all');

reset role;

select * from finish();
rollback;
