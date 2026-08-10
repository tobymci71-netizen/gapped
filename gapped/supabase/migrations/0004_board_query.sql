-- Gapped — board reads as one server-side query.
--
-- Three problems with reading leaderboard_entries directly from the client:
--
--  1. The country board never filtered by country. It filtered scope='country'
--     — which every country's entries share — so it returned everyone's
--     entries from everywhere, mixed together and labelled as your country.
--
--  2. One profile could hold every place on a board. Entries are per drive, so
--     a driver with fifty logged drives fills all fifty rows. A leaderboard is
--     a ranking of people; it has to be one row per person, their best.
--     Fetching a wider window and de-duplicating client-side does not fix it
--     — a single prolific user can still crowd out everyone below.
--
--  3. The friends board was permanently empty. It queried scope='friends',
--     but verify-drive only ever writes 'global' and 'country' entries, so
--     there was nothing to find. Friends is not a separate set of entries: it
--     is the global board restricted to people you have added.
--
-- security invoker, so the caller's RLS still applies: leaderboard_entries and
-- profiles are world-readable by policy, and friendships resolve against the
-- caller's own auth.uid().

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
    where e.metric = p_metric
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
  -- One row per driver: their best in the window. Every metric here is
  -- positive, so negating turns "higher is better" into the same ascending
  -- sort that 0-60 already wants, and one expression serves both.
  best as (
    select distinct on (w.profile_id) w.*
    from windowed w
    order by
      w.profile_id,
      case when p_metric = 'zero_to_60' then w.value else -w.value end asc,
      w.recorded_at desc
  )
  select b.id, b.profile_id, p.username, b.country, b.value, b.verification, b.recorded_at
  from best b
  join profiles p on p.id = b.profile_id
  order by case when p_metric = 'zero_to_60' then b.value else -b.value end asc
  limit p_limit;
$$;

grant execute on function
  public.board_top(text, text, text, text, boolean, int) to anon, authenticated;
