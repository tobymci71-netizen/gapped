-- ─────────────────────────────────────────────────────────────────────────────
-- Records which IMU convention a drive was captured under.
--
-- Until this migration, Fix.accelX/Y/Z held TOTAL proper acceleration: the
-- vehicle's motion plus the 1 g the device is permanently resisting. Every
-- G-force figure derived from it — client-side and again server-side in
-- verify-drive, which re-derives from the same stored columns — was inflated.
--
-- ── WHY THIS IS A FLAG AND NOT A DATA MIGRATION ─────────────────────────────
-- The offset cannot be removed after the fact. G-force is stored as three
-- components and reduced to a vector magnitude, and gravity enters as a vector
-- whose DIRECTION depends on how the phone happened to be sitting:
--
--     |a_total| = |a_user + g|,  which is NOT |a_user| + |g|
--
-- Subtracting 1.0 from the magnitude is only correct when the car accelerates
-- exactly parallel to gravity, which never happens. The gravity direction was
-- never stored, so a_user is not recoverable. Any migration that "corrected"
-- these numbers would be inventing them — worse than leaving them visibly
-- wrong, because the result would look trustworthy.
--
-- So old drives keep their numbers and are labelled. Anything comparing G
-- across drives can exclude the old convention; nothing has to guess.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────────
-- The app has never been released, so in practice this marks development and
-- test data only. It is added anyway because the cost is one column now and
-- an unanswerable question later.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'drives'
      and column_name = 'imu_convention'
  ) then
    -- New rows are user_acceleration: any client able to write them is running
    -- a build whose recorder uses DeviceMotion.acceleration.
    alter table drives
      add column imu_convention text not null default 'user_acceleration'
      check (imu_convention in ('user_acceleration', 'total_acceleration'));

    -- Everything that already exists predates the fix by definition — the
    -- column did not exist when those rows were written.
    update drives set imu_convention = 'total_acceleration';
  end if;
end $$;

comment on column drives.imu_convention is
  'Which acceleration convention accel_x/y/z were captured under. user_acceleration = gravity removed (~0 at rest, correct). total_acceleration = gravity included (~1 g at rest, inflated, NOT recoverable — see migration 0012).';
