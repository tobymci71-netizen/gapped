# Deleting test drives from the live boards

Written for the case where a road test produces drives you want off the
leaderboards — a wrong IMU fix, a spoofed-looking run, or just noise from
testing on the one project that is also production.

---

## First: what a wrong IMU fix can and cannot corrupt

Worth knowing before you drive, because it narrows what you actually have to
worry about.

The three board metrics are `top_speed`, `distance` and `zero_to_60`. **All
three are derived from GPS**, not from the IMU — `detectZeroToSixty` reads the
speed trace from `deriveSpeeds`, which uses `Fix.speedMs` (CoreLocation) and
falls back to positional differencing. The accelerometer is not consulted.

`max_g` and `avg_g` are written to `drives` and shown on the drive detail
screen. **They never reach `leaderboard_entries`.**

So if the gravity fix is wrong, the damage is confined to:

- `drives.max_g` / `drives.avg_g` on the affected drives
- the `first_verified_run` payload, which snapshots `max_speed_ms` (GPS — fine)

**A wrong IMU fix cannot corrupt a leaderboard.** A genuinely fast test drive
can, and that is what this document is for.

---

## What already existed

**Nothing in the app deletes a drive.** `drives` grants `DELETE` to
`authenticated` and RLS scopes it to your own rows, so the capability is there —
but no screen calls it. Drive detail (`app/drive/[id].tsx`) only reads.

What a raw `DELETE FROM drives` would do:

| Table | Behaviour |
| --- | --- |
| `drive_fixes` | cascades ✅ |
| `drive_routes_private` | cascades ✅ |
| `leaderboard_entries` | cascades ✅ |
| `achievements` | **does not cascade** ❌ |

Achievements hang off `profile_id`, never off `drive_id`, and `grantAchievements`
upserts them with `ignoreDuplicates: true` — written once, never re-evaluated.

So a plain delete leaves you holding a "Fastest in country" trophy for a run
that no longer exists, and the driver who is genuinely top now will never
receive it, because granting only fires during verification. The board would be
emptier and *disagree with the achievements next to it*.

---

## The function

Migration `0014` adds `delete_drives_and_reconcile(uuid[], boolean)`. It deletes
your drives, then re-derives each of the four achievement conditions and revokes
any that no longer hold:

| Achievement | Kept only if |
| --- | --- |
| `first_verified_run` | ≥ 1 verified drive remains |
| `ten_verified_runs` | ≥ 10 verified drives remain |
| `first_measured_launch` | some remaining drive has a 0-60 |
| `country_number_one` | you still top your country's all-time verified top-speed board |

It **revokes rather than repoints**: a payload records the run that earned it,
and rewriting it to name a different run would invent a history that never
happened. The next verified drive re-grants it honestly.

It does **not** hand the trophy to whoever should hold it now. Granting is
verify-drive's job and it will happen on their next verified run; two places
minting trophies is how they start disagreeing.

Security-definer, scoped to `auth.uid()`. Naming someone else's drive id matches
nothing rather than erroring — asserted by a test.

### Deploy it

Not yet applied to the cloud project. One command:

```bash
supabase db push
```

That applies `0014` only (`0001`–`0013` are already there).

---

## Identifying your test drives

You are the only real account; the `buddy_*` profiles are seeded fixtures. Start
by listing what you have, newest first:

```bash
supabase db query --linked "
select d.id, d.started_at at time zone 'Europe/London' as started_local,
       round(d.distance_m)   as m,
       round(d.duration_s)   as secs,
       round(d.max_speed_ms::numeric, 1) as max_ms,
       round((d.max_speed_ms * 2.23694)::numeric, 1) as max_mph,
       round(d.max_g::numeric, 3) as max_g,
       round(d.zero_to_60_s::numeric, 2) as zero_60,
       d.verification, d.imu_convention,
       (select count(*) from leaderboard_entries e where e.drive_id = d.id) as board_entries
from drives d
join profiles p on p.id = d.profile_id
where p.username = 'YOUR_USERNAME'
order by d.started_at desc
limit 30;"
```

Three ways to pick the bad batch, best first:

1. **By clock time.** Note when you set off. Everything after that timestamp is
   the test session. Unambiguous, and the reason to write the time down before
   you drive rather than reconstruct it after.

2. **By `max_g`.** If the fix is wrong, `max_g` clusters near or above 1.0 on
   every drive. That column *is* the diagnosis, so it doubles as the selector:
   `where max_g > 0.95`.

3. **By eye.** For a handful of drives, read the table and copy the ids.

`imu_convention` will read `user_acceleration` for everything a TestFlight build
records, so it does **not** separate good from bad — it only separates
pre-fix development data from post-fix data.

---

## Deleting

**Dry run first — it is the default**, so a forgotten argument reports rather
than deletes:

```bash
supabase db query --linked "
select delete_drives_and_reconcile(array[
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111'
]::uuid[]);"
```

```json
{ "dry_run": true, "would_delete_drives": 2,
  "would_delete_leaderboard_entries": 6,
  "note": "Re-run with p_dry_run := false to apply." }
```

Check the counts look right — three board entries per drive is normal
(`top_speed`, `distance`, `zero_to_60`) plus country-scoped duplicates. Then:

```bash
supabase db query --linked "
select delete_drives_and_reconcile(array[
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111'
]::uuid[], false);"
```

```json
{ "dry_run": false, "deleted_drives": 2,
  "deleted_leaderboard_entries": 6,
  "revoked_achievements": ["country_number_one"],
  "verified_drives_remaining": 4 }
```

### Whole-session nuke

If the entire test session was bad, select by time instead of by id:

```bash
supabase db query --linked "
select delete_drives_and_reconcile(
  (select array_agg(d.id)
     from drives d join profiles p on p.id = d.profile_id
    where p.username = 'YOUR_USERNAME'
      and d.started_at >= '2026-08-12 18:00:00+01'),
  false
);"
```

---

## Afterwards

```bash
supabase db query --linked "
select 'drives'  as t, count(*) from drives
union all select 'entries', count(*) from leaderboard_entries
union all select 'achievements', count(*) from achievements
union all select 'orphaned entries',
  (select count(*) from leaderboard_entries e
    left join drives d on d.id = e.drive_id where d.id is null);"
```

`orphaned entries` must be **0**.

### The device keeps its own copy

The function reaches the server only. Your phone still holds the drive in SQLite
and in its local personal bests, which are accumulated incrementally and never
recomputed — so a deleted drive's top speed can still show under **You**.

Settings → **Delete account** clears both sides and returns the app to first
run. For one tester mid-testing that is usually the simpler move; the SQL above
is for when you want to keep the account and drop a batch.

---

## Not verified

The function is covered by 10 pgTAP assertions against local Postgres, including
the cross-user attempt. It has **not** been run against the cloud project — the
migration is not yet pushed there, and there are no real drives to delete yet.
