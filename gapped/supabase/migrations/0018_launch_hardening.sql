-- ─────────────────────────────────────────────────────────────────────────────
-- Gapped — launch hardening: who may call what.
--
-- 0007 made TABLE privileges explicit. Functions were left to "revoke from
-- public, grant back", function by function, and that is not one rule on every
-- project. On a Supabase project the default privileges for functions postgres
-- creates in `public` grant EXECUTE to anon and authenticated BY NAME, not
-- through PUBLIC, so a `revoke ... from public` (0011, 0013, 0014) leaves those
-- grants in place. This local stack's defaults do not, which is why no local
-- run ever showed it. The launch audit found:
--
--   consume_rate_limit(uuid, text, int, int)
--       callable by any client. It takes the profile id as an argument, so
--       anyone could spend a stranger's verify-drive quota and lock their
--       drives out of verification for an hour at a time.
--   delete_account(), delete_drives_and_reconcile(uuid[], boolean)
--       callable signed-out. Both refuse a null auth.uid(), so nothing could
--       be deleted, but there is no reason for the endpoint to answer.
--   handle_new_user()
--       a trigger function, callable as an RPC by anyone. Postgres refuses to
--       run a trigger function outside a trigger, but it should not be offered.
--
-- So, as 0007 did for tables: start from zero on every function this schema
-- owns, grant back exactly the set the app calls, and make the migration
-- itself refuse to finish if the result is anything else.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══ 1. The functions named by the audit ══════════════════════════════════════
-- Section 3 covers these too. They are spelled out so the review of this file
-- does not depend on reading the loop.

revoke all on function public.consume_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, int, int) to service_role;

revoke all on function public.delete_account() from public, anon;
revoke all on function public.delete_drives_and_reconcile(uuid[], boolean) from public, anon;

revoke all on function public.handle_new_user() from public, anon, authenticated;


-- ══ 2. Functions created from now on ════════════════════════════════════════
-- The cloud project's per-schema default (postgres, public, functions) grants
-- EXECUTE to anon and authenticated. Revoking it here means a function added
-- by a later migration, or in the dashboard's SQL editor, starts callable by
-- nobody but its owner (and service_role, whose default grant is untouched)
-- until a migration grants it on purpose.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- That statement cannot remove PUBLIC's EXECUTE, though. PUBLIC gets it from
-- the GLOBAL default, and Postgres documents that a per-schema REVOKE only
-- undoes a per-schema GRANT ("you cannot revoke privileges per-schema if they
-- are granted globally"). Every new function would still be callable by anon
-- through PUBLIC. The global form is what actually closes it. It applies to
-- functions the postgres role creates in any schema; Supabase's own schemas
-- and extensions are created by supabase_admin and are not affected.
alter default privileges for role postgres
  revoke execute on functions from public;


-- ══ 3. Start from zero, grant back exactly what the app calls ═══════════════
-- Every function in `public` that this project wrote — extension members are
-- skipped: PostGIS lives in `public`, its functions belong to supabase_admin,
-- and the generated drive_fixes.point column and every geography value a
-- client reads need them executable. Revoking from service_role is left
-- alone: verify-drive and the admin scripts run as it.

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end $$;

-- The client's RPCs, from `grep -rn "\.rpc(" src app`:
--
--   src/board/boards.ts          board_top, board_brackets
--   src/social/friends.ts        list_friends, add_friend, remove_friend
--   src/onboarding/socialProof   make_popularity, country_activity
--   app/settings.tsx             delete_account
--
-- plus delete_drives_and_reconcile, the documented own-drives cleanup
-- (docs/DELETING_TEST_DRIVES.md), which is scoped to auth.uid().
--
-- anon only where a signed-out first launch needs an answer: the two proof
-- counts on the onboarding screens, and the boards, which a first launch can
-- show before the anonymous session exists (or when signing in is refused).

grant execute on function public.board_top(text, text, text, text, boolean, int, text)
  to anon, authenticated, service_role;
grant execute on function public.board_brackets(text, text, text, text, boolean)
  to anon, authenticated, service_role;
grant execute on function public.make_popularity(text)   to anon, authenticated, service_role;
grant execute on function public.country_activity(text)  to anon, authenticated, service_role;

grant execute on function public.list_friends()          to authenticated;
grant execute on function public.add_friend(text)        to authenticated;
grant execute on function public.remove_friend(uuid)     to authenticated;
grant execute on function public.delete_account()        to authenticated;
grant execute on function public.delete_drives_and_reconcile(uuid[], boolean) to authenticated;

-- ── the audit, as a gate ─────────────────────────────────────────────────────
-- has_function_privilege counts every path to EXECUTE (a direct grant, PUBLIC,
-- role membership), which is the question that matters. Anything callable by
-- anon or authenticated that is not on the list above fails the migration, and
-- so does anything on the list that is not callable. 0019 and 0020 add to the
-- list; supabase/tests/launch_hardening.test.sql holds the final set.

do $$
declare
  anon_ok regprocedure[] := array[
    'public.board_top(text, text, text, text, boolean, int, text)',
    'public.board_brackets(text, text, text, text, boolean)',
    'public.make_popularity(text)',
    'public.country_activity(text)'
  ]::regprocedure[];
  authenticated_ok regprocedure[] := anon_ok || array[
    'public.list_friends()',
    'public.add_friend(text)',
    'public.remove_friend(uuid)',
    'public.delete_account()',
    'public.delete_drives_and_reconcile(uuid[], boolean)'
  ]::regprocedure[];
  wrong text;
begin
  select string_agg(format('%s → %s %s', p.oid::regprocedure, r.role,
           case when has_function_privilege(r.role, p.oid, 'EXECUTE')
                then 'can call it' else 'cannot call it' end), '; ')
  into wrong
  from pg_proc p
  cross join (values ('anon'), ('authenticated')) as r(role)
  where p.pronamespace = 'public'::regnamespace
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
    and has_function_privilege(r.role, p.oid, 'EXECUTE')
        <> (p.oid = any(case r.role when 'anon' then anon_ok else authenticated_ok end));

  if wrong is not null then
    raise exception 'function privilege audit failed: %', wrong;
  end if;
end $$;


-- ══ 4. friendships readable by anon (it returns nothing) ═════════════════════
-- board_top and board_brackets name friendships for the friends scope, and
-- Postgres checks SELECT on every table a statement names, whether or not the
-- branch runs — so a caller with no session got "permission denied for table
-- friendships" from every board, even the global one (see 0016's note). The
-- grant is safe because the policy is the gate: friendships_select matches
-- auth.uid() = profile_id or friend_id, and with no session auth.uid() is
-- null, so anon reads zero rows. 0020 makes both functions SECURITY DEFINER,
-- after which this is belt and braces rather than load-bearing.
grant select on public.friendships to anon;


-- ══ 5. spatial_ref_sys: no writes from the API roles ═════════════════════════
-- PostGIS keeps its reference table in `public`, so PostgREST serves it, and
-- Supabase's bootstrap grants anon and authenticated every privilege on it
-- (insert, update, delete, truncate). Anyone with the app's public anon key
-- could rewrite or empty the coordinate system definitions every geography
-- value depends on. The usual fixes are not available to this project:
--
--   * REVOKE: the grants were made by supabase_admin, the table's owner, and
--     only the grantor (or a superuser) can revoke them. postgres cannot.
--   * RLS: enabling it needs ownership of the table.
--
-- What postgres does hold is TRIGGER on the table, so a statement-level
-- trigger refuses every write made as anon or authenticated, before any row
-- is touched. Reads are unaffected (the table is public reference data), and
-- so are supabase_admin, postgres and service_role, so PostGIS upgrades keep
-- working.
--
-- KNOWN LIMIT: dropping or altering this trigger needs ownership of the table,
-- so once it exists only supabase_admin (Supabase support) can remove it. The
-- function it calls is ours, and can be replaced with `create or replace` if
-- the rule ever needs to change.

create or replace function public.spatial_ref_sys_read_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'spatial_ref_sys is read-only'
      using errcode = '42501',
            detail = 'PostGIS reference data. Writes are refused for the API roles (migration 0018).';
  end if;
  return null;
end;
$$;

revoke all on function public.spatial_ref_sys_read_only() from public, anon, authenticated;

comment on function public.spatial_ref_sys_read_only() is
  'Statement trigger on public.spatial_ref_sys: refuses INSERT/UPDATE/DELETE/TRUNCATE from anon and authenticated, whose table grants postgres cannot revoke (they belong to supabase_admin). See 0018.';

-- Guarded rather than `drop trigger if exists`: DROP TRIGGER needs ownership
-- of the table, which postgres does not have. And guarded on the table being
-- in `public` at all: 0001 enables PostGIS without naming a schema, but a
-- project where it was enabled from the dashboard first has it in
-- `extensions`, which PostgREST does not serve — nothing to protect there, and
-- a bare 'public.spatial_ref_sys'::regclass would abort the whole migration.
do $$
begin
  if to_regclass('public.spatial_ref_sys') is null then
    raise notice 'public.spatial_ref_sys does not exist (PostGIS is in another schema): no trigger needed';
  elsif not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.spatial_ref_sys'::regclass
      and tgname = 'spatial_ref_sys_read_only'
  ) then
    create trigger spatial_ref_sys_read_only
      before insert or update or delete or truncate on public.spatial_ref_sys
      for each statement execute function public.spatial_ref_sys_read_only();
  end if;
end $$;
