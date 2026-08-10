-- Gapped — remove the PostGIS round-trip from the verification path.
--
-- THE BUG (confirmed by running it): PostgREST returns a `geography` column as
-- WKB hex, e.g. '0101000020E6100000DA1B7C613255C0BFFE43FAEDEBC04940'. The
-- verify-drive Edge Function selects `point` and parses it with a WKT regex
-- (/POINT\(lon lat\)/), which cannot match WKB, so every fix silently fell
-- back to lat=0, lon=0.
--
-- The consequence was not a crash — it was worse. Server-side re-derivation is
-- the product's entire claim to a believable leaderboard, and it would have
-- recomputed every drive from a stationary point in the Gulf of Guinea:
-- distance ~0, speeds ~0, no 0-60, plausibility judged on garbage — then
-- written those numbers to the boards stamped 'verified'.
--
-- The fix is to stop round-tripping coordinates through PostGIS at all. The
-- client already has lat/lon as plain numbers and the WAL already stores them
-- that way; going number → geography → WKB hex → parsed number only adds a
-- failure mode and precision loss. lat/lon become the stored truth and `point`
-- becomes a generated column, so the spatial index stays available for future
-- geo queries and can never disagree with the numbers it derives from.

-- ── drive_fixes: lat/lon are the truth, point is derived ────────────────────
alter table drive_fixes
  add column lat double precision,
  add column lon double precision;

update drive_fixes set lat = st_y(point::geometry), lon = st_x(point::geometry);

alter table drive_fixes alter column lat set not null;
alter table drive_fixes alter column lon set not null;

-- Dropping the column drops its GIST index with it.
alter table drive_fixes drop column point;

alter table drive_fixes add column point geography(point, 4326)
  generated always as (st_setsrid(st_makepoint(lon, lat), 4326)::geography) stored;

create index on drive_fixes using gist (point);

-- A fix outside these ranges is a client bug, not a drive. Cheap to enforce,
-- and it fails the upload loudly instead of poisoning a board quietly.
alter table drive_fixes
  add constraint drive_fixes_lat_range check (lat between -90 and 90),
  add constraint drive_fixes_lon_range check (lon between -180 and 180);

-- ── drives: a client-readable route ─────────────────────────────────────────
-- `route` has exactly the same WKB problem the moment the app reads a route
-- back from the server (restoring drives on a new device, or showing a shared
-- one). src/drive/polyline.ts already implements the Google polyline codec on
-- both sides and is unit-tested against the reference vector, so store the
-- trimmed route in that form too: compact, and decodable with no PostGIS.
-- `route` stays for server-side spatial work.
alter table drives add column route_polyline text;

comment on column drives.route_polyline is
  'Privacy-trimmed route as an encoded Google polyline — the form clients read. Written only by verify-drive.';
comment on column drive_fixes.point is
  'Derived from lat/lon. Never write this directly; it is generated so it cannot disagree with them.';
