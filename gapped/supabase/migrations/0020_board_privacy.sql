-- ─────────────────────────────────────────────────────────────────────────────
-- Gapped — what the boards show, and to whom.
--
-- Four changes, all to public reads:
--
--   1. Hidden and blocked drivers leave the boards. A driver the owner has
--      hidden (moderation_hidden, 0019) is on no board, bracket count,
--      friends list or make count for anyone. A driver you have blocked
--      (blocks, 0019) is on none of yours. Everyone else's view is unchanged.
--
--   2. leaderboard_entries is no longer readable row by row. Until now any
--      client could page through the table directly — every entry, with its
--      exact recorded_at, drive_id and value — which is a timeline of when
--      each named driver was out driving, and how fast. The boards are what
--      the app shows, and the board functions now return the only view of it:
--      one row per driver, with the time cut to the day. They become SECURITY
--      DEFINER to keep reading the table the caller no longer can.
--
--   3. Achievements are their owner's. The app only ever reads its own
--      (src/state/achievements.ts); the table was world-readable for no
--      reader.
--
--   4. "Fastest in country" is retired. The top-speed safeguards stop granting
--      country_number_one (verify-drive) and showing it (the app); the rows
--      already granted are deleted here so an older build cannot show one.
--
-- Signatures and returned columns of every function are unchanged.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══ 1. board_top ═════════════════════════════════════════════════════════════
--
-- 0009's body, with:
--   * the hidden and blocked exclusions in `windowed`, so they apply before a
--     driver's best is chosen and to every scope, bracket and window;
--   * trip_count counted over DISTANCE rows. It used to count top_speed rows,
--     "every drive has one" — no longer true: a drive whose top speed is over
--     its country's national limit gets no top_speed row at all (verify-drive,
--     _shared/speedLimits.ts), so counting those would drop that drive from
--     the Drives board. Every drive verify-drive scores writes a distance row,
--     so the counts for every drive already on the boards are unchanged;
--   * recorded_at returned as its UTC day — the board says when, not the
--     minute someone was out driving;
--   * the limit capped at 100. The app asks for 50; with anon able to call
--     this, a single call should not be able to return the whole table.
--
-- SECURITY DEFINER with an empty search_path, every name qualified. auth.uid()
-- still reads the caller's JWT, so the friends scope and the block list are
-- the caller's own.

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
security definer
set search_path = ''
as $$
  with windowed as (
    select e.*
    from public.leaderboard_entries e
    where
      -- trip_count has no entries of its own; it counts drives, and every
      -- scored drive has a distance entry.
      e.metric = case when p_metric = 'trip_count' then 'distance' else p_metric end
      and e.period = p_period
      -- Friends reads the global entries, then narrows to the friend set.
      and e.scope = case when p_scope = 'friends' then 'global' else p_scope end
      and (p_scope <> 'country' or e.country = p_country)
      and (p_bracket is null or e.bracket_key = p_bracket)
      and (
        p_scope <> 'friends'
        or e.profile_id in (
          select f.friend_id from public.friendships f where f.profile_id = auth.uid()
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
      -- Off every board: hidden by the owner, or blocked by this caller.
      and not exists (
        select 1 from public.moderation_hidden h where h.profile_id = e.profile_id
      )
      and not exists (
        select 1 from public.blocks bl
        where bl.blocker_id = auth.uid() and bl.blocked_id = e.profile_id
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
         date_trunc('day', b.recorded_at, 'UTC'), b.bracket_key
  from best b
  join public.profiles p on p.id = b.profile_id
  order by case when p_metric = 'zero_to_60' then b.value else -b.value end asc
  limit least(greatest(coalesce(p_limit, 50), 0), 100);
$$;

comment on function public.board_top(text, text, text, text, boolean, int, text) is
  'One row per driver: their best (or, for trip_count, their count of drives) on one board. Excludes moderation_hidden drivers and drivers the caller has blocked. recorded_at is the UTC day. At most 100 rows. SECURITY DEFINER: clients cannot read leaderboard_entries directly (0020).';


-- ══ 2. board_brackets ════════════════════════════════════════════════════════
-- 0016's body. Every clause still mirrors board_top's `windowed` — the
-- exclusions and the trip_count metric included — so a class is offered only
-- when the board for it has someone on it.

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
security definer
set search_path = ''
as $$
  -- Every clause below mirrors board_top's `windowed` CTE. If one changes,
  -- change both: a picker that disagrees with the board is the bug 0016 fixed.
  select e.bracket_key, count(distinct e.profile_id)
  from public.leaderboard_entries e
  where
    e.metric = case when p_metric = 'trip_count' then 'distance' else p_metric end
    and e.period = p_period
    and e.scope = case when p_scope = 'friends' then 'global' else p_scope end
    and (p_scope <> 'country' or e.country = p_country)
    and e.bracket_key is not null
    and (
      p_scope <> 'friends'
      or e.profile_id in (
        select f.friend_id from public.friendships f where f.profile_id = auth.uid()
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
    and not exists (
      select 1 from public.moderation_hidden h where h.profile_id = e.profile_id
    )
    and not exists (
      select 1 from public.blocks bl
      where bl.blocker_id = auth.uid() and bl.blocked_id = e.profile_id
    )
  group by e.bracket_key
  order by 2 desc, 1;
$$;


-- ══ 3. list_friends ══════════════════════════════════════════════════════════
-- 0006's body, now SECURITY DEFINER because best_speed reads
-- leaderboard_entries. Still only ever the caller's own friendships
-- (f.profile_id = auth.uid()). A friend who is hidden, or whom the caller has
-- blocked, drops off the list; the friendship row stays, so unblocking brings
-- them back.

create or replace function public.list_friends()
returns table (
  friend_id  uuid,
  username   text,
  country    char(2),
  best_speed double precision,
  added_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.country,
    (
      select max(e.value)
      from public.leaderboard_entries e
      where e.profile_id = p.id
        and e.metric = 'top_speed'
        and e.scope = 'global'
        and e.period = 'all'
        and e.verification = 'verified'
    ),
    f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  where f.profile_id = auth.uid()
    and not exists (
      select 1 from public.moderation_hidden h where h.profile_id = p.id
    )
    and not exists (
      select 1 from public.blocks bl
      where bl.blocker_id = auth.uid() and bl.blocked_id = p.id
    )
  order by f.created_at desc;
$$;


-- ══ 4. make_popularity ═══════════════════════════════════════════════════════
-- 0017's body; the one change is in `primaries`: a hidden driver, or one the
-- caller has blocked, is not one of the drivers counted. (Signed out, as on
-- most first launches, nobody is blocked.) See 0017 for everything else.

create or replace function public.make_popularity(p_kind text)
returns table (make text, drivers bigint, rank int, share numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with primaries as (
    select v.id, v.profile_id, v.kind, v.make,
           count(*) over (partition by v.profile_id) as held
    from public.vehicles v
    join public.profiles p on p.id = v.profile_id
    where v.is_primary
      and p.username is not null
      and not exists (
        select 1 from public.moderation_hidden h where h.profile_id = p.id
      )
      and not exists (
        select 1 from public.blocks bl
        where bl.blocker_id = auth.uid() and bl.blocked_id = p.id
      )
  ),
  main_vehicle as (
    -- Nearly every driver: one main vehicle, nothing to choose between.
    select pr.profile_id, pr.kind, pr.make
    from primaries pr
    where pr.held = 1
    union all
    -- Several, left by an older build.
    (
      select distinct on (pr.profile_id) pr.profile_id, pr.kind, pr.make
      from primaries pr
      where pr.held > 1
      order by
        pr.profile_id,
        -- The vehicle of this driver's latest drive, by the (profile_id,
        -- started_at desc) index: one short probe per row, not a drives scan.
        (pr.id is not distinct from (
          select d.vehicle_id
          from public.drives d
          where d.profile_id = pr.profile_id
          order by d.started_at desc
          limit 1
        )) desc,
        pr.id
    )
  ),
  of_kind as (
    -- \s rather than btrim's spaces only: the client trims with String.trim.
    select mv.profile_id, regexp_replace(mv.make, '^\s+|\s+$', '', 'g') as spelling
    from main_vehicle mv
    where mv.kind = p_kind
  ),
  named as (
    select o.profile_id, o.spelling, lower(o.spelling) as make_key
    from of_kind o
    where o.spelling <> ''
  ),
  display as (
    select distinct on (s.make_key) s.make_key, s.spelling
    from (
      select n.make_key, n.spelling, count(*) as uses
      from named n
      group by n.make_key, n.spelling
    ) s
    order by s.make_key, s.uses desc, s.spelling collate "C"
  ),
  ranked as (
    -- `named` holds one row per driver, so count(*) is distinct drivers.
    select
      n.make_key,
      count(*) as drivers,
      row_number() over (order by count(*) desc, n.make_key)::int as rank
    from named n
    group by n.make_key
  ),
  -- Every driver of the kind, a blank make included: the share's denominator
  -- is all of them, not "all drivers this lists".
  total as (
    select count(*) as drivers from of_kind
  )
  select d.spelling, r.drivers, r.rank, round(100.0 * r.drivers / t.drivers, 1)
  from ranked r
  join display d on d.make_key = r.make_key
  cross join total t
  where r.drivers >= 5
  order by r.rank;
$$;


-- ══ 5. country_activity ══════════════════════════════════════════════════════
-- 0017's body, with two changes that keep "{n} drivers from {Country} are on
-- the board" true to the boards as they now are:
--   * a driver is on the board with a verified top-speed OR distance row. A
--     driver whose every run was over the national limit has no top_speed
--     rows (see board_top above) but is still on the Distance board, which is
--     the board the Ranks tab opens on;
--   * hidden drivers count in neither number.
-- Floors, window and everything else as 0017 explains.

create or replace function public.country_activity(p_country text)
returns table (drivers bigint, drove_yesterday bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with code as (
    select upper(btrim(p_country)) as country
  ),
  yesterday as (
    -- now() at time zone 'utc' is the UTC wall clock; truncating it and
    -- reading it back as UTC gives today's 00:00 UTC as a timestamptz.
    select
      (date_trunc('day', now() at time zone 'utc') - interval '1 day') at time zone 'utc' as starts,
      date_trunc('day', now() at time zone 'utc') at time zone 'utc' as ends
  ),
  on_board as (
    select count(distinct e.profile_id) as n
    from public.leaderboard_entries e, code c
    where e.metric in ('top_speed', 'distance')
      and e.scope = 'country'
      and e.period = 'all'
      and e.verification = 'verified'
      and e.country = c.country
      and not exists (
        select 1 from public.moderation_hidden h where h.profile_id = e.profile_id
      )
  ),
  drove as (
    select count(distinct d.profile_id) as n
    from public.profiles p
    join public.drives d on d.profile_id = p.id
    cross join code c
    cross join yesterday y
    where p.country = c.country
      and d.started_at >= y.starts
      and d.started_at < y.ends
      and d.verification <> 'rejected'
      and not exists (
        select 1 from public.moderation_hidden h where h.profile_id = p.id
      )
  )
  select
    case when b.n >= 10 then b.n end,
    case when dr.n >= 10 then dr.n end
  from on_board b, drove dr;
$$;


-- ── grants (unchanged by `create or replace`; restated, per 0007) ───────────
revoke all on function public.board_top(text, text, text, text, boolean, int, text) from public;
revoke all on function public.board_brackets(text, text, text, text, boolean)       from public;
revoke all on function public.list_friends()                                         from public, anon;
revoke all on function public.make_popularity(text)                                  from public;
revoke all on function public.country_activity(text)                                 from public;

grant execute on function public.board_top(text, text, text, text, boolean, int, text)
  to anon, authenticated, service_role;
grant execute on function public.board_brackets(text, text, text, text, boolean)
  to anon, authenticated, service_role;
grant execute on function public.list_friends()          to authenticated;
grant execute on function public.make_popularity(text)   to anon, authenticated, service_role;
grant execute on function public.country_activity(text)  to anon, authenticated, service_role;


-- ══ 6. leaderboard_entries: through the board functions only ═════════════════
-- Writes were already service-role only (0007). Reads now are too: the board
-- functions above are the public view. The world-readable policy goes with the
-- grant, so a stray future `grant select` would meet default-deny RLS rather
-- than re-open the table.
revoke select on public.leaderboard_entries from anon, authenticated;
drop policy if exists boards_select on public.leaderboard_entries;


-- ══ 7. achievements: their owner's ═══════════════════════════════════════════
-- Still written only by verify-drive under the service role (the reasoning in
-- 0010 and tests/achievements_permissions.test.sql depends on that).
drop policy if exists achievements_select on public.achievements;
create policy achievements_select on public.achievements
  for select to authenticated using (auth.uid() = profile_id);
revoke all on public.achievements from anon;
grant select on public.achievements to authenticated;


-- ══ 8. "Fastest in country", retired ═════════════════════════════════════════
-- No build from this release on grants or shows it. Removing the rows already
-- granted means an older build reading its own achievements cannot show one
-- either. delete_drives_and_reconcile (0014) still knows the kind and simply
-- finds nothing to revoke.
delete from public.achievements where kind = 'country_number_one';
