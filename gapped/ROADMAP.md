# Gapped — Roadmap

Four features, roughly in build order. Nothing here is built. Each entry records where it hooks
into the code that exists today and what it is blocked on, so a future session can pick one up
without re-deriving the context.

Read alongside `README.md` (current state, backend, attestation) and `AGENTS.md` (hard rules).

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

`app/(tabs)/drive.tsx:122–127` is the trigger site. It already runs exactly once per finished
drive, guarded by `lastRecorded.current` against re-firing:

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

### Blocked — do not start until this is resolved

**Confirm whether `maxG` / `avgG` include gravity.** `src/drive/types.ts:18` documents
`accelX/Y/Z` as *"gravity-removed user acceleration"*, but `src/drive/recorder.ts` populates them
from `expo-sensors`' `Accelerometer`, which reports **total** acceleration including gravity.
There is no gravity removal anywhere in the codebase. A stationary phone therefore reads ≈ 1.0 g,
and `gForces()` in `src/drive/stats.ts` — `sqrt(x² + y² + z²)` — is offset by roughly 1 g.

A rank built on a metric that is wrong by ~1 g is a rank that has to be reset later, invalidating
everyone's progress. Fix the metric first (likely `DeviceMotion.acceleration`, which excludes
gravity, rather than `Accelerometer`), confirm on a real device, then design ranks.

The same bug likely pins the adaptive IMU sampling at 10 Hz — `desiredImuHz` compares against
`HIGH_RATE_ACCEL_G = 0.25` and gravity alone clears it — so battery data gathered before the fix
is not representative either.

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

This is the part that sinks UGC apps, and it is **not optional**. Shipping any of the above
without all five means rejection:

1. **Content filtering** — a method for filtering objectionable material before it appears.
2. **Report mechanism** — users must be able to flag objectionable content.
3. **Block user** — users must be able to block abusive users.
4. **Published terms** — an EULA/terms of use users agree to, stating there is zero tolerance for
   objectionable content or abusive users.
5. **Act on reports within 24 hours** — including removing the content and ejecting the user.
   This is an operational commitment, not a feature. For a solo developer it means a moderation
   queue and an actual response process, and it should factor into whether this feature is worth
   building at all.

Build the moderation surface *first*, not last. Retrofitting it is how launches slip.

### Technical gaps

- **`vehicles.photo_url` already exists** in the schema (`0001_init.sql:34`) and the client holds
  column-level insert/update grants on it (`0009`). Nothing writes it.
- **No camera or photo library permission is declared.** `app.json` has no
  `NSCameraUsageDescription` and no `NSPhotoLibraryUsageDescription`. Adding image picking means
  adding those to `ios.infoPlist` and the corresponding Android permissions. See README, "Native
  config (iOS)" — `app.json` is the source of truth, and read the dev-launcher warning there
  before touching the plist.
- **No storage bucket.** Supabase Storage is unconfigured; `supabase/config.toml` has the storage
  block at defaults. Buckets need RLS policies of their own — the existing migrations' hard-won
  lesson (0002, 0007) is that grants and policies are separate and both must be explicit.
- **No image dependency.** `expo-image-picker` and `expo-image` are not installed. Note the
  standing rule about not adding dependencies casually.
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

## Ordering rationale

1. **Reveal** — small, self-contained, uses only what exists, and it is the moment that makes the
   core loop feel good. Highest ratio of delight to risk.
2. **Ranks** — blocked on a one-line sensor fix and one design decision. Cheap once unblocked.
3. **Social** — real scope, and the Guideline 1.2 moderation commitment is an ongoing operational
   cost, not a sprint.
4. **Marketplace** — blocked on an unresolved payments question that is structural, not technical.
