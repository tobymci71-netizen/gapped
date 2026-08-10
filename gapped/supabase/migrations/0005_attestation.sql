-- Gapped — device attestation (spec Phase 3, item 5).
--
-- Plausibility answers "could a car have done this?". Attestation answers the
-- question underneath it: "did this come from a real, unmodified app on a real
-- device?". Without it, the whole envelope is advisory — a rooted phone or a
-- rebuilt binary can feed the API any fix array it likes, and every check in
-- plausibility.ts is being applied to numbers the attacker chose.
--
-- Two platforms, two mechanisms, one verdict:
--   iOS      App Attest    — hardware key, attested by Apple, asserts per call
--   Android  Play Integrity — signed verdict token, verified against Google
--
-- Enforcement is deliberately a separate decision from verification: see
-- ATTESTATION_REQUIRED in the verify-drive function. A subtly wrong verifier
-- that rejects real drivers is worse than one that only annotates, so this
-- ships recording the verdict, and enforcing is a flag flip once the verifier
-- has been validated against real hardware.

-- ── registered device keys ──────────────────────────────────────────────────
-- One row per attested key. iOS registers a key once (attestation), then signs
-- each upload with it (assertion); sign_count is the hardware counter and must
-- strictly increase, which is what stops an assertion being replayed.
create table device_attestations (
  key_id       text primary key,
  profile_id   uuid not null references profiles on delete cascade,
  platform     text not null check (platform in ('ios', 'android')),
  -- SPKI DER of the attested P-256 public key (iOS only; Play Integrity is
  -- stateless and verifies a fresh token per request).
  public_key   bytea,
  sign_count   bigint not null default 0,
  environment  text not null default 'production'
                 check (environment in ('production', 'development')),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index on device_attestations (profile_id);

alter table device_attestations enable row level security;
-- No policies and no grants: keys are registered and read only by the
-- attest-device and verify-drive functions, under the service role. A client
-- that could write here could register a key it made up.
grant select, insert, update, delete on device_attestations to service_role;

-- ── per-drive attestation outcome ───────────────────────────────────────────
alter table drives
  add column attestation text not null default 'none'
    check (attestation in ('none', 'passed', 'failed', 'unsupported')),
  add column attestation_meta jsonb not null default '{}';

comment on column drives.attestation is
  'Set only by verify-drive. none = no token supplied; unsupported = platform cannot attest (e.g. simulator, old OS); failed = a token was supplied and did not verify.';

-- ── stop the client writing server-owned columns ────────────────────────────
-- 0002 granted INSERT on the whole `drives` table, so a client could supply
-- `route`, `route_polyline` or `verification_meta` on insert — and now
-- `attestation` too, which would let it mark its own drive attested. The RLS
-- policy pinned `verification` but could not pin the rest.
--
-- Column-level INSERT grants are the precise tool: the client may only name
-- the advisory columns it is supposed to send. (Column grants on INSERT are
-- safe here — unlike SELECT, there is no `insert *` to break.)
revoke insert on drives from authenticated;
grant insert (
  id, profile_id, vehicle_id, started_at, ended_at,
  distance_m, duration_s, max_speed_ms, avg_speed_ms,
  max_g, avg_g, zero_to_60_s, verification
) on drives to authenticated;

-- Belt and braces: even within the granted columns, verification must start
-- at 'pending'. Attestation state has no client-writable path at all now.
drop policy if exists drives_insert on drives;
create policy drives_insert on drives for insert
  with check (auth.uid() = profile_id and verification = 'pending');
