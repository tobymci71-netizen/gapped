-- Gapped — the class picker counts the same drivers the board shows.
--
-- board_brackets (0009) filtered on metric, `period` and global scope only.
-- But `period` is not a time window: verify-drive writes a day, week, month
-- and all row for every drive and nothing ever expires them, so
-- `period = 'day'` matches every drive anyone has ever recorded. The window is
-- applied only inside board_top, through `recorded_at`, together with the
-- verified-only, country and friends filters.
--
-- So the picker offered "AWD · Stock · Open class · 12 drivers" for Today,
-- counting drivers from last year, unverified drivers and drivers outside the
-- user's country or friends — and choosing it gave an empty board. The
-- screen's "a class that has emptied out is dropped" reset could never fire,
-- because the list never shrank with time.
--
-- board_brackets now takes the same filters as board_top and applies them
-- with the same clauses, so a class is offered only when the board for it has
-- someone on it, and its count is the number of drivers that board ranks.
--
-- The 2-argument signature is replaced, not overloaded — the same reasoning
-- as board_top in 0009. Every new parameter has a default, so a client still
-- calling with (p_metric, p_period) resolves to this function and gets the
-- windowed global count rather than an error.

drop function if exists public.board_brackets(text, text);

create or replace function public.board_brackets(
  p_metric        text,
  p_period        text    default 'all',
  p_scope         text    default 'global',
  p_country       text    default null,
  p_verified_only boolean default false
)
returns table (bracket_key text, entries bigint)
language sql
stable
security invoker
set search_path = public
as $$
  -- Every clause below mirrors board_top's `windowed` CTE. If one changes,
  -- change both: a picker that disagrees with the board is the bug this fixed.
  select e.bracket_key, count(distinct e.profile_id)
  from leaderboard_entries e
  where
    e.metric = case when p_metric = 'trip_count' then 'top_speed' else p_metric end
    and e.period = p_period
    and e.scope = case when p_scope = 'friends' then 'global' else p_scope end
    and (p_scope <> 'country' or e.country = p_country)
    and e.bracket_key is not null
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
  group by e.bracket_key
  order by 2 desc, 1;
$$;

-- Explicit, per 0007: EXECUTE defaults to PUBLIC on a new function. anon keeps
-- it to match board_top (0009); service_role is named because 0015 showed it
-- does not inherit EXECUTE once PUBLIC is revoked.
--
-- Note this now references friendships, exactly as board_top does, and anon
-- holds no SELECT on friendships (0007). Postgres checks that privilege for
-- every table in the statement whether or not the friends branch runs, so a
-- session with no JWT gets "permission denied" here — the same as it already
-- does from board_top. The app signs in anonymously before it reads a board,
-- so it calls both as `authenticated`.
revoke all on function public.board_brackets(text, text, text, text, boolean) from public;
grant execute on function
  public.board_brackets(text, text, text, text, boolean) to anon, authenticated, service_role;
