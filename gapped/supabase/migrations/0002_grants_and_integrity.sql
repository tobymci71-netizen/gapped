-- Gapped — fixes found by running 0001 against a real Postgres for the first
-- time. Everything here is a blocker or an invariant violation, not a polish
-- pass. Each section says what was wrong and why the fix is shaped this way.

-- ── 1. Table privileges (TOTAL BLOCKER) ─────────────────────────────────────
-- 0001 enables RLS and writes policies, but never grants table privileges.
-- RLS narrows what a role may touch; it cannot widen it. Supabase's default
-- ACL for objects created by `postgres` in `public` grants only Dxtm
-- (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) to anon, authenticated AND
-- service_role — no SELECT/INSERT/UPDATE/DELETE. So every client call failed
-- with `42501 permission denied for table drives` before any policy ran, and
-- service_role (which bypasses RLS but still needs privileges) failed too.
--
-- Grants are therefore written explicitly, per table, matching the policy
-- model in 0001. Explicit grants also make this schema portable: it no longer
-- depends on whatever the default ACL happens to be on the target project.

grant usage on schema public to anon, authenticated, service_role;

-- service_role is the verification authority: full access, RLS-exempt.
grant select, insert, update, delete on all tables in schema public to service_role;

-- profiles: usernames are public (boards); only the owner writes.
grant select                 on profiles to anon, authenticated;
grant insert, update         on profiles to authenticated;

-- vehicles / drives / fixes: owner-scoped, gated by the 0001 policies.
grant select, insert, update, delete on vehicles    to authenticated;
grant select, insert, delete         on drives      to authenticated;
grant select, insert                 on drive_fixes to authenticated;

-- boards and achievements are world-readable; writes are service-role only.
grant select on leaderboard_entries to anon, authenticated;
grant select on achievements        to anon, authenticated;

grant select, insert, delete on friendships to authenticated;

-- ── 2. route_full made structurally unreachable ─────────────────────────────
-- 0001's stated invariant: "route_full never leaves the server (no RLS select
-- policy exposes it)". That was not true. RLS is row-level, not column-level:
-- `drives_select` grants the owner SELECT on the whole row, so any client
-- could `select route_full from drives` and read the untrimmed route — the
-- exact data the privacy layer exists to withhold. The `drives_public` view
-- did not help, because the base table stayed exposed through PostgREST.
--
-- Column-level grants would work but are fragile: `select *` then errors, and
-- one careless future `grant select on drives` silently re-exposes it. Moving
-- the column to its own table with no grants and no policies makes the
-- invariant structural — there is no privilege path to it except service_role.

create table drive_routes_private (
  drive_id   uuid primary key references drives on delete cascade,
  route_full geography(linestring, 4326) not null
);
alter table drive_routes_private enable row level security;
-- Deliberately no policies and no grants to anon/authenticated.
grant select, insert, update, delete on drive_routes_private to service_role;

alter table drives drop column route_full;

-- Now redundant: `drives` no longer has a column the view needed to hide, so
-- the view is an exact duplicate of the base table and only invites the
-- mistake of trusting it for protection it never provided.
drop view if exists drives_public;

-- ── 3. Anonymous-first sign-in had no profile row (FIRST-SYNC BLOCKER) ──────
-- The app signs in anonymously, then syncs drives with profile_id = auth uid.
-- drives.profile_id references profiles, and nothing ever created a profiles
-- row, so the very first sync could only ever fail with a FK violation.
--
-- username/country become nullable: at signup we genuinely do not know them
-- (onboarding collects them later), and inventing a placeholder would put junk
-- on the country boards. `unique` still holds for non-null usernames, and
-- verify-drive already skips country-scope entries when country is null.

alter table profiles alter column username drop not null;
alter table profiles alter column country  drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any users that already exist.
insert into profiles (id)
select u.id from auth.users u
left join profiles p on p.id = u.id
where p.id is null;

-- ── 4. profiles_update had no WITH CHECK ────────────────────────────────────
-- `using (auth.uid() = id)` picks which rows may be updated; without a
-- WITH CHECK the *resulting* row is unvalidated, so a user could rewrite their
-- own row's id to another uuid — taking over a row they do not own.
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- ── 5. Leaderboard writes were not idempotent ───────────────────────────────
-- verify-drive plain-inserts entries. Re-verifying a drive (a retry, a
-- re-derivation after a maths fix, the client's fire-and-forget invoke landing
-- twice) duplicated every row, so one drive could occupy a board repeatedly.
-- One entry per (drive, metric, scope, period); verify-drive now upserts.
alter table leaderboard_entries
  add constraint leaderboard_entries_unique_per_drive
  unique (drive_id, metric, scope, period);

-- Board queries join profiles by profile_id, and account deletion cascades by
-- profile_id; neither had an index.
create index on leaderboard_entries (profile_id);

-- ── 6. Account deletion (App Review requirement) ────────────────────────────
-- settings.tsx wipes local state only and is careful not to claim otherwise.
-- This is the server half: removes the auth user, which cascades to profiles
-- and onward to vehicles, drives, fixes, routes, boards, friendships and
-- achievements. security definer because deleting from auth.users needs
-- privileges the caller does not have; it can only ever delete the caller.
--
-- The cascade has to be added first. Every other table cascades from profiles,
-- but profiles -> auth.users was declared `references auth.users` with no
-- action, so deleting the user failed on profiles_id_fkey and the whole
-- deletion rolled back. Nothing could ever have been deleted.
alter table profiles drop constraint profiles_id_fkey;
alter table profiles add constraint profiles_id_fkey
  foreign key (id) references auth.users on delete cascade;
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
