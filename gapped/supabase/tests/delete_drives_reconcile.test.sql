-- ─────────────────────────────────────────────────────────────────────────────
-- Deleting drives leaves the boards consistent, not merely emptier.
--
-- The failure this guards against is subtle: the cascade already removes
-- leaderboard entries correctly, so a naive test passes while the account still
-- displays a "Fastest in country" trophy for a run that no longer exists — and
-- because achievements are upserted with ignoreDuplicates, nothing will ever
-- re-evaluate it.
--
--   npm run test:db
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'driver@example.com');

insert into profiles (id, username, country)
values ('cccccccc-0000-0000-0000-00000000000a', 'testdriver', 'GG')
on conflict (id) do update set username = 'testdriver', country = 'GG';

-- One verified drive that tops the GG board and carries a 0-60.
insert into drives (id, profile_id, started_at, ended_at, distance_m, duration_s,
                    max_speed_ms, avg_speed_ms, zero_to_60_s, verification)
values ('cccccccc-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000a',
        now(), now(), 5000, 300, 45, 16, 6.2, 'verified');

insert into leaderboard_entries (id, drive_id, profile_id, metric, value, scope,
                                 period, verification, country, recorded_at)
values ('cccccccc-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000b',
        'cccccccc-0000-0000-0000-00000000000a', 'top_speed', 45, 'country', 'all',
        'verified', 'GG', now());

-- The three trophies that drive earned.
insert into achievements (profile_id, kind, payload) values
  ('cccccccc-0000-0000-0000-00000000000a', 'first_verified_run', '{"max_speed_ms":45}'),
  ('cccccccc-0000-0000-0000-00000000000a', 'first_measured_launch', '{"zero_to_60_s":6.2}'),
  ('cccccccc-0000-0000-0000-00000000000a', 'country_number_one', '{"country":"GG","value":45}');

select is((select count(*)::int from achievements where profile_id = 'cccccccc-0000-0000-0000-00000000000a'), 3, 'fixture: three achievements granted');

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ── dry run changes nothing ─────────────────────────────────────────────────

select is(
  (public.delete_drives_and_reconcile(array['cccccccc-0000-0000-0000-00000000000b']::uuid[]) ->> 'would_delete_drives')::int,
  1,
  'dry run reports the drive it would delete'
);

select is(
  (select count(*)::int from drives where id = 'cccccccc-0000-0000-0000-00000000000b'),
  1,
  'dry run left the drive alone'
);

-- ── the real thing ──────────────────────────────────────────────────────────

select is(
  (public.delete_drives_and_reconcile(array['cccccccc-0000-0000-0000-00000000000b']::uuid[], false) ->> 'deleted_drives')::int,
  1,
  'delete reports one drive removed'
);

reset role;

select is((select count(*)::int from drives where id = 'cccccccc-0000-0000-0000-00000000000b'), 0, 'drive is gone');
select is((select count(*)::int from leaderboard_entries where drive_id = 'cccccccc-0000-0000-0000-00000000000b'), 0, 'its leaderboard entry cascaded away');

-- ── and the trophies it earned went with it ─────────────────────────────────
-- This is the part a cascade cannot do.

select is(
  (select count(*)::int from achievements
    where profile_id = 'cccccccc-0000-0000-0000-00000000000a' and kind = 'first_verified_run'),
  0,
  'CONSISTENT: first_verified_run revoked — no verified drives remain'
);

select is(
  (select count(*)::int from achievements
    where profile_id = 'cccccccc-0000-0000-0000-00000000000a' and kind = 'first_measured_launch'),
  0,
  'CONSISTENT: first_measured_launch revoked — no 0-60 remains'
);

select is(
  (select count(*)::int from achievements
    where profile_id = 'cccccccc-0000-0000-0000-00000000000a' and kind = 'country_number_one'),
  0,
  'CONSISTENT: country_number_one revoked — the profile no longer tops GG'
);

-- ── it cannot reach anyone else's drives ────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.com');
insert into profiles (id, username, country)
values ('cccccccc-0000-0000-0000-00000000000d', 'someoneelse', 'GG')
on conflict (id) do update set username = 'someoneelse';
insert into drives (id, profile_id, started_at, ended_at, distance_m, duration_s,
                    max_speed_ms, avg_speed_ms, verification)
values ('cccccccc-0000-0000-0000-00000000000e', 'cccccccc-0000-0000-0000-00000000000d',
        now(), now(), 9000, 400, 50, 22, 'verified');

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.delete_drives_and_reconcile(array['cccccccc-0000-0000-0000-00000000000e']::uuid[], false);
reset role;

select is(
  (select count(*)::int from drives where id = 'cccccccc-0000-0000-0000-00000000000e'),
  1,
  'ATTACK BLOCKED: naming another user''s drive id deletes nothing'
);

select * from finish();
rollback;
