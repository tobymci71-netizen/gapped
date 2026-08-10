-- Gapped — vehicle specs, bracket boards, achievements.
--
-- These three are one change, because they depend on each other: brackets are
-- meaningless without specs, and specs are dangerous unless the server owns
-- them.

-- ── 1. Vehicle specs become server-owned (SECURITY) ─────────────────────────
-- drivetrain, curb_weight_kg and factory_power_hp are the three inputs to
-- bracketKey, which decides which leaderboard a run competes on. Until now the
-- client held INSERT and UPDATE on all three, so a driver could declare 90 hp
-- and 1800 kg, land their 500 hp car in the slowest power-to-weight class, and
-- own it. Nothing exploited it only because nothing populated specs — which is
-- exactly what the rest of this migration changes.
--
-- Same reasoning as drives: the client may name only the columns it is
-- entitled to describe, and the ones that decide rankings are written by the
-- server from a decoded VIN.
revoke insert, update on vehicles from authenticated;
grant insert (id, profile_id, kind, make, model, year, is_modified, photo_url, is_primary)
  on vehicles to authenticated;
grant update (make, model, year, is_modified, photo_url, is_primary)
  on vehicles to authenticated;

-- Where the specs came from. Only 'vin' is trusted for bracketing: a VIN is
-- decoded by NHTSA, a declaration is just a claim.
alter table vehicles
  add column spec_source text check (spec_source in ('vin', 'declared')),
  add column specs_updated_at timestamptz;

comment on column vehicles.spec_source is
  'vin = decoded server-side from NHTSA vPIC and trusted for bracketing. declared = self-reported, never used for brackets. The VIN itself is deliberately not stored — it identifies a specific car and we only need what it decodes to.';

-- A vehicle whose specs did not come from a VIN must not carry spec values
-- that could reach the bracket maths.
alter table vehicles add constraint vehicles_specs_need_source check (
  (drivetrain is null and curb_weight_kg is null and factory_power_hp is null)
  or spec_source is not null
);

-- ── 2. Bracket boards ───────────────────────────────────────────────────────
-- bracket_key has been computed, stored and indexed since 0001 and never
-- queried, so every board was open-class whether or not the data existed.
-- board_top gains a bracket filter; null keeps today's behaviour.
create or replace function public.board_top(
  p_metric        text,
  p_scope         text,
  p_period        text,
  p_country       text    default null,
  p_verified_only boolean default false,
  p_limit         int     default 50,
  p_bracket       text    default null
)
returns table (
  id           uuid,
  profile_id   uuid,
  username     text,
  country      char(2),
  value        double precision,
  verification text,
  recorded_at  timestamptz,
  bracket_key  text
)
language sql
stable
security invoker
set search_path = public
as $$
  with windowed as (
    select e.*
    from leaderboard_entries e
    where
      e.metric = case when p_metric = 'trip_count' then 'top_speed' else p_metric end
      and e.period = p_period
      and e.scope = case when p_scope = 'friends' then 'global' else p_scope end
      and (p_scope <> 'country' or e.country = p_country)
      and (p_bracket is null or e.bracket_key = p_bracket)
      and (
        p_scope <> 'friends'
        or e.profile_id in (
          select f.friend_id from friendships f where f.profile_id = auth.uid()
          union all
          select auth.uid()
        )
      )
      and (not p_verified_only or e.verification = 'verified')
      and (
        p_period = 'all'
        or e.recorded_at >= now() - case p_period
             when 'day'   then interval '1 day'
             when 'week'  then interval '7 days'
             when 'month' then interval '30 days'
             else interval '0 days'
           end
      )
  ),
  best as (
    select
      (array_agg(w.id order by w.recorded_at desc))[1]           as id,
      w.profile_id,
      count(distinct w.drive_id)::double precision               as value,
      case when bool_and(w.verification = 'verified') then 'verified' else 'unverified' end
                                                                 as verification,
      max(w.recorded_at)                                         as recorded_at,
      max(w.country)                                             as country,
      max(w.bracket_key)                                         as bracket_key
    from windowed w
    where p_metric = 'trip_count'
    group by w.profile_id

    union all

    select b.id, b.profile_id, b.value, b.verification, b.recorded_at, b.country, b.bracket_key
    from (
      select distinct on (w.profile_id) w.id, w.profile_id, w.value, w.verification,
             w.recorded_at, w.country, w.bracket_key
      from windowed w
      where p_metric <> 'trip_count'
      order by
        w.profile_id,
        case when p_metric = 'zero_to_60' then w.value else -w.value end asc,
        w.recorded_at desc
    ) b
  )
  select b.id, b.profile_id, p.username, b.country, b.value, b.verification,
         b.recorded_at, b.bracket_key
  from best b
  join profiles p on p.id = b.profile_id
  order by case when p_metric = 'zero_to_60' then b.value else -b.value end asc
  limit p_limit;
$$;

grant execute on function
  public.board_top(text, text, text, text, boolean, int, text) to anon, authenticated;

-- The old 6-argument signature is replaced, not overloaded: leaving both would
-- let a stale client silently keep calling the version with no bracket filter.
drop function if exists public.board_top(text, text, text, text, boolean, int);

-- Which brackets actually have entries, so the UI offers only real ones rather
-- than a combinatorial menu of mostly-empty classes.
create or replace function public.board_brackets(
  p_metric text,
  p_period text default 'all'
)
returns table (bracket_key text, entries bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select e.bracket_key, count(distinct e.profile_id)
  from leaderboard_entries e
  where e.metric = case when p_metric = 'trip_count' then 'top_speed' else p_metric end
    and e.period = p_period
    and e.scope = 'global'
    and e.bracket_key is not null
  group by e.bracket_key
  order by 2 desc, 1;
$$;

grant execute on function public.board_brackets(text, text) to anon, authenticated;

-- ── 3. Achievements ─────────────────────────────────────────────────────────
-- The table has existed since 0001 and nothing ever wrote to it. Granted
-- server-side only, from verify-drive, so an achievement means the same thing
-- as a verified drive does.
alter table achievements
  add constraint achievements_unique_per_kind unique (profile_id, kind);

create index on achievements (profile_id, earned_at desc);

comment on table achievements is
  'Granted only by verify-drive under the service role. One row per (profile, kind) — earning something twice is not an event.';
