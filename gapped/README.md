# Gapped

GPS drive tracker with a leaderboard people can actually believe. Competitor to TripRank and
Open Road; the thesis, phases, and gates live in `BUILD-PROMPT.md` (on the desktop, alongside
`competitor-feature-spec.md` and `triprank-ui-teardown.md`).

**Brand:** Gapped · **Bundle ID:** iOS `com.tobym.gapped`, Android `app.gapped.drive` (`com.gapped` is taken by
GAPPED LTD, and `app.gapped.drive` turned out to be registered by another Apple developer
team) · **Store name:** "Gapped" (fallback "Gapped: Drive Tracker" if the name is taken; never
speed wording, see `docs/APP_STORE_LISTING.md`) · **Owner:** Toby Mcintosh, Guernsey.

## Stack

Expo SDK 57 (React Native 0.86, TypeScript strict) · expo-router · Supabase (Postgres + PostGIS,
Deno edge functions) · expo-location / expo-sensors / expo-sqlite · zustand · Reanimated · Jest.
Sentry and PostHog are installed but **not configured for release**: with no keys neither
initialises, and the privacy policy says no crash or analytics data is collected
(`src/lib/observability.ts`). RevenueCat is not installed; there are no purchases in v1.

## v1.0.0: the first App Store release

Version 1.0.0, build 5. What the release adds on top of the phases below, and where it is written
down:

- **Top speed with safeguards.** Ranks opens on Distance. A top speed above the highest speed
  limit in the driver's country (`supabase/functions/_shared/speedLimits.ts`, 130 km/h where there
  is no general limit) is verified but not ranked publicly: it stays in the driver's own history,
  marked "not ranked". "Fastest in country" is retired (migration 0020). Nothing prompts, rewards
  or notifies during a drive (`NO_IN_DRIVE_SPEED_NUDGES`).
- **Moderation (App Review 1.2).** Server-side username filter, Report driver, Hide driver,
  Terms of Use accepted in onboarding with an 18+ and driving-licence confirmation, and the
  owner's 24-hour review (`docs/MODERATION.md`, migrations 0019 and 0020).
- **Privacy.** Board dates cut to the day, direct reads of `leaderboard_entries` revoked,
  achievements own-row only (0020); raw GPS points and the untrimmed route purged 90 days after
  the drive, abandoned empty accounts after 30 days, rate-limit rows after 2 days (0021). In-app
  Delete drive and Delete account; Account ID in Settings.
- **No Gapped Pro.** `SHOW_PRO` is false (`src/config/flags.ts`): nothing mentions Pro, plans or
  prices, `/plans` is unreachable, and every account has every feature. The entitlement code is
  kept behind the flag.
- **Public pages** on GitHub Pages (`src/config/links.ts`), built from `docs/PRIVACY.md`,
  `docs/TERMS.md` and `site/` by `scripts/build-legal-pages.mjs` and
  `scripts/build-acknowledgements.mjs`. The app links only to these pages and contains no email
  address.

The owner's launch checklist is `docs/LAUNCH.md`. The App Store material is in
`docs/APP_STORE_LISTING.md`, `docs/APP_REVIEW_NOTES.md` and `docs/APP_PRIVACY_LABELS.md`; the
data protection assessment is `docs/DPIA.md`.

## Status by phase

### Phase 1 — Foundation
- [x] Expo project, TypeScript strict, absolute imports (`@/`)
- [x] Schema as SQL migrations with RLS on every table (`supabase/migrations/`)
- [x] Anonymous-first auth (`src/lib/supabase.ts` — signs in anonymously when env keys exist;
      the app works fully with no backend at all)
- [x] "Acid" design tokens + `<Button>`, `<Card>`, `<Stat>`, `<Screen>` primitives
- [x] Tab navigation: **Driving · Ranks · Garage · You**
- [x] Backend proven end to end against a local Supabase stack — see [Backend](#backend)
- [x] Cloud Supabase project and EAS builds; TestFlight builds installed on hardware

### Phase 2 — Recording core
- [x] **Crash-recoverable WAL** (`src/drive/wal.ts`): every fix hits SQLite before UI state;
      cold-start recovery finalises interrupted drives
- [x] Auto drive detection state machine (`src/drive/engine.ts`): start on >15 km/h held 30 s,
      end after 3 min stationary; run-up fixes included; adaptive IMU rate 1↔10 Hz. Detection
      runs only while the app is open; positions read for it stay in memory unless a drive starts
- [x] Accuracy gating (discard >20 m), median-of-3 speed smoothing, SI-internal units with a
      single render-time conversion layer (`src/drive/units.ts`)
- [x] 0-60 detection with published methodology: standstill ≥2 s → monotonic pull, 1-ft rollout,
      interpolated crossing; returns null rather than fabricating (`src/drive/stats.ts`)
- [x] Peak **and** sustained (2 s rolling window) G-force, gravity removed
      (`DeviceMotion.acceleration`, migration 0012)
- [x] Plausibility envelope (`src/drive/plausibility.ts`): mock provider, teleports, sustained
      >1.5 g, zero-jitter accuracy, device-vs-positional speed agreement — every failure carries
      a human-readable reason (never silently drop a run)
- [x] Background recording task (`expo-task-manager` + `startLocationUpdatesAsync`, automotive
      activity type, background location indicator) — started and stopped with each drive
- [ ] Mapbox speed-limit badge (needs a Mapbox token + dev build)

### Phase 3 — Server verification
- [x] `supabase/functions/verify-drive`: server-side re-derivation from raw fixes (read in
      pages; PostgREST returns at most 1,000 rows per request), plausibility envelope,
      verification state, leaderboard writes, the national speed ceiling. Shared maths generated
      from `src/` via `npm run build:edge` (src stays source of truth).
- [x] Attestation verifier (App Attest / Play Integrity) on the server. **Not active in v1:** the
      app has no native attestation module, so every drive is recorded as `attestation: 'none'`
      and nothing about the device is sent. See [Attestation](#attestation).

### Phase 4 — Vehicles and classes
- [x] Vehicle-class brackets (`src/vehicles/brackets.ts`, drivetrain × power-to-weight tier ×
      stock/modified); `board_top` takes a bracket and `board_brackets` lists only classes with
      drivers in them.
- [x] Specs come from a VIN decoded server-side by NHTSA vPIC (`decode-vin`) — never from the
      client, because drivetrain/power/weight choose the class. The VIN itself is not stored.
      **Caveat found in live testing:** vPIC reliably returns power but frequently has no
      drivetrain or curb weight, so most VINs still land in the open class.

### Phase 5 — Sharing
- [x] Share cards — `<ShareCard>` captured with view-shot and handed to the share sheet from the
      drive detail screen. Shows the privacy-trimmed route, and wears the verified badge only
      when the server has said so.

### Phase 6 — Privacy and friends
- [x] Route trimming: salted, deterministic 1.0–1.7 mi removed from each end of anything shared
      or stored for display; the untrimmed route lives in a table no client can read
      (`drive_routes_private`). **There are no privacy zones in the app:** the zone maths exists
      in `src/drive/privacy.ts`, but nothing lets anyone draw one, and no copy may claim them.
- [x] GPX/CSV export from the drive detail screen, from the phone's own copy, for every account.
- [x] Friends — `add_friend` / `remove_friend` / `list_friends`, a friends screen and the friends
      board. Following is one-way by design: adding someone changes your board and never theirs.

### Phase 7 — Plans (built, hidden in v1)
- [x] Published Free-vs-Pro matrix (`src/config/plans.ts`), the `/plans` screen and the
      entitlement rules (`src/lib/entitlements.ts`) — see [Plans](#plans). Hidden while
      `SHOW_PRO` is false; nothing is locked while `PRO_LIMITS_ENFORCED` is false.
- [ ] RevenueCat and real purchases.

### Achievements
- [x] Granted only by verify-drive, off verified drives, unique per kind:
      `first_verified_run`, `ten_verified_runs`, `first_measured_launch`. Readable only by their
      owner. `country_number_one` ("Fastest in country") was retired in v1 and its rows deleted.

### Remaining
Phase 3 IMU cross-correlation, Phase 7 purchases, Phase 8 polish, attestation once validated on
hardware, and `ROADMAP.md`.

## Run it

```sh
npm install --legacy-peer-deps   # peer conflict deep in expo-router's optional @expo/ui chain
npm run typecheck                # tsc --noEmit
npm test                         # Jest: maths, onboarding rules, sync, config
npm run lint
node --test site/test/*.test.mjs # the public pages' build, and the App Store copy limits
npx expo start                   # Expo Go: everything except background recording works
```

### Native modules: rebuild the dev client

Onboarding v2 added two native modules, **`expo-audio`** (the splash sting) and
**`expo-image-picker`** (the car photo step, which keeps the photo on the phone). A development
build made before them does not contain them, and JavaScript cannot add native code, so make a
new one before testing on a device or simulator:

```sh
npx expo prebuild --clean        # regenerate ios/ and android/ from app.json
npx expo run:ios                 # or: eas build --profile development
```

On an old dev client the app still runs: both are loaded only after
`requireOptionalNativeModule` confirms they exist. Their config plugins in `app.json` are set so
neither adds more than it needs: no microphone or camera usage strings, no `RECORD_AUDIO` or
`CAMERA` on Android, no background audio mode, and the only new Info.plist string is the
photo-library one. The sting plays through iOS's `.ambient` session: the silent switch mutes it
and it never pauses the person's music.

`eslint.config.js` downgrades three React Compiler rules to warnings rather than switching them
off, with the reasoning written down there: they fire on Reanimated worklet assignments (which
the compiler cannot model) and on deliberate effect resets like seeding the elapsed clock.

## Native config (iOS)

`ios/` and `android/` are **gitignored and regenerable** — this is Continuous Native Generation.
`app.json` is the source of truth; the Xcode project is a build artifact. If you need to change
the bundle id, a permission string or a capability, change it in `app.json`, not in Xcode, or the
next prebuild silently discards your edit.

```sh
npx expo prebuild --platform ios --clean   # regenerate from app.json
npx expo run:ios --device                  # build to a plugged-in iPhone
```

Deployment target is **iOS 16.4** (set by the SDK 57 template, not by us).

### ⚠️ Do NOT rewrite NSLocalNetworkUsageDescription

It sits in the generated `Info.plist` reading *"Expo Dev Launcher uses the local network to
discover and connect to development servers running on your computer."* That looks exactly like
sloppy boilerplate to tidy up before shipping. **Leaving it alone is what keeps it out of release
builds. Rewriting it is what ships it.**

`expo-dev-launcher`'s config plugin injects a build phase into the Xcode project called
`[Expo Dev Launcher] Strip Local Network Keys for Release`. For any `CONFIGURATION != Debug` it
deletes `NSLocalNetworkUsageDescription` and `_expo._tcp` from `NSBonjourServices` out of the
built product — but the deletion is guarded:

```sh
DESC=$(/usr/libexec/PlistBuddy -c "Print :NSLocalNetworkUsageDescription" "$PLIST_PATH")
if echo "$DESC" | grep -q "Expo Dev Launcher"; then   # ← only strips its OWN default text
  /usr/libexec/PlistBuddy -c "Delete :NSLocalNetworkUsageDescription" "$PLIST_PATH"
fi
```

Replace the string with your own copy and that `grep` stops matching, so the key survives into
the App Store build — declaring a local-network permission the app never uses, which is the exact
opposite of what "cleaning it up" was meant to achieve. The plugin also only sets the key
`if (!config.modResults.NSLocalNetworkUsageDescription)`, so an `app.json` override *does* win —
it just wins in the wrong direction.

Verify the strip still works before a release: build with `-configuration Release` and check the
key is absent from the built `.app`'s `Info.plist`.

### Other deliberate Info.plist choices

- **Location and motion strings are set through `expo-location`'s plugin options** in `app.json`
  (`locationWhenInUsePermission`, `locationAlwaysAndWhenInUsePermission`,
  `locationAlwaysPermission`, `motionUsagePermission`), so the plugin cannot put its generic copy
  back. Each says what the app does: location only during a drive, uploaded and verified, routes
  never shown to other drivers.
- **`UIBackgroundModes` is `["location"]` and nothing else.** `expo-task-manager`'s plugin adds
  `fetch` on every build; `plugins/withLocationOnlyBackgroundModes.js` takes it back out, and
  `src/lib/__tests__/app-config.test.ts` pins the list. Gapped registers no fetch task, and App
  Review asks what every declared mode is for.
- **`RCTRootViewBackgroundColor` comes from `expo-system-ui`.** `ios.backgroundColor` in `app.json`
  is inert without that package installed; prebuild warns if it is missing.
- **No `NSFaceIDUsageDescription`.** It used to appear because `expo-secure-store` was installed
  but never imported. Both are gone. Don't re-add the package without a real use.

## Release configuration (iOS)

### Privacy manifest and App Privacy

`expo.ios.privacyManifests` in `app.json` declares the required-reason APIs and the collected
data types. **The collected data types must match `docs/APP_PRIVACY_LABELS.md`**, which is the
App Store Connect answer sheet and explains each choice against Apple's definitions. With no
Sentry or PostHog keys there is no crash, performance or product-interaction data to declare.

It is declared at app level even where a dependency might ship its own: no pod in this project
ships a `PrivacyInfo.xcprivacy` (only the React Native bundles do), and Apple does not reliably
read manifests embedded in static CocoaPods dependencies.

Three required-reason APIs are declared, each tied to a real call site:

| Category | Reason | Why |
| --- | --- | --- |
| `FileTimestamp` | `C617.1` | expo-sqlite WAL files, AsyncStorage's file store and drive exports all stat files inside the app container |
| `UserDefaults` | `CA92.1` | expo-constants and React Native read their own defaults |
| `SystemBootTime` | `35F9.1` | elapsed-time measurement only — RN/Reanimated frame timing |

**`DiskSpace` is deliberately NOT declared.** No call site was found. If App Store Connect
returns **ITMS-91053** naming `NSPrivacyAccessedAPICategoryDiskSpace` on upload, add it with
`E174.1` ("check disk space to write files").

### Export compliance

`ITSAppUsesNonExemptEncryption: false`. The app's only cryptography is TLS provided by the
operating system and SHA-256 hashing (a digest, not encryption). Nothing proprietary and nothing
non-exempt, so the questionnaire is skipped on every upload.

### Versioning

`expo.version` is the user-facing version (`1.0.0`) and is bumped by hand. `eas.json` sets
`appVersionSource: "remote"` with `autoIncrement` on `preview` and `production`, so EAS keeps its
own build counter; `ios.buildNumber` in `app.json` records the intended build (`5`). Check EAS's
counter with `eas build:version:get -p ios` before a release build.

### Release environment

`npm run check:release` (and the EAS pre-install hook on the production profile,
`scripts/check-build-env.mjs`) stops a release build that would ship without the production
backend, or with a Sentry or PostHog key set. Turning either on means changing the privacy
policy, `docs/APP_PRIVACY_LABELS.md` and the privacy manifest first.

### Known build warning

`eas build` warns that the `preview`/`production` profiles specify a channel while `expo-updates`
is not installed. Channels are inert without it. Left in place deliberately so the profiles are
already correct if OTA updates are adopted later.

## Public pages

`src/config/links.ts` holds every public URL the app opens: privacy, terms, support and
acknowledgements on GitHub Pages, plus the App Store listing. The brand's `.app` domain is not
used anywhere (it is a password-protected WordPress, and App Review rejects a privacy link that
lands on a login page); `site/test/listing.test.mjs` fails if a document names it.

```sh
node scripts/build-legal-pages.mjs && node scripts/build-acknowledgements.mjs   # → site/dist/
node scripts/build-legal-pages.mjs --draft                                      # preview
```

The contact address lives only in `site/site.config.json` and is filled in at build time; the
build fails while it is empty unless `--draft` is passed. Publishing to the `gh-pages` branch is
step 3 of `docs/LAUNCH.md`.

## Backend

The whole stack runs locally — no cloud account needed, just Docker.

```sh
cp .env.example .env             # then paste in the URL + anon key db:start prints
npm run db:start                 # Postgres + PostGIS + auth, migrations applied
npm run functions:serve          # edge functions, in a second terminal
npm run verify:roundtrip         # the full path, against the LOCAL stack
npm run test:db                  # pgTAP: RLS, grants, deletion, moderation, board privacy
npm run test:edge                # attestation tests (Deno)
npm run verify:vin               # decode-vin against live NHTSA (needs network)
```

`verify:vin` is separate from the round-trip on purpose: it depends on a third-party API being
up, and a network wobble should not turn the main check red.

`npm run verify:roundtrip` is the thing to run after touching the schema, an Edge Function or
`sync.ts`. It uploads the `zeroSixtyPull` fixture as a real drive and asserts the **server**
independently recomputes its known ground truth (30 m/s top speed, 0-60 in 5.02 s, 13,590 m),
then checks RLS isolation, the privacy invariant, board ranking, idempotent re-verification,
authorisation, friends, the onboarding counts, garage vehicles and answers, and account
deletion. Unit tests cannot reach any of that — it needs real Postgres.

**Never run `verify:roundtrip` against the production project.** It creates accounts and drives,
and they would appear on the live boards. It refuses any host but localhost unless
`ALLOW_REMOTE=1` is set; set that for staging (`docs/STAGING.md`) only.

Ports are 544xx rather than the CLI defaults, so this stack coexists with another project's.

### Cloud

Live project: **`gapped`** — ref `esyffuzecjvgddidfeph`, region `eu-west-2` (London), org "BR Max".
It is production: TestFlight builds point at it, and the privacy policy names London as where data
is stored. Which migrations it has is whatever `supabase migration list --linked` says; check
before relying on a feature. v1 needs every migration up to `0021`, the three edge functions
deployed, `TRIM_SALT` set, anonymous sign-ins on, and the retention jobs scheduled (see
`docs/LAUNCH.md`, step 5).

The database password must not live in the repository. `EXPO_PUBLIC_*` values are inlined into
the app bundle, so nothing secret can live there either. The anon key is a public client key; RLS
is the security boundary, not its secrecy.

Redeploying: `supabase db push`, `supabase functions deploy verify-drive attest-device decode-vin`.

### Why 0007 exists — "the default ACL" is not one thing

Everything above passed locally and then failed once, on the real project: reading
`drive_routes_private` returned an empty list instead of "permission denied". Empty means SELECT
*was* granted and RLS filtered the rows; denied means there is no privilege path at all.

This machine's CLI creates tables in `public` with almost nothing granted to anon/authenticated.
The cloud project grants them full INSERT/SELECT/UPDATE/DELETE. So 0002 and 0005 were written
against one default and deployed onto the other, and the two tables that were supposed to have no
client privileges — the untrimmed routes and the attested device keys — arrived with every one.

Nothing was exposed: both have RLS on with zero policies, and RLS is default-deny. But that is
protection by accident, one stray policy away from world-writable. 0007 revokes everything from
the client roles and grants back exactly the intended set, so the privilege state is identical on
any project regardless of its defaults. 0018 does the same for functions.

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
  `verify-drive` parsed it with a WKT regex, so every fix silently became (0, 0). lat/lon are now
  stored directly and `point` is generated from them.
- **The first sync could only ever fail.** Anonymous sign-in created no `profiles` row, so
  `drives.profile_id` violated its foreign key. A trigger now creates it at signup.
- **Account deletion could never work.** `profiles.id references auth.users` had no `on delete
  cascade`, so deleting the user always rolled back.

Boards had three more: the country board never filtered by country, one driver could occupy every
row, and the friends board queried a scope nothing writes. All three are now one `board_top` RPC.

## Attestation

Plausibility asks "could a car have done this?". Attestation asks the question underneath it —
"did this come from a real, unmodified app on a real device?".

`supabase/functions/_server/attestation.ts` implements both platforms: App Attest (hardware key,
Apple-attested, asserted per upload with a replay-proof counter) and Play Integrity (per-upload
token decoded by Google). The drive id is the challenge on both. Verdicts are recorded on the
drive with a stated reason; **enforcement is a separate flag** (`ATTESTATION_REQUIRED`).

**It is not active in v1.** Neither API exists in the Expo SDK, so `src/lib/attestation.ts` talks
to an optional native module (e.g. `expo-app-integrity`) that is not installed, and returns null.
Every drive is therefore recorded as `attestation: 'none'` — unattested, not fraudulent — and no
device identifier leaves the phone, which is what the privacy policy and labels say. Turning it on
needs the native module, a dev build, the server secrets, and changes to
`docs/APP_PRIVACY_LABELS.md` (Device ID) and the privacy policy first.

Two things it will need:

- **The Apple root CA is deliberately not embedded.** Install it from Apple directly:
  `curl -o root.pem https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem`
  then `supabase secrets set APPLE_APP_ATTEST_ROOT_CA="$(cat root.pem)"`. Absent, iOS attestation
  fails closed with a configuration reason rather than degrading to "passed".
- **A native module and a dev build.** Absent is a first-class outcome: the drive still records,
  still uploads, and is recorded as unattested.

Secrets: `APPLE_APP_ID`, `APPLE_APP_ATTEST_ROOT_CA`, `ANDROID_PACKAGE_NAME`,
`PLAY_INTEGRITY_SERVICE_ACCOUNT`, `TRIM_SALT`, and `ATTESTATION_REQUIRED` when you are ready.

## Onboarding

**`docs/ONBOARDING.md` is the contract**: every step, its route, copy, look, sound and data, and the
rules that override the competitor flow it was modelled on (no invented numbers, no tracking
prompt, the safety acknowledgement with 18+ and the Terms, nothing about Pro in v1). In short: a
splash with one sound and a carousel, then the steps under a progress bar — ride, make proof,
garage, photo, unit, country + proof, location, focus, focus proof, username, trust, attribution,
safety — then a staged setup beat.

- **Order lives in one place**, `src/onboarding/flow.ts`. Screens call `useOnboardingAdvance`, never
  name their successor; the flags remove steps there and the bar renumbers itself.
- **Proof screens only print server numbers.** `make_popularity` and `country_activity`
  (migration 0017) withhold anything under their thresholds; offline, slow or below them, the
  screen shows an early variant with no number. Every other figure in the flow is labelled SAMPLE.
- **Answers** (focus, attribution, Terms acceptance time) live in the profile store and sync to
  `onboarding_answers`, readable only by their owner. Extra garage vehicles sync as non-primary
  `vehicles` rows. The car photo and nickname never leave the phone.

## Plans

**Hidden in v1.** `SHOW_PRO` is false, so nothing below is visible in the app; it is kept so the
locks have something to enforce the day purchases ship.

**`src/config/plans.ts` is the contract**: `PLAN_MATRIX` is the Free-vs-Pro table the `/plans`
screen draws, and `FREE_LIMITS` holds its numbers. The rules live in `src/lib/entitlements.ts`
(`useAccess`, `canUse`, `canOpenDrive`, `canAddFriend`, `canAddVehicle`), pure and unit-tested;
`src/lib/__tests__/proLocks.test.ts` runs every lock as an enforced Free account.

- **`PRO_LIMITS_ENFORCED` is false**: every account is treated as Pro and nothing is locked. It
  turns on only in the build that wires RevenueCat and the paywall (`ONBOARDING_PAYWALL`), and
  `SHOW_PRO` follows it, so Pro is shown exactly when it can be bought (App Review 2.1, 3.1.1).
- **Privacy is never Pro**, and every account's drives upload to be verified and ranked.

## Before launch

`docs/LAUNCH.md` is the ordered checklist. Beyond it, from the spec's naming constraints:

- Domains: `gapped.co` / `gappedapp.com` / `joingapped.com` were unregistered as of 2026-07-21
  and flagged perishable. The `.app` domain is not used for anything (see Public pages).
- One hour with an IP solicitor re: the open GAPPED Class 9/42 trademark position.
