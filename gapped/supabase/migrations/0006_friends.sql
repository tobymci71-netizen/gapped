-- Gapped — friends (spec Phase 6).
--
-- The friends board already works (0004 narrows the global board to the people
-- you have added), but nothing could add anyone: `friendships` had policies and
-- no way to write a row that wasn't hand-rolled on the client.
--
-- The relation is directional — "following", not mutual consent. That is a
-- deliberate product choice and it is why it is safe: adding someone only
-- changes *your* board, never theirs, so there are no requests to accept, no
-- pending state, and no way to put yourself on somebody else's screen. Every
-- field it exposes (username, country, verified bests) is already world-
-- readable on the global board.

-- ── add ─────────────────────────────────────────────────────────────────────
-- security invoker: the insert still passes through friendships' RLS, so the
-- function cannot write a row on anyone else's behalf even if it wanted to.
create or replace function public.add_friend(p_username text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into fid from profiles where username = p_username;
  if fid is null then
    raise exception 'no driver called %', p_username using errcode = 'P0002';
  end if;
  if fid = auth.uid() then
    raise exception 'you are already on your own board' using errcode = 'P0001';
  end if;

  -- Idempotent: adding twice is a no-op, not an error the UI has to explain.
  insert into friendships (profile_id, friend_id)
  values (auth.uid(), fid)
  on conflict (profile_id, friend_id) do nothing;

  return fid;
end;
$$;

-- ── remove ──────────────────────────────────────────────────────────────────
create or replace function public.remove_friend(p_friend_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from friendships
  where profile_id = auth.uid() and friend_id = p_friend_id;
$$;

-- ── list ────────────────────────────────────────────────────────────────────
-- Returns the people you follow plus their best verified top speed, so the
-- friends screen does not need a second round trip per row.
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
security invoker
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.country,
    (
      select max(e.value)
      from leaderboard_entries e
      where e.profile_id = p.id
        and e.metric = 'top_speed'
        and e.scope = 'global'
        and e.period = 'all'
        and e.verification = 'verified'
    ),
    f.created_at
  from friendships f
  join profiles p on p.id = f.friend_id
  where f.profile_id = auth.uid()
  order by f.created_at desc;
$$;

grant execute on function public.add_friend(text)     to authenticated;
grant execute on function public.remove_friend(uuid)  to authenticated;
grant execute on function public.list_friends()       to authenticated;

-- The friends board resolves friendships for the caller on every query.
create index on friendships (profile_id, friend_id);
