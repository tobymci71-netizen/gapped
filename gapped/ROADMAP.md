# Gapped — Roadmap

Four features, roughly in build order, none of them in v1.0.0. Each entry records where it hooks
into the code that exists today and what it is blocked on, so a future session can pick one up
without re-deriving the context.

Read alongside `README.md` (current state, backend, attestation), `docs/LAUNCH.md` (what v1
shipped with) and `AGENTS.md` (hard rules). Anything that changes what data leaves the phone also
changes `docs/PRIVACY.md`, `docs/APP_PRIVACY_LABELS.md` and the privacy manifest in `app.json`,
before it ships.

---

## 1. GAPPED REVEAL

A celebration moment when a drive ends on something worth celebrating.

### What it is

After a drive finishes and the summary's speedometer and number animations have **settled** — not
during, the reveal must not fight the stats for attention — a full-screen overlay fires:

1. Canvas dims behind the overlay.
2. **GAPPED** enters fast from the right in `Archivo_900Black` (`font.displayBlack`), motion
   streaks trailing its leading edge, echoing the app logo.
3. On impact, an accent `#CCFF00` streak wipe crosses the screen.
4. Impact haptic fires on the same frame as the wipe.
5. Holds briefly.
6. Dissolves into the stat card.

### It must not fire every drive

That is the whole design constraint. A celebration that fires on every drive is wallpaper. Fire
only when the drive earned it:

- **a new personal best** — `useRecords` already computes this. `recordDrive(summary)` returns
  `PbImprovement[]`; a non-empty array is exactly the signal.
- **or the first drive of the day** — `driveDays` in the same store already tracks day keys via
  `dayKey(t)`, so "is today's key absent before this drive is recorded" is the test.

Both signals already exist. Nothing new needs computing.

### Where it hooks in

The `lastSummary` effect in `app/(tabs)/drive.tsx` is the trigger site. It already runs exactly
once per finished drive, guarded by `lastRecorded.current` against re-firing:

```ts
if (lastSummary && lastSummary.endedAt !== lastRecorded.current) {
  lastRecorded.current = lastSummary.endedAt;
  const imps = recordDrive(lastSummary);   // ← PbImprovement[]; non-empty = new PB
}
```

The day-of check must be read **before** `recordDrive` runs, because `recordDrive` adds today's
key to `driveDays` as a side effect. Capture `driveDays.includes(dayKey(now))` first, then call.

The overlay itself belongs in `src/components/` as a new component (suggested: `GappedReveal.tsx`)
rendered above the Drive screen's existing map/panel stack, not as a route — it is a moment, not
a screen, and pushing a route would put it in the back stack.

### Dependencies and constraints

- **Never during a drive, and never for an unranked speed.** `NO_IN_DRIVE_SPEED_NUDGES`
  (`src/config/flags.ts`) forbids rewarding a number while driving; the reveal fires only after
  the drive has finalised. A personal best that is a top speed above the country's ceiling (a
  drive the server marks "not ranked", `verification_meta.top_speed_ranked = false`) must not
  trigger it: celebrating it would reward the speed the boards refuse to rank. Distance and
  first-drive-of-the-day reveals are the safe default.
- **Timings from `src/theme/motion.ts` only.** `duration.epic` (900 ms) exists for exactly this
  ("celebration, verification grant"); `spring.bouncy` is the pronounced-overshoot spring. Do not
  inline a duration — the file says so and the codebase holds to it.
- **Haptics via `src/lib/haptics.ts`.** Use an impact, not a notification. `haptic.personalBest()`
  already exists (Heavy ×2, 90 ms apart) and was written for this feeling; `haptic.verified()`
  is the Success+Medium pair. Pick one, do not add a new one without reason.
- **`useReducedMotion` degrades it to a plain fade.** Not "a shorter version" — a cross-fade with
  no travel and no streaks. `src/lib/useReducedMotion.ts` is already threaded through 10 files.
- **Skippable on tap.** Any tap anywhere dismisses immediately to the stat card.
- Streaks and the wipe should be Reanimated worklets on the UI thread. Skia
  (`@shopify/react-native-skia`) is already a dependency and drives `Speedometer`, so it is
  available if the streak rendering needs it.
- The reveal must not block or delay the sync that `recorder.ts` fires on drive end.

### Open question

Whether the reveal should also fire on a *server-verified* result (verification flipping to
`verified` after upload) rather than only on local PBs. That is a second, later moment and a
different feeling — deferred deliberately.

---

## 2. RANKS

A progression system users climb through driving.

### Was blocked on gravity in the G-force figures: fixed

`maxG` / `avgG` used to include gravity (≈ 1.0 g on a parked phone), because the recorder read
`Accelerometer`. It now reads `DeviceMotion.acceleration`, CoreMotion's gravity-removed user
acceleration, and migration 0012 labels every older drive `total_acceleration` so the inflated
figures can be excluded rather than "corrected" (they cannot be). The same fix made the adaptive
IMU rate adaptive again.

Before building ranks on G, confirm the figures on a real drive: the debug HUD shows the IMU rate
and the live magnitude, in development builds only (`INTERNAL_TOOLS`).

### Open design question — to record, not answer

**Does rank derive from raw speed, or from smooth, consistent driving?**

Arguments for smoothness:

- Much harder to cheat. Top speed is a single number one good straight can inflate; sustained
  smoothness is a distribution over a whole drive and far harder to fake.
- Safer for App Review. A progression system that rewards *going faster* is a system that
  incentivises speeding, which is a plausible rejection under App Review's objectionable-content
  rules and a genuine liability question. One that rewards smooth, consistent driving does not.
- The data already exists: `src/drive/maneuvers.ts` counts hard braking and hard acceleration
  episodes, and `src/drive/distribution.ts` produces speed histograms.

Arguments for speed: it is what the audience came for, and the leaderboards already rank on it.

v1 already leans the other way for the boards: Ranks opens on Distance, a top speed above the
country's highest limit is never ranked, and "Fastest in country" was retired. A progression
system that rewards raw speed would undo that, and App Review would see it the same way.

A hybrid is possible — rank on smoothness, keep leaderboards on speed — which separates
"progression" from "competition" and lets each be honest about what it measures. **Decide before
building; this choice determines the whole data model.**

### Where it would hook in

- `supabase/migrations/` — a new migration. Ranks must be server-granted like `achievements`
  (0009), never client-computed, or they mean nothing.
- `supabase/functions/verify-drive/index.ts` — `grantAchievements()` is the existing pattern for
  awarding things off a verified drive; rank progression belongs beside it.
- `src/state/achievements.ts` is the client-read pattern to copy.
- Display: the You tab (`app/(tabs)/you.tsx`), near the streak grid and achievements.

---

## 3. SOCIAL PROFILES

Users post their cars; others like and follow.

### Scope

Photo upload and storage, a feed, likes, follows, profiles.

`follows` is partly done: `friendships` (migration 0006) is already a **directional** follow model
with `add_friend` / `remove_friend` / `list_friends` RPCs, and `board_top` already narrows the
friends board through it. Whether social follows reuse that table or need their own is a design
call — reusing it keeps one social graph, which is probably right.

### App Store Guideline 1.2 — user-generated content

v1 already meets this for the one piece of user content other people see, the username: a
server-side filter (`blocked_terms`, migration 0019), Report driver, Hide driver, Terms with zero
tolerance accepted in onboarding, and the owner's 24-hour review (`docs/MODERATION.md`). Photos,
posts and profiles are far harder to moderate than a 20-character name, so each of the five has
to be extended before any of them ships:

1. **Content filtering** — a method for filtering objectionable material before it appears.
2. **Report mechanism** — users must be able to flag objectionable content.
3. **Block user** — users must be able to block abusive users.
4. **Published terms** — an EULA/terms of use users agree to, stating there is zero tolerance for
   objectionable content or abusive users.
5. **Act on reports within 24 hours** — including removing the content and ejecting the user.
   This is an operational commitment, not a feature. For a solo developer it means a moderation
   queue and an actual response process, and it should factor into whether this feature is worth
   building at all.

Build the moderation surface *first*, not last. Retrofitting it is how launches slip. Image
moderation in particular has no equivalent of a denylist; it needs either a review queue before
photos go public or an automated classifier, and the reports queue gets a new reason.

### Technical gaps

- **`vehicles.photo_url` already exists** in the schema (`0001_init.sql:34`) and the client holds
  column-level insert/update grants on it (`0009`). Nothing writes it.
- **Picking a photo already works, locally.** Onboarding's photo step uses `expo-image-picker`
  (photo library only; `app.json` declares no camera permission) and keeps the picture in the
  app's own Documents folder. It is never uploaded, and the privacy policy says so. Uploading it
  changes the policy, `docs/APP_PRIVACY_LABELS.md` (User Content → Photos or Videos) and the
  privacy manifest. A camera would add `NSCameraUsageDescription`; read the README's "Native
  config (iOS)" before touching the plist.
- **No storage bucket.** Supabase Storage is unconfigured; `supabase/config.toml` has the storage
  block at defaults. Buckets need RLS policies of their own — the existing migrations' hard-won
  lesson (0002, 0007) is that grants and policies are separate and both must be explicit. Account
  deletion cannot empty a bucket from SQL (migration 0011 explains why); it has to go through the
  Storage API, before `delete_account()`.
- EXIF stripping on upload. A photo of a car outside the owner's house carries GPS coordinates,
  which would undo the entire privacy layer in `src/drive/privacy.ts`.

---

## 4. MARKETPLACE

Users buy and sell car parts; the app takes a percentage. Largest scope, and last.

### Open blocker — payments

**The developer is based in Guernsey, and Stripe does not onboard businesses in the Crown
Dependencies** (Guernsey, Jersey, Isle of Man). Stripe Connect — the obvious fit for a
marketplace taking a cut of peer-to-peer transactions — is therefore not available on a Guernsey
entity. **The payment structure is unresolved and this feature cannot be scoped until it is.**

Directions to investigate, none confirmed:

- A UK-incorporated entity for the payments business, with the tax, substance and cost
  implications that carries.
- A marketplace payment provider that does serve the Crown Dependencies.
- Structuring so the app never touches funds — listings only, payment arranged off-platform.
  This removes the blocker entirely but also removes the revenue model, so it is a different
  product, not a workaround.

Also note: taking a commission on physical goods sold peer-to-peer is outside Apple's in-app
purchase requirement (IAP covers digital content), but the boundary is worth confirming against
Guideline 3.1.5 before building.

### Dependencies

Everything in Social Profiles, plus seller identity/verification, dispute handling, and a
moderation burden considerably larger than photos of cars. Do not start before 1–3 are stable.

---

---

## Smaller, unscheduled

### Gapped Pro

Built and hidden: the matrix (`src/config/plans.ts`), the locks (`src/lib/entitlements.ts`) and
the paywall, all behind `SHOW_PRO` / `PRO_LIMITS_ENFORCED` (false in v1). Shipping it needs
RevenueCat, real prices, a restore that works, the Purchases data type in the privacy labels and
manifest, paid-service terms in `docs/TERMS.md` (section 8 says the app is free), and App Review
3.1.1. The flags turn on together, in the same build.

### A notification when a report arrives

The owner's 24-hour promise rests on a daily manual check (`docs/MODERATION.md`); nothing tells
the owner a report has come in. A database webhook on `driver_reports` inserts that emails the
owner would make the promise easier to keep. It must send the report id only, not the details.

### 0–100 km/h as a metric-user variant

The 0–60 metric is measured to **60 mph** (`SIXTY_MPH_MS` in `src/drive/units.ts`, used by
`detectZeroToSixty` in `src/drive/stats.ts`), and every surface now labels it "0–60 mph" so a
metric-preference user is not misled into reading it as km/h.

The obvious follow-up is a true **0–100 km/h** figure for metric users, which is the standard
outside the US and is not the same number — 100 km/h is 62.14 mph, so it is a genuinely different
measurement, not a conversion. `detectZeroToSixty` is already parameterised on a target speed in
all but name; it would take a target argument, and the board would need a second metric rather
than a relabelled one, because ranking mph and km/h times against each other would be nonsense.

Deliberately **not** built yet: it adds a metric to the schema, the board enum, the RPC and the
UI, for a figure the current audience largely does not ask for. Recorded so the decision is a
decision rather than an oversight.

## Ordering rationale

1. **Reveal** — small, self-contained, uses only what exists, and it is the moment that makes the
   core loop feel good. Highest ratio of delight to risk.
2. **Ranks** — the sensor fix is done; blocked on one design decision (speed or smoothness). Cheap once decided.
3. **Social** — real scope, and the Guideline 1.2 moderation commitment is an ongoing operational
   cost, not a sprint.
4. **Marketplace** — blocked on an unresolved payments question that is structural, not technical.
