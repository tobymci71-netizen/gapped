-- ─────────────────────────────────────────────────────────────────────────────
-- Gapped — the numbers behind onboarding's proof screens, and where its
-- answers go.
--
-- docs/ONBOARDING.md, rule 1: every count on a proof screen comes from here.
-- The reference app this flow was studied from prints "1M+ miles" whatever its
-- data says. Gapped's first screens may only print what these two functions
-- return, and the client (src/onboarding/proofVariants.ts) shows an honest
-- early-stage variant with no number when they return too little.
--
--   make_popularity(kind)     drivers per make, for "BMW drivers are already
--                             on the board" and the five-row chart
--   country_activity(country) drivers on that country's board, and drivers
--                             from it who drove yesterday
--   onboarding_answers        focus and "how did you hear about us", own row
--                             only
--   vehicles_profile_id_idx   for sync.ts's one-main-car bookkeeping
--
-- Both functions are SECURITY DEFINER because what they count is private row
-- by row: vehicles and drives are own-row only under RLS (0001), so an invoker
-- function would count one driver, the caller. They return aggregates and
-- nothing else — no ids, no usernames, no timestamps — and a count small
-- enough to point at a person never leaves them (the floors below).
-- ─────────────────────────────────────────────────────────────────────────────


-- ══ 1. make_popularity ═══════════════════════════════════════════════════════
--
-- One row per make: how many distinct drivers have it as their main vehicle,
-- for one vehicle kind.
--
-- WHO COUNTS. A profile with a username — someone who finished choosing how
-- they appear on the boards. A vehicles row can reach the server mid-
-- onboarding (startup sync pushes whatever the store holds), and a half-made
-- profile is not yet a driver anyone could meet. The person looking at the
-- screen is never counted: they have not got that far.
--
-- WHICH VEHICLE. The main one: is_primary. Each driver counts once, under one
-- make. sync.ts demotes the previous main vehicle when the car changes, but
-- builds before that left the old row primary too, so a driver can still hold
-- several. Then the one behind their most recent drive wins (what they
-- actually drive), and failing that the lowest id — arbitrary, but stable, so
-- the chart cannot reshuffle between two calls. Only those drivers pay for
-- the drives lookup: anyone can call this, from every first launch, and a
-- probe per driver would make every call cost as much as the whole driver
-- list. Extra vehicles from the garage step are is_primary = false and never
-- count.
--
-- WHICH MAKE. Makes are free text where the catalogue has no match ("Not
-- listed? Add it yourself"), so "BMW", "bmw" and " BMW " are one make: grouped
-- by the trimmed, lower-cased spelling — the same rule the client's sameMake
-- matches with — and shown in the spelling most of its drivers used, ties to
-- the one that sorts first bytewise (capitals first: "BMW" over "Bmw").
--
-- RANK AND SHARE. rank is 1 for the most drivers, ties broken by make
-- alphabetically, so ranks are unique and "#2 most popular" names one make.
-- share is a PERCENTAGE (0–100, one decimal) of every driver of the kind —
-- the chart's own population, as MakePopularityRow.share is documented —
-- including drivers of makes this does not list, so it is never a share of
-- "the drivers big enough to show". For cars that is all but every Gapped
-- driver; for motorbikes it is every rider, and the screen's wording has to
-- say so.
--
-- THE FLOOR. A make is listed only once FIVE distinct drivers share it. Below
-- that a row is close to naming a person ("one Gapped driver has a Pagani"),
-- and since a make can be typed freely it would also let one account put any
-- words it liked on every other driver's chart. Five is the client's own bar
-- for printing a make's count (MIN_MAKE_DRIVERS), so nothing the screen would
-- have shown is lost: the person's make below five was always the early
-- variant. The floor only removes the tail, so the ranks of the rows that
-- remain are the ranks they had.

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

comment on function public.make_popularity(text) is
  'Onboarding make proof: distinct named drivers per main-vehicle make for one kind, rank (unique; drivers desc, make asc) and share as a percentage of all drivers of the kind. Makes with fewer than 5 drivers are withheld. Aggregates only.';

-- Explicit, per 0007: EXECUTE defaults to PUBLIC on a new function, and on
-- Supabase the default privileges also hand it to anon and authenticated
-- whether or not that was meant. So revoke everything and grant back the
-- exact set. anon is included because a signed-out first launch is when this
-- screen is seen, and the function reveals nothing a session would protect;
-- service_role is named because 0015 showed it does not inherit EXECUTE once
-- PUBLIC is revoked.
revoke all on function public.make_popularity(text) from public, anon, authenticated;
grant execute on function public.make_popularity(text) to anon, authenticated, service_role;


-- ══ 2. country_activity ══════════════════════════════════════════════════════
--
-- Two counts for one country, always exactly one row.
--
-- drivers — distinct drivers with a VERIFIED run on that country's board:
--   leaderboard_entries at country scope, which is the board the screen means
--   by "{n} drivers from {Country} are on the board" and "The {Country} board
--   fills one verified run at a time". An entry keeps the country it was set
--   in (0010), so a driver who has since moved still counts where their runs
--   are, exactly as the board itself still shows them. Read through the
--   all-time top-speed rows: every verified drive writes one (verify-drive
--   always has a top speed), so the count is the same as over every metric and
--   period, and the board index can answer it.
--
-- drove_yesterday — distinct drivers whose profile is in the country with a
--   drive that STARTED on the previous UTC calendar day, [00:00, 24:00) UTC.
--     * UTC, not the country's local day: the schema holds no time zone per
--       country, several countries span many, and a UTC day is the same
--       window for every caller and every server. For a European country it
--       is within an hour or two of the local day.
--     * The previous complete day, not "the last 24 hours": the number then
--       changes once a day, at UTC midnight, so it cannot be polled to see
--       that somebody has just gone out for a drive.
--     * By start time, so a drive that crosses midnight counts once, on the
--       day it began; uploaded late, it still counts for that day.
--     * Any drive the server has not rejected. Pending and unverified drives
--       were still driven with Gapped (verified-only is for the board, which
--       ranks speeds); a rejected one never amounted to a drive (verify-drive
--       rejects too few fixes to describe one).
--     * The profile's current country: these are "drivers from {Country}",
--       whose drives carry no country of their own.
--
-- THE FLOOR. Each count comes back NULL below ten. "1 driver from Guernsey
-- drove yesterday" is a statement about one person's movements, made to
-- anyone who asks — and profiles, with their countries, are world-readable.
-- Ten is the client's own bar for printing either line (MIN_COUNTRY_DRIVERS),
-- so a withheld count only ever stood for the early variant. NULL rather than
-- 0, so a caller can tell "too few to say" from a count.
--
-- The code is upper-cased, so "gb" finds GB; an unknown code is two NULLs.

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
    where e.metric = 'top_speed'
      and e.scope = 'country'
      and e.period = 'all'
      and e.verification = 'verified'
      and e.country = c.country
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
  )
  select
    case when b.n >= 10 then b.n end,
    case when dr.n >= 10 then dr.n end
  from on_board b, drove dr;
$$;

comment on function public.country_activity(text) is
  'Onboarding country proof: distinct drivers with a verified run on the country board, and distinct drivers from the country (profile) with a non-rejected drive started on the previous UTC day. Each is NULL below 10. One row. Aggregates only.';

-- Same grant set as make_popularity, for the same reasons.
revoke all on function public.country_activity(text) from public, anon, authenticated;
grant execute on function public.country_activity(text) to anon, authenticated, service_role;


-- ══ 3. onboarding_answers ════════════════════════════════════════════════════
--
-- "What matters to your drive?" and "How did you hear about us?". Its own
-- table, never columns on profiles: profiles is world-readable for the boards
-- (0001), and where someone heard about the app is nobody else's business.
--
-- One row per driver, upserted by the client (socialProof.ts) and retried from
-- the store by sync.ts. Either answer may be NULL: the client only ever sends
-- the answers it has, so a later write cannot blank an earlier one.
--
-- The checks hold exactly the keys the client stores (Focus and Attribution in
-- src/state/profile.ts). Adding an option is a migration here and a key there.
--
-- updated_at belongs to the server: a trigger sets it on every write, and the
-- client holds no privilege on the column, so "when did this driver answer"
-- cannot be backdated.

create table if not exists public.onboarding_answers (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  focus       text check (focus in ('topSpeed', 'zeroToSixty', 'localRanking', 'beatFriends')),
  attribution text check (attribution in (
                'tiktok', 'appStore', 'friend', 'x', 'other', 'reddit', 'youtube', 'instagram'
              )),
  updated_at  timestamptz not null default now()
);

comment on table public.onboarding_answers is
  'Onboarding focus and attribution, one row per profile. Own-row RLS; never on profiles, which is world-readable. Deleted with the account (cascade from profiles).';

create or replace function public.touch_onboarding_answers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A trigger function is never called directly, but EXECUTE still defaults to
-- PUBLIC; nobody needs it.
revoke all on function public.touch_onboarding_answers() from public, anon, authenticated;

drop trigger if exists onboarding_answers_touch on public.onboarding_answers;
create trigger onboarding_answers_touch
  before insert or update on public.onboarding_answers
  for each row execute function public.touch_onboarding_answers();

-- ── row level security: own row, read and write; nobody else's, ever ────────
alter table public.onboarding_answers enable row level security;

drop policy if exists onboarding_answers_select on public.onboarding_answers;
drop policy if exists onboarding_answers_insert on public.onboarding_answers;
drop policy if exists onboarding_answers_update on public.onboarding_answers;

create policy onboarding_answers_select on public.onboarding_answers
  for select using (auth.uid() = profile_id);
create policy onboarding_answers_insert on public.onboarding_answers
  for insert with check (auth.uid() = profile_id);
-- WITH CHECK as well as USING (see 0002 §4): without it an owner could move
-- their row onto another driver's id.
create policy onboarding_answers_update on public.onboarding_answers
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
-- No delete policy: the row goes with the account, by cascade.

-- ── privileges: explicit, per 0007 ───────────────────────────────────────────
-- Start from nothing whatever this project's defaults are, then grant back the
-- set the policies above need.
--
-- The column lists are load-bearing. supabase-js's upsert compiles to
-- ON CONFLICT (profile_id) DO UPDATE SET <every column it sent>, and Postgres
-- wants UPDATE on each of those even when nothing conflicts — so profile_id is
-- in the UPDATE list (the WITH CHECK above keeps it pointing at the caller),
-- and updated_at is in neither, which is what leaves it to the trigger.
revoke all on public.onboarding_answers from public, anon, authenticated, service_role;
grant select on public.onboarding_answers to authenticated;
grant insert (profile_id, focus, attribution) on public.onboarding_answers to authenticated;
grant update (profile_id, focus, attribution) on public.onboarding_answers to authenticated;
grant select, insert, update, delete on public.onboarding_answers to service_role;
-- anon gets nothing: a signed-out device has no row to own.


-- ══ 4. vehicles by driver ════════════════════════════════════════════════════
--
-- sync.ts now keeps one main vehicle per driver: after pushing the main car it
-- runs UPDATE vehicles SET is_primary = false WHERE profile_id = <me> AND
-- is_primary AND id <> <main>, on every identity change. vehicles has had no
-- index but its primary key since 0001, so each of those — and the own-row
-- RLS filter under it, and the cascade when an account is deleted — read the
-- whole table. Named as Postgres would name it, so `if not exists` can see it.
create index if not exists vehicles_profile_id_idx on public.vehicles (profile_id);
