-- ─────────────────────────────────────────────────────────────────────────────
-- Who may call what (0018), as it stands after every migration.
--
-- The launch audit found functions callable by roles that had no business
-- calling them, because "revoke from public" does not remove a grant made to
-- anon or authenticated by name. So this asserts the outcome the way a client
-- meets it — has_function_privilege, which counts every path to EXECUTE — and
-- asserts it as an exact set, so a function added later without thinking about
-- its grants fails here rather than shipping as a public RPC.
--
-- Also: functions created from now on start private, friendships is readable
-- (empty) without a session, and spatial_ref_sys refuses writes from the API
-- roles whose grants on it postgres cannot revoke.
--
--   npm run test:db
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(25);

-- ══ the exact sets ═══════════════════════════════════════════════════════════
-- Functions this project wrote: everything in `public` that is not an
-- extension member (PostGIS lives in `public` too, and is not ours to grant).

create temp view our_functions as
select p.oid
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
  );

select set_eq(
  $$ select f.oid::regprocedure::text from our_functions f
      where has_function_privilege('anon', f.oid, 'EXECUTE') $$,
  $$ select unnest(array[
       'public.board_top(text, text, text, text, boolean, int, text)',
       'public.board_brackets(text, text, text, text, boolean)',
       'public.make_popularity(text)',
       'public.country_activity(text)'
     ]::regprocedure[])::text $$,
  'anon may call exactly the four RPCs a signed-out first launch needs'
);

select set_eq(
  $$ select f.oid::regprocedure::text from our_functions f
      where has_function_privilege('authenticated', f.oid, 'EXECUTE') $$,
  $$ select unnest(array[
       'public.board_top(text, text, text, text, boolean, int, text)',
       'public.board_brackets(text, text, text, text, boolean)',
       'public.make_popularity(text)',
       'public.country_activity(text)',
       'public.list_friends()',
       'public.add_friend(text)',
       'public.remove_friend(uuid)',
       'public.delete_account()',
       'public.delete_drives_and_reconcile(uuid[], boolean)',
       'public.report_driver(uuid, text, text)',
       'public.list_blocked()'
     ]::regprocedure[])::text $$,
  'authenticated may call exactly the app''s RPCs'
);

-- A null ACL means "the defaults", which include EXECUTE for PUBLIC.
select is_empty(
  $$ select f.oid::regprocedure::text
       from our_functions f join pg_proc p on p.oid = f.oid
      where p.proacl is null
         or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) $$,
  'PUBLIC holds EXECUTE on none of our functions'
);

-- ── the audit's named findings ──────────────────────────────────────────────

select function_privs_are('public', 'consume_rate_limit', array['uuid', 'text', 'integer', 'integer'],
  'anon', array[]::text[], 'anon cannot spend anyone''s rate limit');
select function_privs_are('public', 'consume_rate_limit', array['uuid', 'text', 'integer', 'integer'],
  'authenticated', array[]::text[], 'authenticated cannot spend anyone''s rate limit');
select function_privs_are('public', 'consume_rate_limit', array['uuid', 'text', 'integer', 'integer'],
  'service_role', array['EXECUTE'], 'verify-drive (service_role) still can');
select function_privs_are('public', 'delete_account', array[]::text[],
  'anon', array[]::text[], 'delete_account is not offered signed-out');
select function_privs_are('public', 'delete_drives_and_reconcile', array['uuid[]', 'boolean'],
  'anon', array[]::text[], 'delete_drives_and_reconcile is not offered signed-out');
select function_privs_are('public', 'handle_new_user', array[]::text[],
  'anon', array[]::text[], 'the signup trigger function is not an RPC (anon)');
select function_privs_are('public', 'handle_new_user', array[]::text[],
  'authenticated', array[]::text[], 'the signup trigger function is not an RPC (authenticated)');

-- In the form a client meets it.
insert into auth.users (id, instance_id, aud, role, email) values
  ('abababab-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hardening-a@example.com'),
  ('abababab-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hardening-b@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.consume_rate_limit('abababab-0000-0000-0000-000000000002', 'verify_drive', 1, 3600) $$,
  '42501', null,
  'ATTACK BLOCKED: a driver cannot burn another driver''s verify-drive quota'
);

reset role;

-- ══ functions created from now on ════════════════════════════════════════════
-- Created as postgres, the way a migration or the dashboard's SQL editor would.

create function public.zz_hardening_probe() returns int language sql as 'select 1';

select is(has_function_privilege('anon', 'public.zz_hardening_probe()', 'EXECUTE'), false,
  'a new function is not callable by anon (not even through PUBLIC)');
select is(has_function_privilege('authenticated', 'public.zz_hardening_probe()', 'EXECUTE'), false,
  'a new function is not callable by authenticated');
select ok(
  exists (
    select 1 from pg_default_acl
    where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'f'
  ),
  'the GLOBAL default for postgres''s functions is set (the per-schema one cannot remove PUBLIC)'
);

-- ══ boards and friendships without a session ═════════════════════════════════

insert into friendships (profile_id, friend_id)
values ('abababab-0000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000002');

select table_privs_are('public', 'friendships', 'anon', array['SELECT'],
  'anon may SELECT friendships, and nothing else');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is((select count(*)::int from friendships), 0,
  'with no session RLS returns no friendship at all');

select lives_ok(
  $$ select * from public.board_top('top_speed', 'global', 'all') $$,
  'board_top answers a caller with no session'
);
select lives_ok(
  $$ select * from public.board_brackets('top_speed', 'all') $$,
  'board_brackets answers a caller with no session'
);

-- ══ spatial_ref_sys ══════════════════════════════════════════════════════════

select is((select count(*)::int from spatial_ref_sys where srid = 4326), 1,
  'control: anon can still read the reference data');

select throws_ok(
  $$ insert into spatial_ref_sys (srid, auth_name, auth_srid) values (990001, 'x', 1) $$,
  '42501', 'spatial_ref_sys is read-only',
  'ATTACK BLOCKED: anon cannot add a coordinate system'
);
select throws_ok(
  $$ update spatial_ref_sys set proj4text = '' where srid = 4326 $$,
  '42501', 'spatial_ref_sys is read-only',
  'ATTACK BLOCKED: anon cannot rewrite WGS 84'
);
select throws_ok(
  $$ delete from spatial_ref_sys where srid = 4326 $$,
  '42501', 'spatial_ref_sys is read-only',
  'ATTACK BLOCKED: anon cannot delete WGS 84'
);
select throws_ok(
  $$ truncate spatial_ref_sys $$,
  '42501', 'spatial_ref_sys is read-only',
  'ATTACK BLOCKED: anon cannot empty the table'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ update spatial_ref_sys set proj4text = '' where srid = 4326 $$,
  '42501', 'spatial_ref_sys is read-only',
  'ATTACK BLOCKED: a signed-in client cannot rewrite it either'
);

reset role;

select lives_ok(
  $$ update spatial_ref_sys set srtext = srtext where srid = 4326 $$,
  'control: postgres (and so a PostGIS upgrade) still writes'
);

select * from finish();
rollback;
