# Gapped

GPS drive tracker with a leaderboard people can actually believe. Competitor to TripRank and
Open Road; the thesis, phases, and gates live in `BUILD-PROMPT.md` (on the desktop, alongside
`competitor-feature-spec.md` and `triprank-ui-teardown.md`).

**Brand:** Gapped · **Bundle ID:** `app.gapped.drive` (both platforms — `com.gapped` is taken by
GAPPED LTD) · **Store title:** "Gapped — Verified Speed Ranks" (differentiation required by
Guideline 4.1; brand stays "Gapped" everywhere else).

## Stack

Expo SDK 57 (React Native 0.86, TypeScript strict) · expo-router · Supabase (Postgres + PostGIS)
· expo-location / expo-sensors / expo-sqlite · zustand · RevenueCat (later) · Sentry + PostHog
(env-gated) · Jest.

## Status

### Phase 1 — Foundation: code complete, gate pending device installs
- [x] Expo project, TypeScript strict, absolute imports (`@/`)
- [x] Schema as SQL migration with RLS on every table (`supabase/migrations/`)
- [x] Anonymous-first auth (`src/lib/supabase.ts` — signs in anonymously when env keys exist;
      app is fully usable with no backend at all)
- [x] "Acid" design tokens + `<Button>`, `<Card>`, `<Stat>`, `<Screen>` primitives
- [x] Tab navigation: **Drive · Board · Garage · You**
- [x] Sentry + PostHog wired, env-gated (`src/lib/observability.ts`)
- [x] **Backend runs and is proven end-to-end** against a local Supabase stack — see
      [Backend](#backend) below
- [ ] **Needs your accounts:** a cloud Supabase project (`supabase link && supabase db push`),
      EAS build profiles + real-device installs — the Phase 1 gate can only pass on hardware

### Phase 2 — Recording core: logic + tests done, device validation pending
- [x] **Crash-recoverable WAL** (`src/drive/wal.ts`): every fix hits SQLite before UI state;
      cold-start recovery finalises interrupted drives
- [x] Auto drive detection state machine (`src/drive/engine.ts`): start on >15 km/h held 30 s,
      end after 3 min stationary; run-up fixes included; adaptive IMU rate 1↔10 Hz
- [x] Accuracy gating (discard >20 m), median-of-3 speed smoothing, SI-internal units with a
      single render-time conversion layer (`src/drive/units.ts`)
- [x] 0-60 detection with published methodology: standstill ≥2 s → monotonic pull, 1-ft rollout,
      interpolated crossing; returns null rather than fabricating (`src/drive/stats.ts`)
- [x] Peak **and** sustained (2 s rolling window) G-force
- [x] Plausibility envelope preview (`src/drive/plausibility.ts`): mock provider, teleports,
      sustained >1.5 g, zero-jitter accuracy, device-vs-positional speed agreement — every
      failure carries a human-readable reason (never silently drop a run)
- [x] 62 unit tests on fixture traces (clean cruise, 0-60 pull, lift-off pull, teleport spoof,
      simulator signature, mock provider, glitch fix; SHA-256 FIPS vectors, Google polyline vector)
- [x] Background recording task (`expo-task-manager` + `startLocationUpdatesAsync`, automotive
      activity type, foreground-service notification) — unified fix stream with dedupe
- [ ] **Needs hardware:** kill-mid-drive test, battery measurement, Mapbox speed-limit badge
      (needs a Mapbox token + dev build — `@rnmapbox/maps` doesn't run in Expo Go)

### Ahead-of-phase groundwork (code + tests done, needs deploy/device)
- [x] **Phase 3:** `supabase/functions/verify-drive` Edge Function — server-side re-derivation
      from raw fixes, plausibility envelope, verification state, leaderboard writes. Runs, and
      is checked end-to-end by `npm run verify:roundtrip`. Shared maths generated from `src/`
      via `npm run build:edge` (src stays source of truth).
      Attestation (App Attest / Play Integrity) still to slot in — needs store credentials.
- [x] **Phase 4:** vehicle-class bracket derivation (`src/vehicles/brackets.ts`, drivetrain ×
      power-to-weight tier × stock/modified) + NHTSA vPIC catalogue client
- [x] **Phase 6 (partial):** privacy layer — salted deterministic 1.0–1.7 mi route trimming,
      privacy zones with 200–800 m centre offsets, polyline codec; GPX/CSV export + share from
      the drive detail screen
- [x] **Phase 7 (partial):** published free-vs-Pro matrix screen (`/plans`) — table stakes #13
- [x] Supabase sync layer: anonymous-first upload of finalized drives, server verify invocation,
      offline-tolerant retry on next launch
- [x] `eas.json` build profiles (dev / preview / production)

- [x] **Phase 5:** share cards — `<ShareCard>` captured with view-shot and handed to the share
      sheet from the drive detail screen. Shows the privacy-trimmed route, and wears the verified
      badge only when the server has actually said so.
- [x] **Phase 6:** friends — `add_friend` / `remove_friend` / `list_friends`, a friends screen,
      and the friends board wired to them. Following is one-way by design: adding someone changes
      your board and never theirs, so there is nothing to accept and no way onto a stranger's
      screen.

### Remaining: Phase 3 IMU cross-correlation, Phase 7 (RevenueCat), Phase 8 (polish), plus
### attestation enforcement once validated on hardware — gates in order

## Run it

```sh
npm install --legacy-peer-deps   # peer conflict deep in expo-router's optional @expo/ui chain
npm run typecheck                # tsc --noEmit
npm test                         # 218 tests, all maths
npx expo start                   # Expo Go: everything except background recording works
```

## Backend

The whole stack runs locally — no cloud account needed, just Docker.

```sh
cp .env.example .env             # then paste in the URL + anon key db:start prints
npm run db:start                 # Postgres + PostGIS + auth, migrations applied
npm run functions:serve          # edge functions, in a second terminal
npm run verify:roundtrip         # 45 assertions over the full path
npm run test:edge                # 19 attestation tests (Deno)
```

`npm run verify:roundtrip` is the thing to run after touching the schema, an Edge Function or
`sync.ts`. It uploads the `zeroSixtyPull` fixture as a real drive and asserts the **server**
independently recomputes its known ground truth (30 m/s top speed, 0-60 in 5.02 s, 13,590 m),
then checks RLS isolation, the privacy invariant, board ranking, idempotent re-verification,
authorisation, attestation recording, friends and account deletion. Unit tests cannot reach any
of that — it needs real Postgres.

Ports are 544xx rather than the CLI defaults, so this stack coexists with another project's.

For a cloud project: `supabase link --project-ref <ref>`, `supabase db push`,
`supabase functions deploy verify-drive`, and set the `TRIM_SALT` secret.

### What the first real run against Postgres found

`0001_init.sql` had never been applied anywhere. Running it turned up five faults that no amount
of reading would have shown, each fixed in a migration that explains itself:

- **Nothing worked at all.** RLS policies were written but table privileges never granted, and
  Supabase's default ACL gives `anon`/`authenticated`/`service_role` no SELECT or INSERT on
  `public`. Every call failed `42501` before a policy was consulted.
- **`route_full` was readable by any client.** RLS is row-level, so the select policy on `drives`
  exposed the untrimmed route — the exact data the privacy layer exists to withhold. It now lives
  in its own grantless table, which makes the invariant structural rather than aspirational.
- **Server-side verification computed garbage.** PostgREST returns `geography` as WKB hex;
  `verify-drive` parsed it with a WKT regex, so every fix silently became (0, 0). It would have
  re-derived every drive from the Gulf of Guinea and written the result to the boards as
  *verified*. lat/lon are now stored directly and `point` is generated from them.
- **The first sync could only ever fail.** Anonymous sign-in created no `profiles` row, so
  `drives.profile_id` violated its foreign key. A trigger now creates it at signup.
- **Account deletion could never work.** `profiles.id references auth.users` had no `on delete
  cascade`, so deleting the user always rolled back.

Boards had three more: the country board never filtered by country, one driver could occupy every
row, and the friends board queried a scope nothing writes. All three are now one `board_top` RPC.

## Attestation

Plausibility asks "could a car have done this?". Attestation asks the question underneath it —
"did this come from a real, unmodified app on a real device?" — and without it every check in
`plausibility.ts` is applied to numbers an attacker chose.

`supabase/functions/_server/attestation.ts` implements both platforms: App Attest (hardware key,
Apple-attested, asserted per upload with a replay-proof counter) and Play Integrity (per-upload
token decoded by Google). The drive id is the challenge on both, so an attestation cannot be
lifted from one upload and reused on another. Verdicts are recorded on the drive with a stated
reason; **enforcement is a separate flag** (`ATTESTATION_REQUIRED`).

That separation is deliberate. The per-upload assertion path is tested end-to-end against a real
generated P-256 key, and Play Integrity's verdict logic is fully covered — but the one-off
registration path needs a certificate chain only Apple can issue, so only its failure modes are
tested. A verifier that wrongly rejects real hardware would quietly empty the boards, so it ships
annotating, and gates only once it has been seen to pass on a real device.

Two things it needs from you:

- **The Apple root CA is deliberately not embedded.** A root certificate typed from memory is a
  trust anchor nobody verified. Install it from Apple directly:
  `curl -o root.pem https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem`
  then `supabase secrets set APPLE_APP_ATTEST_ROOT_CA="$(cat root.pem)"`. Absent, iOS attestation
  fails closed with a configuration reason rather than degrading to "passed".
- **A native module and a dev build.** Neither API exists in the Expo SDK, so
  `src/lib/attestation.ts` talks to an optional native module (e.g. `expo-app-integrity`) and
  returns null without it. Absent is a first-class outcome: the drive still records, still
  uploads, and is recorded as `attestation: 'none'` — unattested, not fraudulent.

Secrets: `APPLE_APP_ID`, `APPLE_APP_ATTEST_ROOT_CA`, `ANDROID_PACKAGE_NAME`,
`PLAY_INTEGRITY_SERVICE_ACCOUNT`, `TRIM_SALT`, and `ATTESTATION_REQUIRED` when you are ready.

Onboarding (7 steps, vs TripRank's 29): unit → country → location priming → vehicle type →
make/model → username → safety consent → straight into the Drive tab. No paywall exists yet;
when it does, it comes **after** the first recorded drive.

## Before launch (from the spec's naming constraints)

- Register `gapped.app` / `gapped.co` / `gappedapp.com` / `joingapped.com` — unregistered as of
  2026-07-21 and flagged perishable.
- One hour with an IP solicitor re: the open GAPPED Class 9/42 trademark position.
