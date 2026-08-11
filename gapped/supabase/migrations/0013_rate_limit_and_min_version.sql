-- ─────────────────────────────────────────────────────────────────────────────
-- Two things that are cheap now and impossible to retrofit later.
-- ─────────────────────────────────────────────────────────────────────────────

-- ══ 1. Rate limiting ═════════════════════════════════════════════════════════
-- verify-drive re-derives a whole drive server-side: it reads every fix, runs
-- the plausibility envelope, recomputes the summary and writes leaderboard
-- entries. It costs real money per call and it is about to be reachable by
-- anyone with an account.
--
-- A fixed window per profile, not a token bucket: the abuse being prevented is
-- "loop the endpoint", and a fixed window is auditable by reading one row.
-- Someone genuinely driving cannot approach the limit — 60 verifications an
-- hour is a drive finishing every minute for an hour.
--
-- Keyed by profile rather than IP. IP is shared (carrier NAT would rate-limit a
-- whole town) and trivially rotated; a profile costs an account to create.

create table if not exists rate_limits (
  profile_id   uuid not null references profiles on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  count        int  not null default 0,
  primary key (profile_id, bucket)
);

alter table rate_limits enable row level security;
-- No policy and no grants: only the service role reaches this, and it should
-- never be visible to a client. Knowing your own remaining quota is a hint
-- worth not giving.

/**
 * Consumes one unit from a caller's bucket. Returns true when the call is
 * allowed, false when the limit is spent.
 *
 * Atomic by construction: the insert-or-update happens in a single statement,
 * so two concurrent verify-drive invocations cannot both read a stale count and
 * both decide they are under the limit.
 */
create or replace function public.consume_rate_limit(
  p_profile_id uuid,
  p_bucket     text,
  p_limit      int,
  p_window_s   int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ts   timestamptz := now();
  new_count int;
begin
  insert into public.rate_limits (profile_id, bucket, window_start, count)
  values (p_profile_id, p_bucket, now_ts, 1)
  on conflict (profile_id, bucket) do update
    set
      -- Window expired → start a fresh one. Otherwise keep counting.
      window_start = case
        when public.rate_limits.window_start < now_ts - make_interval(secs => p_window_s)
        then now_ts else public.rate_limits.window_start end,
      count = case
        when public.rate_limits.window_start < now_ts - make_interval(secs => p_window_s)
        then 1 else public.rate_limits.count + 1 end
  returning count into new_count;

  return new_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text, int, int) from public;
comment on function public.consume_rate_limit(uuid, text, int, int) is
  'Fixed-window rate limit. Service role only — never grant to authenticated.';


-- ══ 2. Minimum supported build ═══════════════════════════════════════════════
-- Once a broken build is in the wild there is no way to tell it to stop. This
-- costs one table now; adding it later cannot help the builds already out
-- there, because they will not know to ask.
--
-- Deliberately NOT expo-updates: this does not push code, it refuses to run.
-- That works even when the bug is native, which is exactly when OTA cannot
-- help.
--
-- min_build is compared against the EAS build number, not the marketing
-- version: build numbers are monotonic and EAS owns them, whereas `version` is
-- hand-edited and can go backwards by accident.

create table if not exists app_releases (
  platform    text primary key check (platform in ('ios', 'android')),
  min_build   int  not null default 1,
  -- Shown on the blocking screen. Null uses the app's default copy, so an
  -- operator can force an update without having to write anything.
  message     text,
  updated_at  timestamptz not null default now()
);

alter table app_releases enable row level security;
drop policy if exists app_releases_select on app_releases;
-- World-readable on purpose: the check has to work before a user signs in, and
-- an unauthenticated user on a broken build still needs to be told to update.
create policy app_releases_select on app_releases for select using (true);
grant select on app_releases to anon, authenticated;

insert into app_releases (platform, min_build) values ('ios', 1), ('android', 1)
on conflict (platform) do nothing;

comment on table app_releases is
  'Minimum EAS build number the client may run. Raising min_build blocks older builds at launch with an update screen. Service role writes only.';
