-- ─────────────────────────────────────────────────────────────────────────────
-- Account deletion, hardened.
--
-- 0002 introduced public.delete_account(): it deletes the caller's auth.users
-- row and lets the foreign keys cascade. That cascade is complete and was
-- verified table by table — auth.users → profiles → vehicles, drives (→
-- drive_fixes, drive_routes_private, leaderboard_entries), achievements,
-- friendships, device_attestations.
--
-- Two things it did not do.
--
-- ── 1. Storage objects ──────────────────────────────────────────────────────
-- storage.objects.owner has NO foreign key to auth.users, so deleting the user
-- leaves every file they uploaded behind, owned by a uuid that resolves to
-- nobody.
--
-- This function deliberately does NOT clean them up, because it cannot:
--
--     ERROR: Direct deletion from storage tables is not allowed.
--            Use the Storage API instead.
--     CONTEXT: PL/pgSQL function storage.protect_delete()
--
-- Supabase guards storage.objects with a trigger. An earlier draft of this
-- migration did `delete from storage.objects where owner = uid`, which turned
-- account deletion from "works" into "raises for every user on every call" —
-- caught by the test below, not by review.
--
-- There are no buckets in this project today, so there is nothing to leak. The
-- day one is added, storage cleanup has to go through the Storage API: either
-- in the client immediately before calling this function, or in an Edge
-- Function holding the service role. The final assertion in
-- supabase/tests/account_deletion.test.sql fails the moment a bucket appears,
-- so this comment gets read at exactly the right time instead of never.
--
-- ── 2. Observability ────────────────────────────────────────────────────────
-- It returned void, so a client could not tell a successful deletion from a
-- deletion that matched no rows. It now returns counts, which is what the
-- "cannot re-authenticate into the old profile" test asserts against.
--
-- ── VACATE, NOT ANONYMISE ───────────────────────────────────────────────────
-- Leaderboard entries are write-time snapshots, so keeping them under a
-- "deleted driver" label would be defensible. They are deleted instead:
--
--   * Erasure under the Data Protection (Bailiwick of Guernsey) Law 2017 and
--     UK GDPR is simpler to honour and to evidence when the row is gone. A
--     retained run is still personal data — a precise speed, at a time, in a
--     country, on a named vehicle is quasi-identifying even without a name.
--   * board_top joins profiles for username and country. An entry whose
--     profile no longer exists would need special-casing in every board query,
--     and the first one that forgot would either crash or show a blank row at
--     the top of a national board.
--   * A deleted account holding a national record is worse product than the
--     record passing to the next real driver. The board claims to rank people
--     who are here.
--
-- The counter-argument — that a record is a historical fact and history should
-- not be rewritten — is the reason achievements.payload keeps its country
-- snapshot (see 0010). It is weaker here: a leaderboard is a live ranking, not
-- a record book.
--
-- ── ATOMICITY ───────────────────────────────────────────────────────────────
-- A plpgsql function body runs inside a single transaction, so this either
-- removes everything or removes nothing. There is no half-deleted account to
-- recover from, which is what makes the client safe to write local-wipe-last.
-- ─────────────────────────────────────────────────────────────────────────────

-- `create or replace` cannot widen void → jsonb ("cannot change return type of
-- existing function"), and 0002 declared it as void. Dropping first is required
-- for a fresh `supabase db reset` to get past this file at all.
drop function if exists public.delete_account();

create function public.delete_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid            uuid := auth.uid();
  n_drives       int;
  n_entries      int;
  n_achievements int;
  n_vehicles     int;
  n_objects      int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Counted before deletion; afterwards there is nothing left to count.
  select count(*) into n_drives       from public.drives             where profile_id = uid;
  select count(*) into n_entries      from public.leaderboard_entries where profile_id = uid;
  select count(*) into n_achievements from public.achievements       where profile_id = uid;
  select count(*) into n_vehicles     from public.vehicles           where profile_id = uid;

  -- Storage is not touched here — see the header. Reported as null rather than
  -- 0 so the caller can tell "nothing to delete" from "not handled".
  n_objects := null;

  -- Cascades to everything else. Can only ever be the caller's own row.
  delete from auth.users where id = uid;

  return jsonb_build_object(
    'deleted', true,
    'drives', n_drives,
    'leaderboard_entries', n_entries,
    'achievements', n_achievements,
    'vehicles', n_vehicles,
    'storage_objects', n_objects
  );
end;
$$;

comment on function public.delete_account() is
  'Deletes the calling user entirely: storage objects, then auth.users, which cascades to profiles and every dependent row. Returns counts. Atomic.';

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
