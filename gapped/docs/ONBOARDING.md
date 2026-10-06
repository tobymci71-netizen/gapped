# Onboarding (v2)

The first-run flow, rebuilt after a frame-by-frame study of a competitor's onboarding (a sport-bike
tracker). Gapped keeps that flow's **order, pacing and shape**: splash with one sound, a short
feature carousel, identity questions broken up by proof screens, a staged setup beat, then an
optional paywall (off in v1). It keeps its own look (Nightrun, `docs/DESIGN.md`: a car advert shot
at night, red only where real light would be), its own nouns (cars first, motorbikes supported) and
its own words.

## Rules that override the reference

1. **No invented numbers.** Every count on a proof screen comes from the backend
   (`make_popularity`, `country_activity`). Below a threshold, or offline, the screen switches to an
   honest early-stage variant with no number. No fake ratings, "1M+ miles", multipliers
   ("2.4x faster") or struck-through reference prices. Gapped's pitch is "the board you can
   believe"; the first screens must not be the first place it lies.
2. **Our copy, not theirs.** Same tone (short, confident, second person, no exclamation marks, no
   emoji in UI chrome), written for Gapped.
3. **No App Tracking Transparency prompt.** Gapped does not track across other companies' apps;
   asking anyway invites rejection under App Review 5.1.2. Add it only alongside a real
   ad-attribution SDK.
4. **The road-safety acknowledgement stays** (`SAFETY_ACKNOWLEDGEMENT`), as the last question
   before setup. It is the app's record that a public speed board was accepted for responsible
   use (the guidelines say: obey local traffic laws and speed limits). Since v1 it also carries
   the **18+ and driving-licence** box and the **Terms of Use** (with the Privacy Policy), which
   App Review 1.2 and the Terms (section 1) need: agreeing calls `acceptSafety()` and
   `acceptTerms()`, and `termsAcceptedAt` syncs to `onboarding_answers.terms_accepted_at`. The
   copy is `src/onboarding/place/consentCopy.ts`. With the flag off the question moves to the
   trust step rather than disappearing (`TERMS_ROUTE`, `src/onboarding/flow.ts`).
5. **The paywall is behind `ONBOARDING_PAYWALL` (default false)** and is always dismissible. Its
   purchase and restore are stubs until RevenueCat is wired; a TestFlight or App Store build must
   not ship a button that cannot charge.
6. Username rules stay the server's: 3–20 characters, lowercase letters, numbers and underscores
   (`src/lib/username.ts`), with the real availability check. The server also refuses names on
   its denylist (`blocked_terms`, migration 0019) with `username_not_allowed`, which the app
   treats like a taken name: "That username isn't allowed. Pick another."
7. **Nothing in the flow mentions Pro in v1.** `SHOW_PRO` (`src/config/flags.ts`) is false until
   purchases work, so no step shows a PRO chip, names Gapped Pro, or leads to `/plans`
   (`useGoPro` does nothing), and every account has every feature: `PRO_LIMITS_ENFORCED` is
   false, so the garage step never caps and nothing is locked. App Review rejects references to
   a paid tier that cannot be bought (2.1, 3.1.1).

   When Pro ships, every claim about Free and Pro must agree with `PLAN_MATRIX`
   (`src/config/plans.ts`), the two flags turn on together with RevenueCat and the paywall, and
   a step that shows a Pro feature says so (the cornering page's chip). Whatever the plan, what a
   step promises for every drive has to be true for every account, privacy is never Pro, and
   every account's drives upload to be verified and ranked; no copy may suggest otherwise. The
   app offers route trimming, not privacy zones (the zone maths in `src/drive/privacy.ts` has no
   screen), so no copy may promise zones.

## Steps

`progress` is the line under the back chevron (`OnboardingFrame`): a hairline track, a red trail
along it and a small slanted red light at its head, travelling on from where the previous step left
it. It only moves forward and is hidden where marked "—".

| # | Route | Screen | Progress | Notes |
|---|---|---|---|---|
| 0 | `/onboarding` | Splash → carousel | — | Splash plays the sting once, then the G mark rises into the welcome hero and lands on its mark. |
| 1 | `/onboarding/ride` | Choose your ride | 1/13 | Car / Motorbike segmented control, make and model sheets, "add it yourself", nickname. |
| 2 | `/onboarding/brand` | Make proof | 2/13 | `make_popularity`, ranked or early variant. |
| 3 | `/onboarding/garage` | Add more cars? | 3/13 | Main car card, "Add another car" (extra vehicles, optional). |
| 4 | `/onboarding/photo` | Add a car photo | 4/13 | Photo library pick, or keep the illustration. |
| 5 | `/onboarding/unit` | Speed unit | 5/13 | Two cards, default from locale. |
| 6 | `/onboarding/country` | Country + proof | 6/13 | Sheet opens on first visit; dotted map + `country_activity`. Reactive to changes. |
| 7 | `/onboarding/location` | Location soft ask | 7/13 | Enable, or Not now. Never blocks. |
| 8 | `/onboarding/focus` | Your focus | 8/13 | Single select, required. |
| 9 | `/onboarding/focus-proof` | Focus proof | 9/13 | One variant per focus. |
| 10 | `/onboarding/username` | Username | 10/13 | Live validation + availability. |
| 11 | `/onboarding/trust` | Privacy reassurance | 11/13 | What becomes public and what never does, and a Privacy Policy link. Asks 18+ and the Terms only when the safety step is off. |
| 12 | `/onboarding/attribution` | How did you hear about us? | 12/13 | Single select, required. |
| 13 | `/onboarding/safety` | Safety, age and Terms | 13/13 | Guidelines box, 18+ and licence box, Terms and Privacy Policy. Skipped when `SAFETY_ACKNOWLEDGEMENT` is false (total becomes 12, and the trust step asks instead). |
| — | `/onboarding/setup` | Getting your car ready → You're all set | — | Real work (save, sync) behind a staged checklist; minimum ~3 s. |
| — | `/onboarding/paywall` | Gapped Pro | — | Only when `ONBOARDING_PAYWALL`. Dismissible. |

Onboarding completes (`completeOnboarding()`, which flips the `Stack.Protected` guard to the tabs)
when the person taps Continue on "You're all set", or closes/finishes the paywall when it is on.
Back returns to the previous step without clearing later answers.

## Copy

**Splash.** The G mark (`assets/brand/gapped-mark.png`: white G, red streaks) with its red glow,
centred. It rises into the welcome page and lands on the hero's own mark.

**Carousel** (page dots, swipeable, button advances):
1. *Every drive. / Measured. / Verified.* ("Verified." lit in racing red) / Gapped logs each drive
   with GPS and checks it on our servers before it counts. — **Get started** (the deep-red primary
   plate with the streak arrow). Behind it, the welcome hero (`src/onboarding/intro/hero/`): a
   night motorway in Skia, light trails bursting out of the vanishing point, the car's tail lights
   on wet road, the G mark with its flare, film grain. It runs only while the page is on screen and
   the step focused; Reduce Motion gets the landed still frame. No sign-in link: Gapped has no
   sign-in. The line says "before it counts" rather than "every number you see is real", because
   page 2 can show SAMPLE rows. (Earlier wordings: "Track every drive", and before that "Top
   speed, 0–60 and every corner"; cornering G is Pro, and this page is the promise for every
   drive.)
2. *See where you stack up* / Your drives. Your friends. Your place on the board. Card: "Distance"
   (the Ranks tab's default; it was "Top speed", and the first board anyone sees should not make a
   contest of speed on public roads), the person's country code or "Global", three rows with red
   streak bars. Real board rows when the server has three or more; otherwise sample rows wearing
   the SAMPLE tag. — **Next**
3. *See more in every drive.* / row label "Cornering G". Hero number counts
   0.12 g → 0.94 g; a lit arc (0 at the top, 0.5 and 1.0 g each side in mono; dim red at the
   centre brightening to white-hot at the edges) with a white needle swings right; the night car
   rolls a few degrees; footer "Peak cornering G" —
   Left 0.88 g | Right 0.94 g. One ~2 s ease-in-out timeline, holds at the end. In v1 it is a
   plain demo: every account has cornering G. The page's copy still names its matrix row
   (`proFeature: 'advancedTelemetry'`), so when `SHOW_PRO` turns on the PRO tag
   (`<ProBadge />`) sits over the title and VoiceOver hears "Gapped Pro. See more in every
   drive." (`marksPro`, `src/onboarding/intro/introTimeline.ts`). — **Next**
4. *Built by drivers* / From drivers. For drivers. The rendered coupé side on, tail lights lit. —
   **Set up my car**

**Choose your ride** / Start with the car you drive most. Car | Motorbike. Fields "Select make",
"Select model" (model disabled until a make). Link: "Not listed? Add it yourself". "Nickname ·
optional", placeholder "Give it a name". Continue needs make and model. Motorbike swaps "car" for
"bike" in this and later copy; this step's own subtitle becomes "Start with the bike you ride
most." (the verb changes too).

**Make proof**, ranked variant (the make has ≥ 5 drivers and ≥ 3 makes are listed; the server
only lists makes with ≥ 5 drivers, so in practice that is three makes of five or more): big count,
"{Make} drivers are already on Gapped", "#{rank} most popular on Gapped", up to five rows
centred on the person's make with streak bars sized to share (theirs lit hot, others red at rest),
"{share}% of all Gapped {car|bike} drivers", closer "Your car connects you with drivers who share
it." Early
variant: "Be one of the first {Make} drivers on the board" / "Every verified {Make} run lands on
the board. Yours can be the one to beat." No numbers.

The count is drivers who finished onboarding with that make as their main vehicle, not drivers
with a verified run, so the ranked line says "on Gapped", not "on the board". The share is of
drivers of the same kind (cars, or bikes), so the share line names the kind.

**Add more cars?** / Optional. Your main car is set, so you can keep going and build your garage
later. Card: the vehicle's render, "{Make} {Model}" (or nickname), a "Main car" slanted tag. Row: "+ Add
another car". Continue. In v1 the step never caps: `PRO_LIMITS_ENFORCED` is off, so every account
can add as many vehicles as it likes, and nothing on the step mentions Pro. When the limits turn
on (with `SHOW_PRO` and purchases), a Free garage holds `FREE_LIMITS.garageVehicles` (1, the main
car) and a full one swaps the add row for a PRO row that leads to Gapped Pro (`useGoPro`); extras
already added stay listed and removable (`src/onboarding/vehicle/garageAccess.ts`).

**Add a car photo** / Make it yours, or keep the illustration. The photo stays on the phone (the
app's Documents folder); it is never uploaded, and the privacy policy says so. **Add photo** (the
white slanted plate), **Keep current image** (the dark outlined plate). After a pick the photo replaces the render and Continue
appears.

**Choose your speed unit** / Your speed. Your units. Gauge sweeps on appear. Cards: km/h · Metric ·
km · m, and mph · Imperial · mi · ft.

**Country.** Sheet "Select country" (flag, name, region; search pinned to the bottom). Proof:
*You're in good company*, flag + country name in white, dotted map (main landmass in soft white
dots, other islands dim). Count line, in order of preference:
- ≥ 10 drove yesterday: "{n} drivers from {Country} drove with Gapped yesterday"
- ≥ 10 on the board: "{n} drivers from {Country} are on the board"
- otherwise: "Be the first from {Country} on the board" / "The {Country} board fills one verified
  run at a time."
Changing country crossfades the map and swaps the line. Before a country is chosen (the sheet was
closed without a pick) the step reads *Where do you drive?* / Your country decides which national
board you're ranked on., over a grey dotted disc, and the footer button is **Select country**. The
phone's region is offered as the sheet's first row, never chosen for the person.

**Location.** A white location arrow. *Ready to drive.* / Turn on location for speed, distance and your route.
Card: pin, "Location", status "Not requested" / "Allowed" / "Not allowed". Caption: "Optional now.
Recording a drive needs location." **Enable location**, then text button **Not now**. Whichever
way the OS dialog is answered, the card shows the answer for a moment and the step moves on; a
refusal is a choice, not an error, and Back finds **Open Settings** waiting.

**Focus.** Eyebrow "Your focus" (mono, after a small slanted red light). *What matters to your
drive?* / Choose what you want to explore after each drive. Rows (night panels; the chosen one has
a red light down its left edge and a white check): Top speed — Verified, on tracks and closed
roads · 0–60 — Your acceleration, measured · Local ranking — See where you rank · Friends —
Compare real drive stats. (The words describe what is measured, never a reason to go fast; the
stored keys are unchanged, so "Friends" is still `beatFriends`, and `flow.test.ts` forbids "beat"
and "faster" in the labels. Source of truth: `FOCUS_OPTIONS`, `src/onboarding/flow.ts`.)

**Focus proof** (pill repeats the focus):
- Top speed: *Your top speed, verified* / Every run is re-checked on our servers before it counts.
  No spoofed GPS, no typed-in numbers, and no top speed over its country's ranking limit makes the boards. Visual: a board row with the VERIFIED chip — the Board
  tab's own first sample row (`sample_driver_1`, BMW M240i, 82 mph), not the person's car: a
  verified speed beside a car they own would be an invented figure for that car.
- 0–60: *Measured, not guessed* / From a standstill of at least two seconds, with a one-foot
  rollout. No clean start, no number. Visual: a sample timer running to 0–60, labelled sample.
- Local ranking: *Your country, your board* / Every verified run places on your country's board
  and the global one, so you can see where you and your car stand. Visual: sample rank card, "#7
  of 48 drivers".
- Friends: *See how you compare* / Add friends by username and compare real drive stats.
  Following is one-way, so nobody lands on a stranger's screen. Visual: sample friends board.
  (It said "Friends make it a race"; friends compare, they do not race.)
Three stroke icons in soft white under every variant: Real drive data · Progress history ·
Ranking context.
Every figure on these cards is labelled SAMPLE (and spoken as one), and every sample speed is a
road speed no faster than the Board tab's own sample: this step comes just before the safety
acknowledgement.

**Username.** *Choose a username* / This is how you'll appear on the leaderboards. Empty avatar
circle. Field "@" + "username". Helper: 3–20 lowercase letters, numbers or underscores. Errors
(orange border + caption): "That username is already taken." / "That username isn't allowed.
Pick another." (the server's denylist, rule 6) / "Use 3–20 lowercase letters, numbers or
underscores." Continue enables when valid and available (or unknown offline).

**Trust.** A white shield. *Thanks for trusting us.* Card with a lock: "Your privacy
matters to us." / "No ads, and your data is never sold. A route you choose to share is trimmed at
both ends first." Card with an eye: "What others see" / "Your username, country and run results,
including the date of each drive, are public on the leaderboards. Your routes never are." Then
"Read the Privacy Policy" (a link). Every sentence matches `docs/PRIVACY.md`. It makes no promise
that drives stay on the phone, and must not: every account's drives upload to be verified, and
Settings says so under Privacy (rule 7). With the safety step off, this step also asks for the
18+ box and the Terms (rule 4).

**Attribution.** *How did you hear about us?* TikTok, App Store, A friend, X / Twitter, Other,
Reddit, YouTube, Instagram (brand marks from Simple Icons, CC0). Selected row: the night panel with
a red light down its left edge, white label and a white check. **Continue** is disabled until a
choice; its arrow is the drawn streak tip (`StreakArrow`), so VoiceOver says "Continue", not
"rightwards arrow".

**Safety.** *Before you drive.* The guidelines with drawn stroke glyphs: "Top-speed and 0–60 runs
belong on tracks and closed roads. Always obey speed limits.", then the original four (obey
traffic laws and speed limits, start and stop only while parked, use a phone holder, never touch
the phone while driving). Two boxes, both required: "I acknowledge these guidelines and agree to
drive responsibly." and "I'm 18 or older and hold a valid driving licence." Then "By continuing
you agree to the Terms of Use and Privacy Policy" (both links) and the legal line. The button
reads **I agree**, since the next screen is setup, not a drive. Copy:
`src/onboarding/place/consentCopy.ts`.

**Setup.** The G mark. *Getting your car ready.* The vehicle's render from behind and to one side, tail lights catching (or their photo), make over model. "Making it
yours" with its percent, over the flow's progress line and its red light. Checklist, ticking as the percent crosses each: Your car · Your drive
preferences (Your units. Your country. Your way.) · Your stats · Your rankings · Your setup
(Keeping everything ready for your first drive.). Then *You're all set.* / Your next drive starts
here. "Ready to drive 100%" and **Continue**.

**Paywall** (flagged; off in v1 and never reached, since `ONBOARDING_PAYWALL` is false). The G mark, close button, a real `<ShareCard>` rendered from a sample drive
(labelled sample, Gapped mark on, as every plan draws it) as the hero, then *See more in every
drive* (the carousel's Pro page, closed here) / "Pro adds your full drive history, cornering G,
class brackets and clean share cards. Recording and the boards stay free." Plan cards Monthly
(preselected) and Weekly (`PRO_PLANS`) with `PAYWALL_PLACEHOLDER_PRICES` (no reference prices, no
trial), the primary **Unlock Gapped Pro**, then Terms of Use · Privacy Policy · Restore Purchases.
Purchase and restore are stubs.

Deliberate departures from the reference, each for a stated reason:
- A small close button (top right): rule 5, always dismissible. Android back and both stubs also
  finish onboarding.
- The pitch sells depth, not sharing. It was the reference's share-card pitch, "Share your best
  drives", with a small-print correction under it, because share cards are free; Pro is now
  depth, so the depth is the pitch. Its one sentence is `PAYWALL_PRO_NOTE` (`src/config/plans.ts`):
  each thing it calls Pro is a Pro-only row of the matrix, each thing it calls free is a Free row,
  each has its words in the sentence, and rows not built yet (the video overlay, restoring on a
  new phone) stay out of it, all held by `src/config/__tests__/plans.test.ts`.
- The plan cards sit side by side in the pinned footer, beside the button, so the price is never
  scrolled away from the thing that charges it (on a 667 pt phone they used to be). Past 1.3x text
  the plans and links move into the scrolling page and only the button stays pinned, because a
  pinned footer cannot scroll.
- The SAMPLE label is a tab over the card's top edge, unscaled, so it stays legible at any card size.
- The sample card carries the person's username and units but not their vehicle: an invented 0–60
  printed beside a real car they own would be a made-up figure for that car (rule 1). It never
  wears VERIFIED.

## Look and motion

Nightrun (`docs/DESIGN.md`, `src/theme/tokens.ts`). Every step sits on the night (`Screen`'s
`NightBackdrop`), with titles in the wide italic (`StepTitle`), eyebrows and data in Martian Mono,
and choices on night panels (`src/onboarding/ui/choice.tsx`) with a red light down the chosen
row's left edge and a white check. Red is for light: the progress line's head, the chosen row's
light, the hero's tail lights and trails, the welcome's lit "Verified." (the one red word, at
display size), and the one deep-red primary button ("Get started", and the paywall's CTA). Continue buttons in this flow are the
**white slanted plate with dark ink** (`Button variant="light"`); disabled is `color.disabled` with
`text3`. Links are white and underlined (`NightLink`). SAMPLE, Verified and Main car are slanted
tags (`SlantTag`). Errors use `color.warning` (orange, `#FF9F0A`). Motion is ease-out 350–550 ms,
nothing bounces, numbers count, bars grow, sheets rise; reduced motion gets end states. No haptics
are required by the reference; the app's existing selection haptic on choices is kept.

Headlines grow with Dynamic Type up to 1.5x, display sizes to 1.3x (past that the wide italic
breaks words in half); body copy is never capped, and every step scrolls where its content outgrows the screen.

## Sound

One sting (`assets/sounds/launch-sting.wav`, ~1.6 s, generated by `scripts/generate-sting.py`),
played once when the splash's G mark lands, through `expo-audio`, respecting the silent switch.
Nothing else in the flow makes a sound.

## Data

All in `supabase/migrations/0017_onboarding_social_proof.sql`, which explains each choice; pgTAP in
`supabase/tests/onboarding_social_proof.test.sql`, end to end in `scripts/verify-roundtrip.mjs` §8b.

- `public.make_popularity(p_kind text)` → `(make text, drivers bigint, rank int, share numeric)`.
  Security definer, aggregates only, callable by anon (the screen is a first launch's). Counts
  each driver once, by their main (`is_primary`) vehicle, and only drivers with a username (a
  half-onboarded profile is not yet a driver). Makes are grouped ignoring case and surrounding
  space. A make is listed only once at least 5 drivers share it, but every driver of the kind is
  in the denominator: `share` is a percentage (0–100, one decimal) of all drivers of that kind.
  `rank` is unique (drivers, then make).
- `public.country_activity(p_country text)` → one row, `(drivers bigint, drove_yesterday bigint)`.
  Security definer, aggregates only, callable by anon; the code is upper-cased. `drivers` is
  profiles with a verified entry on that country's board; `drove_yesterday` is profiles whose
  country is that one and who started a non-rejected drive in the previous UTC day. Either count
  comes back NULL below 10, the same threshold the screen uses, so no small number ever leaves
  the server.
- `public.onboarding_answers` (profile_id PK → profiles, on delete cascade; focus, attribution,
  each checked against its keys; updated_at set by trigger), own-row RLS for select, insert and
  update, no delete policy, anon has nothing. Not on `profiles`, which is world-readable. Setup
  saves both answers, and `sync.ts` re-sends whatever the store holds on each pass until a write
  lands; only the answers that are set are sent, so one never blanks the other.
- Extra vehicles from the garage step sync as `vehicles` rows with `is_primary = false`, in one
  statement, DO NOTHING on conflict. When the main car changes, `sync.ts` demotes every other
  primary row of the driver, so make_popularity has one main car to count. Identity pushes run
  one at a time so two overlapping pushes cannot demote each other's car. The demotion is served
  by `vehicles_profile_id_idx`.
- `onboarding_answers.terms_accepted_at` (migration 0019) records when the Terms were accepted:
  sent with the answers, never cleared by a later null write, never later than the server's clock.
- On a project that lacks 0017 (check `supabase migration list --linked`), the two RPCs answer
  PGRST202 and the screens show their early variants; answer writes fail quietly and are retried
  on every sync pass. v1 needs every migration up to 0021 (`docs/LAUNCH.md`).
