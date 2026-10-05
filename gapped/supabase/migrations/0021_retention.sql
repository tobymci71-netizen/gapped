-- ─────────────────────────────────────────────────────────────────────────────
-- Gapped — retention: the server forgets what it no longer needs.
--
-- The privacy policy makes three promises about time, and until now nothing
-- kept them:
--
--   Raw GPS and sensor points, and the untrimmed route
--       deleted 90 days after the drive
--   An account that never chose a username and never uploaded a drive
--       deleted after 30 days
--   Rate-limit counters
--       kept 2 days
--
-- Each is a function here, run once a day by pg_cron under a fixed job name.
-- The functions hold the rules, so they can be read, tested and run by hand
-- (supabase/snippets/retention.sql); the jobs only call them.
--
-- What stays after a drive's raw data goes: the drive row and everything
-- derived from it — distance, speeds, G, 0-60, the privacy-trimmed route the
-- app draws, verification and its reasons, and the board entries. That is
-- the driver's history, and it lasts until they delete the drive or the
-- account.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══ 1. Raw drive data ════════════════════════════════════════════════════════

alter table public.drives add column if not exists fixes_purged_at timestamptz;

comment on column public.drives.fixes_purged_at is
  'When the retention job deleted this drive''s drive_fixes and its untrimmed route (drive_routes_private). Null while they are kept. A purged drive cannot be re-verified: there is nothing left to verify it from (0021).';

-- What the daily job looks for: drives not yet purged, oldest first.
create index if not exists drives_unpurged_started_at_idx
  on public.drives (started_at) where fixes_purged_at is null;

-- Every drive that started more than 90 days ago, whatever its verification.
-- A final verdict (verified, unverified, rejected) was reached long before;
-- a drive still 'pending' after 90 days is one whose phone stopped asking —
-- removed before verify-drive answered, or turned away for good — and
-- without this its raw points would be kept forever, which the policy says
-- they are not. Started, not checked: drives have no "checked at" column, and
-- a drive is checked after it starts, so 90 days from the start is never
-- later than 90 days from the check.
--
-- A phone that still holds such a drive unsent can upload its fixes again
-- after the purge. verify-drive deletes them when it is next asked about the
-- drive (a purged drive is never re-derived), and the phone always asks
-- straight after uploading.
--
-- Deletes the fixes and the drive_routes_private row (the untrimmed route),
-- then stamps fixes_purged_at, in one statement. Batched so one run's
-- transaction stays bounded; a backlog clears over the following days.
-- Idempotent: a purged drive is never selected again, and a second run the
-- same day finds nothing.
create or replace function public.purge_drive_raw_data(
  p_older_than interval default interval '90 days',
  p_batch      int      default 2000
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  with due as (
    select d.id
    from public.drives d
    where d.fixes_purged_at is null
      and d.started_at < now() - p_older_than
    order by d.started_at
    limit p_batch
    for update skip locked
  ),
  fixes as (
    delete from public.drive_fixes f using due where f.drive_id = due.id
  ),
  routes as (
    delete from public.drive_routes_private r using due where r.drive_id = due.id
  )
  update public.drives d
  set fixes_purged_at = now()
  from due
  where d.id = due.id;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.purge_drive_raw_data(interval, int) is
  'Retention: deletes drive_fixes and drive_routes_private for drives that started more than 90 days ago (any verification, pending included), and sets drives.fixes_purged_at. Returns drives purged. Run daily by pg_cron (gapped_purge_drive_raw_data).';


-- ══ 2. Rate-limit counters ═══════════════════════════════════════════════════
-- The longest window in use is report_driver's 24 hours (0019); verify-drive's
-- is one hour. A row whose window started two days ago is over whichever it
-- was, and consume_rate_limit would restart it anyway.
create or replace function public.purge_rate_limits(
  p_older_than interval default interval '2 days'
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  delete from public.rate_limits where window_start < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.purge_rate_limits(interval) is
  'Retention: deletes rate_limits rows whose window started more than 2 days ago. Run daily by pg_cron (gapped_purge_rate_limits).';


-- ══ 3. Abandoned anonymous accounts ══════════════════════════════════════════
-- Every first launch signs in anonymously, before anything is known about the
-- person. Someone who opens the app once and leaves leaves behind an auth user
-- and an empty profile — and possibly a vehicle or onboarding answers — that
-- nothing will ever use.
--
-- Deleted when ALL of these hold:
--   * the account is anonymous (never linked to any sign-in method);
--   * it never chose a username;
--   * it has no drives;
--   * it was created more than 30 days ago;
--   * and, beyond the policy's own wording, nothing has used it in those 30
--     days: no sign-in and no session refreshed. So a person still opening
--     the app is never signed out from under it, whatever else is true.
--
-- Deleting the auth user cascades exactly as delete_account() does (0011).
create or replace function public.purge_abandoned_anonymous_users(
  p_older_than interval default interval '30 days'
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - p_older_than
    and coalesce(u.last_sign_in_at, u.created_at) < now() - p_older_than
    and not exists (
      select 1 from public.profiles p where p.id = u.id and p.username is not null
    )
    and not exists (
      select 1 from public.drives d where d.profile_id = u.id
    )
    and not exists (
      select 1 from auth.sessions s
      where s.user_id = u.id and s.updated_at >= now() - p_older_than
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.purge_abandoned_anonymous_users(interval) is
  'Retention: deletes anonymous auth users with no username and no drives, created and last used more than 30 days ago (cascades like delete_account). Run daily by pg_cron (gapped_purge_anonymous_users).';

-- None of the three is an RPC. pg_cron runs them as postgres, their owner.
revoke all on function public.purge_drive_raw_data(interval, int)         from public, anon, authenticated;
revoke all on function public.purge_rate_limits(interval)                 from public, anon, authenticated;
revoke all on function public.purge_abandoned_anonymous_users(interval)   from public, anon, authenticated;


-- ══ 4. The schedule ══════════════════════════════════════════════════════════
-- pg_cron is preloaded on Supabase (local and cloud) but has to be enabled
-- per project. Enabled here, in pg_catalog as Supabase documents it; its
-- tables live in the `cron` schema either way.
--
-- If the extension cannot be enabled (a stack without it), the migration
-- still applies: the functions above exist and work, nothing is scheduled,
-- and a NOTICE says so. Enable pg_cron later and run
-- `select public.schedule_retention_jobs();` (snippets/retention.sql).

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
    exception when others then
      raise notice 'pg_cron could not be enabled (%): retention jobs not scheduled', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available on this server: retention jobs not scheduled';
  end if;
end $$;

-- cron.schedule(name, …) replaces the job of that name if there is one, so
-- this is safe to run any number of times; it never makes a second copy.
-- 03:00–03:40 UTC, a quiet hour in the UK.
create or replace function public.schedule_retention_jobs()
returns int
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not enabled: nothing scheduled';
    return 0;
  end if;

  perform cron.schedule('gapped_purge_drive_raw_data', '10 3 * * *',
                        'select public.purge_drive_raw_data()');
  perform cron.schedule('gapped_purge_rate_limits', '25 3 * * *',
                        'select public.purge_rate_limits()');
  perform cron.schedule('gapped_purge_anonymous_users', '40 3 * * *',
                        'select public.purge_abandoned_anonymous_users()');
  return 3;
end;
$$;

comment on function public.schedule_retention_jobs() is
  'Schedules (or re-schedules, by name) the three daily retention jobs with pg_cron. Idempotent. Returns how many were scheduled: 0 when pg_cron is not enabled.';

revoke all on function public.schedule_retention_jobs() from public, anon, authenticated;

select public.schedule_retention_jobs();
