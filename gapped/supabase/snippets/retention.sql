-- ─────────────────────────────────────────────────────────────────────────────
-- Gapped — retention jobs (0021), by hand.
--
-- Three daily pg_cron jobs keep the privacy policy's promises about time:
--   gapped_purge_drive_raw_data    03:10 UTC  raw fixes + untrimmed route,
--                                             90 days after the drive
--   gapped_purge_rate_limits       03:25 UTC  counters older than 2 days
--   gapped_purge_anonymous_users   03:40 UTC  anonymous, nameless, driveless,
--                                             unused accounts after 30 days
-- Run in the Studio SQL editor (as postgres).
-- ─────────────────────────────────────────────────────────────────────────────


-- ══ Are they scheduled, and did they run? ════════════════════════════════════

select jobid, jobname, schedule, command, active, username
from cron.job
where jobname like 'gapped\_%'
order by jobname;

select j.jobname, d.status, d.return_message, d.start_time, d.end_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname like 'gapped\_%'
order by d.start_time desc
limit 30;


-- ══ Schedule them ════════════════════════════════════════════════════════════
-- Idempotent: replaces each job by name. Needed only if pg_cron was not
-- enabled when 0021 ran (Database → Extensions → pg_cron, then this).

select public.schedule_retention_jobs();


-- ══ Run one now ══════════════════════════════════════════════════════════════
-- Each returns how many drives / counters / accounts it removed.

select public.purge_drive_raw_data();
select public.purge_rate_limits();
select public.purge_abandoned_anonymous_users();


-- ══ What the next runs will take ═════════════════════════════════════════════

select count(*) as drives_due_for_raw_data_purge
from public.drives d
where d.fixes_purged_at is null
  and d.started_at < now() - interval '90 days';

select count(*) as abandoned_anonymous_accounts
from auth.users u
where u.is_anonymous
  and u.created_at < now() - interval '30 days'
  and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
  and not exists (select 1 from public.profiles p where p.id = u.id and p.username is not null)
  and not exists (select 1 from public.drives d where d.profile_id = u.id)
  and not exists (select 1 from auth.sessions s
                   where s.user_id = u.id and s.updated_at >= now() - interval '30 days');


-- ══ Stop one ═════════════════════════════════════════════════════════════════
-- (The privacy policy promises these deletions: stopping a job means the
-- policy has to change too.) Commented out so that running this whole file
-- never unschedules anything: uncomment, name the job, and run it on its own.

-- select cron.unschedule('JOB_NAME');
