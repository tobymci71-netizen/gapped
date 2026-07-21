-- Gapped — initial schema. Spec: BUILD-PROMPT.md §4.
-- Postgres + PostGIS. This schema is the contract.
-- Invariants:
--   * All derived drive values are computed server-side from fixes. Client
--     aggregates are advisory only.
--   * SI units internally, ALWAYS. Convert at render only.
--   * route_full never leaves the server (no RLS select policy exposes it;
--     API surfaces must select `route` only).

create extension if not exists postgis;

-- ── identity ────────────────────────────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users,
  username      text unique not null,
  country       char(2) not null,           -- ISO 3166-1 alpha-2, leaderboard region
  avatar_url    text,
  unit_pref     text not null default 'metric' check (unit_pref in ('metric','imperial')),
  created_at    timestamptz not null default now()
);

create table vehicles (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles on delete cascade,
  kind          text not null check (kind in ('car','motorbike')),
  make          text not null,
  model         text not null,
  year          int,
  -- populated from NHTSA vPIC (free) for bracketing; null until matched
  curb_weight_kg    int,
  factory_power_hp  int,
  drivetrain        text check (drivetrain in ('fwd','rwd','awd','4wd')),
  is_modified       boolean not null default false,   -- self-declared, always flagged unverified
  photo_url         text,
  is_primary        boolean not null default false
);

-- ── the drive ───────────────────────────────────────────────────────────────
create table drives (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles on delete cascade,
  vehicle_id      uuid references vehicles,
  started_at      timestamptz not null,
  ended_at        timestamptz not null,

  -- ALL derived values are computed server-side from fixes. Never client-supplied.
  distance_m      double precision not null,
  duration_s      int not null,
  max_speed_ms    double precision not null,   -- SI internally, ALWAYS. Convert at render only.
  avg_speed_ms    double precision not null,
  max_g           double precision,
  avg_g           double precision,
  zero_to_60_s    double precision,            -- null unless a clean window was detected

  route           geography(linestring, 4326), -- trimmed polyline, safe to share
  route_full      geography(linestring, 4326), -- untrimmed, never leaves the server

  verification    text not null default 'pending'
                    check (verification in ('pending','verified','unverified','rejected')),
  verification_meta jsonb not null default '{}',  -- which checks ran, which failed, scores
  created_at      timestamptz not null default now(),

  constraint speeds_reconcile check (avg_speed_ms <= max_speed_ms)  -- TripRank ships violations of this
);

-- raw sensor data. Retained for re-verification and dispute resolution.
create table drive_fixes (
  drive_id    uuid not null references drives on delete cascade,
  t           timestamptz not null,
  point       geography(point, 4326) not null,
  speed_ms    double precision,      -- device-reported, cross-checked against derived
  accuracy_m  double precision,
  altitude_m  double precision,
  heading     double precision,
  accel_x     double precision,      -- IMU: the part that's hard to fake
  accel_y     double precision,
  accel_z     double precision,
  pressure_hpa double precision,     -- barometer: varies on a real drive
  is_mock     boolean not null default false,
  primary key (drive_id, t)
);

create index on drive_fixes using gist (point);
create index on drives (profile_id, started_at desc);
create index on drives (verification, max_speed_ms desc);

-- ── competition ─────────────────────────────────────────────────────────────
create table leaderboard_entries (
  id            uuid primary key default gen_random_uuid(),
  drive_id      uuid not null references drives on delete cascade,
  profile_id    uuid not null references profiles on delete cascade,
  metric        text not null check (metric in ('top_speed','distance','trip_count','zero_to_60')),
  value         double precision not null,
  scope         text not null check (scope in ('global','country','friends')),
  country       char(2),
  bracket_key   text,                -- e.g. 'rwd|stock|1200-1500kg'  — null = open class
  period        text not null check (period in ('day','week','month','all')),
  verification  text not null,       -- denormalised so board queries never join
  recorded_at   timestamptz not null
);

create index on leaderboard_entries (metric, scope, period, bracket_key, verification, value desc);

create table friendships (
  profile_id  uuid not null references profiles on delete cascade,
  friend_id   uuid not null references profiles on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, friend_id)
);

create table achievements (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles on delete cascade,
  kind        text not null,          -- 'fastest_in_country', 'first_verified_run', 'streak_7'
  payload     jsonb not null default '{}',
  earned_at   timestamptz not null default now()
);

-- ── row level security ──────────────────────────────────────────────────────
-- RLS on every table. A user reads only their own drives, fixes and vehicles.
-- leaderboard_entries are world-readable. route_full is never exposed through
-- any API (enforce additionally at the PostgREST/view layer).

alter table profiles            enable row level security;
alter table vehicles            enable row level security;
alter table drives              enable row level security;
alter table drive_fixes         enable row level security;
alter table leaderboard_entries enable row level security;
alter table friendships         enable row level security;
alter table achievements        enable row level security;

-- profiles: public usernames are part of the product (boards), so world-readable;
-- only the owner writes.
create policy profiles_select on profiles for select using (true);
create policy profiles_insert on profiles for insert with check (auth.uid() = id);
create policy profiles_update on profiles for update using (auth.uid() = id);

create policy vehicles_select on vehicles for select using (auth.uid() = profile_id);
create policy vehicles_write  on vehicles for insert with check (auth.uid() = profile_id);
create policy vehicles_update on vehicles for update using (auth.uid() = profile_id);
create policy vehicles_delete on vehicles for delete using (auth.uid() = profile_id);

create policy drives_select on drives for select using (auth.uid() = profile_id);
-- Inserts land as 'pending'; verification state transitions happen only via
-- service-role Edge Functions (server-side re-derivation), never the client.
create policy drives_insert on drives for insert
  with check (auth.uid() = profile_id and verification = 'pending');
create policy drives_delete on drives for delete using (auth.uid() = profile_id);

create policy fixes_select on drive_fixes for select
  using (exists (select 1 from drives d where d.id = drive_id and d.profile_id = auth.uid()));
create policy fixes_insert on drive_fixes for insert
  with check (exists (select 1 from drives d where d.id = drive_id and d.profile_id = auth.uid()));

create policy boards_select on leaderboard_entries for select using (true);
-- No client insert/update/delete on leaderboard_entries: rows are written only
-- by the verification Edge Function using the service role.

create policy friendships_select on friendships for select
  using (auth.uid() = profile_id or auth.uid() = friend_id);
create policy friendships_insert on friendships for insert with check (auth.uid() = profile_id);
create policy friendships_delete on friendships for delete using (auth.uid() = profile_id);

create policy achievements_select on achievements for select using (true);
-- Achievements are granted server-side only.

-- ── public views (route_full stays server-side) ─────────────────────────────
-- API consumers use this view; the base table's route_full column is never
-- exposed through PostgREST because the view omits it.
create view drives_public with (security_invoker = true) as
  select id, profile_id, vehicle_id, started_at, ended_at,
         distance_m, duration_s, max_speed_ms, avg_speed_ms,
         max_g, avg_g, zero_to_60_s,
         route, verification, verification_meta, created_at
  from drives;
