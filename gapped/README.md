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
- [x] Schema as SQL migration with RLS on every table (`supabase/migrations/0001_init.sql`)
- [x] Anonymous-first auth scaffolding (`src/lib/supabase.ts` — signs in anonymously when env
      keys exist; app is fully usable with no backend at all)
- [x] "Acid" design tokens + `<Button>`, `<Card>`, `<Stat>`, `<Screen>` primitives
- [x] Tab navigation: **Drive · Board · Garage · You**
- [x] Sentry + PostHog wired, env-gated (`src/lib/observability.ts`)
- [ ] **Needs your accounts:** Supabase project (apply the migration, fill `.env`), EAS build
      profiles + real-device installs — the Phase 1 gate can only pass on hardware

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
- [x] 36 unit tests on fixture traces (clean cruise, 0-60 pull, lift-off pull, teleport spoof,
      simulator signature, mock provider, glitch fix)
- [ ] **Needs hardware:** background task wiring (`expo-task-manager` + `startLocationUpdatesAsync`
      with `activityType: AutomotiveNavigation`), kill-mid-drive test, battery measurement,
      Mapbox speed-limit badge (needs a Mapbox token + dev build — `@rnmapbox/maps` doesn't run
      in Expo Go)

### Phases 3–8: not started (by design — one phase per session, gates in order)

## Run it

```sh
npm install --legacy-peer-deps   # peer conflict deep in expo-router's optional @expo/ui chain
npm run typecheck                # tsc --noEmit
npm test                         # 36 tests, all maths
npx expo start                   # Expo Go: everything except background recording works
```

Onboarding (7 steps, vs TripRank's 29): unit → country → location priming → vehicle type →
make/model → username → safety consent → straight into the Drive tab. No paywall exists yet;
when it does, it comes **after** the first recorded drive.

## Before launch (from the spec's naming constraints)

- Register `gapped.app` / `gapped.co` / `gappedapp.com` / `joingapped.com` — unregistered as of
  2026-07-21 and flagged perishable.
- One hour with an IP solicitor re: the open GAPPED Class 9/42 trademark position.
