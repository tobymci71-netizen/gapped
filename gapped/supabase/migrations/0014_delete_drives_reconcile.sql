-- ─────────────────────────────────────────────────────────────────────────────
-- Delete drives and leave the boards CONSISTENT, not merely emptier.
--
-- Deleting a drive already cascades correctly to drive_fixes,
-- drive_routes_private and leaderboard_entries. Achievements do not: they hang
-- off profile_id, never off drive_id, and grantAchievements upserts them with
-- `ignoreDuplicates: true`, so they are written ONCE and never re-evaluated.
--
-- That is the whole problem. Delete the drive that earned a trophy and the
-- trophy stays, describing a run that no longer exists — and because the grant
-- only ever fires during verification, the driver who is genuinely top of the
-- board now will never receive it. The board is not just emptier; it disagrees
-- with the achievements sitting next to it.
--
-- So this deletes, then re-derives each of the four achievement conditions and
-- revokes any that no longer hold.
--
--   first_verified_run     ≥ 1 verified drive remains
--   ten_verified_runs      ≥ 10 verified drives remain
--   first_measured_launch  some remaining drive has a 0-60 figure
--   country_number_one     the profile still tops its own country's all-time
--                          verified top-speed board
--
-- Revoking rather than repointing is deliberate. A payload records the run that
-- earned it (see 0010 on why that snapshot is kept); rewriting it to name a
-- different run would invent a history that never happened. Deleting it and
-- letting the next verified drive re-grant it is the honest option.
--
-- NOT reinstated here: an achievement someone ELSE should now hold. Granting is
-- verify-drive's job, and it will do it on their next verified run. Doing it
-- here would mean two places that mint trophies.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.delete_drives_and_reconcile(
  p_drive_ids uuid[],
  p_dry_run   boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid          uuid := auth.uid();
  target       uuid;
  n_drives     int;
  n_entries    int;
  revoked      text[] := '{}';
  v_country    text;
  still_top    boolean;
  n_verified   int;
  has_launch   boolean;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Only ever the caller's own drives. Passing someone else's id silently
  -- matches nothing rather than erroring, so a copy-pasted id cannot delete a
  -- stranger's history.
  select count(*) into n_drives
  from public.drives
  where id = any(p_drive_ids) and profile_id = uid;

  select count(*) into n_entries
  from public.leaderboard_entries
  where drive_id = any(p_drive_ids) and profile_id = uid;

  -- Dry run reports what WOULD go and changes nothing. Default, because the
  -- expected use is "delete a bad batch" and the batch is chosen by eye.
  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true,
      'would_delete_drives', n_drives,
      'would_delete_leaderboard_entries', n_entries,
      'note', 'Re-run with p_dry_run := false to apply.'
    );
  end if;

  delete from public.drives
  where id = any(p_drive_ids) and profile_id = uid;

  -- ── re-derive each condition ──────────────────────────────────────────────

  select count(*) into n_verified
  from public.drives
  where profile_id = uid and verification = 'verified';

  if n_verified < 1 then
    delete from public.achievements where profile_id = uid and kind = 'first_verified_run';
    if found then revoked := revoked || 'first_verified_run'::text; end if;
  end if;

  if n_verified < 10 then
    delete from public.achievements where profile_id = uid and kind = 'ten_verified_runs';
    if found then revoked := revoked || 'ten_verified_runs'::text; end if;
  end if;

  select exists (
    select 1 from public.drives
    where profile_id = uid and zero_to_60_s is not null
  ) into has_launch;

  if not has_launch then
    delete from public.achievements where profile_id = uid and kind = 'first_measured_launch';
    if found then revoked := revoked || 'first_measured_launch'::text; end if;
  end if;

  -- Mirrors grantAchievements' query exactly: all-time, verified, country
  -- scope, top speed. If those two ever drift apart the trophy becomes a lie in
  -- one direction or the other.
  select country into v_country from public.profiles where id = uid;

  if v_country is not null then
    select coalesce(
      (select e.profile_id from public.leaderboard_entries e
        where e.metric = 'top_speed' and e.scope = 'country'
          and e.country = v_country and e.period = 'all'
          and e.verification = 'verified'
        order by e.value desc limit 1) = uid,
      false
    ) into still_top;

    if not still_top then
      delete from public.achievements where profile_id = uid and kind = 'country_number_one';
      if found then revoked := revoked || 'country_number_one'::text; end if;
    end if;
  end if;

  return jsonb_build_object(
    'dry_run', false,
    'deleted_drives', n_drives,
    'deleted_leaderboard_entries', n_entries,
    'revoked_achievements', to_jsonb(revoked),
    'verified_drives_remaining', n_verified
  );
end;
$$;

comment on function public.delete_drives_and_reconcile(uuid[], boolean) is
  'Deletes the caller''s drives (cascading to fixes, routes and leaderboard entries) then revokes any achievement whose condition no longer holds. Dry run by default.';

revoke all on function public.delete_drives_and_reconcile(uuid[], boolean) from public;
grant execute on function public.delete_drives_and_reconcile(uuid[], boolean) to authenticated;
