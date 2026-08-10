-- Gapped — make the "Drives" board work.
--
-- BoardMetric has always listed trip_count, the Board tab offers it as
-- "Drives", and the leaderboard_entries check constraint permits it — but
-- verify-drive never wrote a trip_count row and never could. Every other
-- metric is a property of one drive (its top speed, its distance, its 0-60);
-- a drive count is a property of a *driver*, so there is no per-drive value to
-- insert. Selecting "Drives" therefore returned nothing from the server and
-- silently fell back to the local board — a global-looking ranking of one
-- device's own history.
--
-- It is derived at query time instead. Every verified drive already writes a
-- top_speed entry, so counting distinct drive_ids in the window gives the
-- count without a second write path that could disagree with the first.

create or replace function public.board_top(
  p_metric        text,
  p_scope         text,
  p_period        text,
  p_country       text    default null,
  p_verified_only boolean default false,
  p_limit         int     default 50
)
returns table (
  id           uuid,
  profile_id   uuid,
  username     text,
  country      char(2),
  value        double precision,
  verification text,
  recorded_at  timestamptz
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
      -- trip_count has no entries of its own; it counts drives, and every
      -- drive has a top_speed entry.
      e.metric = case when p_metric = 'trip_count' then 'top_speed' else p_metric end
      and e.period = p_period
      -- Friends reads the global entries, then narrows to the friend set.
      and e.scope = case when p_scope = 'friends' then 'global' else p_scope end
      and (p_scope <> 'country' or e.country = p_country)
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
  -- One row per driver. For trip_count that is an aggregate over the window;
  -- for every other metric it is their single best entry.
  best as (
    select
      (array_agg(w.id order by w.recorded_at desc))[1]           as id,
      w.profile_id,
      count(distinct w.drive_id)::double precision               as value,
      -- A count is only as trustworthy as its weakest drive, so it is labelled
      -- verified only when every drive behind it was.
      case when bool_and(w.verification = 'verified') then 'verified' else 'unverified' end
                                                                 as verification,
      max(w.recorded_at)                                         as recorded_at,
      max(w.country)                                             as country
    from windowed w
    where p_metric = 'trip_count'
    group by w.profile_id

    union all

    select b.id, b.profile_id, b.value, b.verification, b.recorded_at, b.country
    from (
      select distinct on (w.profile_id) w.id, w.profile_id, w.value, w.verification,
             w.recorded_at, w.country
      from windowed w
      where p_metric <> 'trip_count'
      order by
        w.profile_id,
        case when p_metric = 'zero_to_60' then w.value else -w.value end asc,
        w.recorded_at desc
    ) b
  )
  select b.id, b.profile_id, p.username, b.country, b.value, b.verification, b.recorded_at
  from best b
  join profiles p on p.id = b.profile_id
  order by case when p_metric = 'zero_to_60' then b.value else -b.value end asc
  limit p_limit;
$$;

grant execute on function
  public.board_top(text, text, text, text, boolean, int) to anon, authenticated;
