# Onboarding (v2)

The first-run flow, rebuilt after a frame-by-frame study of a competitor's onboarding (a sport-bike
tracker). Gapped keeps that flow's **order, pacing and shape**: splash with one sound, a short
feature carousel, identity questions broken up by proof screens, a staged setup beat, then an
optional paywall. It keeps its own look (the "Acid" tokens are already near-black with a lime
accent), its own nouns (cars first, motorbikes supported) and its own words.

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
   use (the guidelines say: obey local traffic laws and speed limits).
5. **The paywall is behind `ONBOARDING_PAYWALL` (default false)** and is always dismissible. Its
   purchase and restore are stubs until RevenueCat is wired; a TestFlight or App Store build must
   not ship a button that cannot charge.
6. Username rules stay the server's: 3–20 characters, lowercase letters, numbers and underscores
   (`src/lib/username.ts`), with the real availability check.

## Steps

`progress` is the 3 pt bar under the back chevron (lime fill, grey track). It only moves forward and
is hidden where marked "—".

| # | Route | Screen | Progress | Notes |
|---|---|---|---|---|
| 0 | `/onboarding` | Splash → carousel | — | Splash plays the sting once, then the wordmark moves into the carousel header. |
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
| 11 | `/onboarding/trust` | Privacy reassurance | 11/13 | No form. |
| 12 | `/onboarding/attribution` | How did you hear about us? | 12/13 | Single select, required. |
| 13 | `/onboarding/safety` | Safety acknowledgement | 13/13 | Skipped when `SAFETY_ACKNOWLEDGEMENT` is false (total becomes 12). |
| — | `/onboarding/setup` | Getting your car ready → You're all set | — | Real work (save, sync) behind a staged checklist; minimum ~3 s. |
| — | `/onboarding/paywall` | Gapped Pro | — | Only when `ONBOARDING_PAYWALL`. Dismissible. |

Onboarding completes (`completeOnboarding()`, which flips the `Stack.Protected` guard to the tabs)
when the person taps Continue on "You're all set", or closes/finishes the paywall when it is on.
Back returns to the previous step without clearing later answers.

## Copy

**Splash.** `GAPPED` wordmark, lime, centred.

**Carousel** (page dots, swipeable, button advances):
1. *Track every drive* / Top speed, 0–60 and every corner. Verified, then ranked. — **Get started**
2. *See where you stack up* / Your drives. Your friends. Your place on the board. Card: "Top speed",
   the person's country code or "Global", three rows. Real board rows when the server has three or
   more; otherwise sample rows wearing the existing SAMPLE treatment. — **Next**
3. *See more in every drive.* / row label "Cornering G". Hero number counts 0.12 g → 0.94 g; an arc
   marker (0 at the top, 0.5 and 1.0 g each side, green centre → yellow → red edges) swings right;
   the car silhouette rolls a few degrees; footer "Peak cornering G" — Left 0.88 g | Right 0.94 g.
   One ~2 s ease-in-out timeline, holds at the end. Labelled as a demo for VoiceOver. — **Next**
4. *Built by drivers* / From drivers. For drivers. Large white car silhouette. — **Set up my car**

**Choose your ride** / Start with the car you drive most. Car | Motorbike. Fields "Select make",
"Select model" (model disabled until a make). Link: "Not listed? Add it yourself". "Nickname ·
optional", placeholder "Give it a name". Continue needs make and model. Motorbike swaps "car" for
"bike" in this and later copy; this step's own subtitle becomes "Start with the bike you ride
most." (the verb changes too).

**Make proof**, ranked variant (the make has ≥ 5 drivers and ≥ 3 makes are listed; the server
only lists makes with ≥ 5 drivers, so in practice that is three makes of five or more): big count,
"{Make} drivers are already on Gapped", lime "#{rank} most popular on Gapped", up to five rows
centred on the person's make with bars sized to share (theirs lime, others grey), "{share}% of all
Gapped {car|bike} drivers", lime closer "Your car connects you with drivers who share it." Early
variant: "Be one of the first {Make} drivers on the board" / "Every verified {Make} run lands on
the board. Yours can be the one to beat." No numbers.

The count is drivers who finished onboarding with that make as their main vehicle, not drivers
with a verified run, so the ranked line says "on Gapped", not "on the board". The share is of
drivers of the same kind (cars, or bikes), so the share line names the kind.

**Add more cars?** / Optional. Your main car is set, so you can keep going and build your garage
later. Card: silhouette, "{Make} {Model}" (or nickname), lime caption "Main car". Row: "+ Add
another car". Continue. A Free garage holds `FREE_GARAGE_VEHICLES` (3, main included; an
unlimited garage is Pro), so at three the row becomes "Your garage holds up to 3 vehicles for
now."

**Add a car photo** / Make it yours, or keep the illustration. **Add photo** (white pill),
**Keep current image** (dark pill). After a pick the photo replaces the silhouette and Continue
appears.

**Choose your speed unit** / Your speed. Your units. Gauge sweeps on appear. Cards: km/h · Metric ·
km · m, and mph · Imperial · mi · ft.

**Country.** Sheet "Select country" (flag, name, region; search pinned to the bottom). Proof:
*You're in good company*, flag + country name in lime, dotted map (main landmass lime, other
islands dim). Count line, in order of preference:
- ≥ 10 drove yesterday: "{n} drivers from {Country} drove with Gapped yesterday"
- ≥ 10 on the board: "{n} drivers from {Country} are on the board"
- otherwise: "Be the first from {Country} on the board" / "The {Country} board fills one verified
  run at a time."
Changing country crossfades the map and swaps the line. Before a country is chosen (the sheet was
closed without a pick) the step reads *Where do you drive?* / Your country decides which national
board you're ranked on., over a grey dotted disc, and the footer button is **Select country**. The
phone's region is offered as the sheet's first row, never chosen for the person.

**Location.** Lime arrow. *Ready to drive.* / Turn on location for speed, distance and your route.
Card: pin, "Location", status "Not requested" / "Allowed" / "Not allowed". Caption: "Optional now.
Recording a drive needs location." **Enable location**, then text button **Not now**. Whichever
way the OS dialog is answered, the card shows the answer for a moment and the step moves on; a
refusal is a choice, not an error, and Back finds **Open Settings** waiting.

**Focus.** Eyebrow "YOUR FOCUS". *What matters to your drive?* / Choose what you want to explore
after each drive. Rows: Top speed — Track your verified top speed · 0–60 — Time your launches ·
Local ranking — See where you rank · Beat friends — Compare real drive stats.

**Focus proof** (pill repeats the focus):
- Top speed: *Your top speed, verified* / Every run is re-checked on our servers before it counts.
  No spoofed GPS, no typed-in numbers. Visual: a board row with the VERIFIED chip — the Board
  tab's own first sample row (`sample_driver_1`, BMW M240i, 82 mph), not the person's car: a
  verified speed beside a car they own would be an invented figure for that car.
- 0–60: *Measured, not guessed* / From a standstill of at least two seconds, with a one-foot
  rollout. No clean launch, no number. Visual: a sample timer running to 0–60, labelled sample.
- Local ranking: *Your country, your board* / Every verified run places on your country's board
  and the global one, so you can see where you and your car stand. Visual: sample rank card, "#7
  of 48 drivers". Not class: class brackets are Pro in the published matrix, board placement is
  Free.
- Beat friends: *Friends make it a race* / Add friends by username and race their real drive stats.
  Following is one-way, so nobody lands on a stranger's screen. Visual: sample friends board.
Three lime icons under every variant: Real drive data · Progress history · Ranking context.
Every figure on these cards is labelled SAMPLE (and spoken as one), and every sample speed is a
road speed no faster than the Board tab's own sample: this step comes just before the safety
acknowledgement.

**Username.** *Choose a username* / This is how you'll appear on the leaderboards. Empty avatar
circle. Field "@" + "username". Helper: 3–20 lowercase letters, numbers or underscores. Errors
(orange border + caption): "That username is already taken." / "Use 3–20 lowercase letters,
numbers or underscores." Continue enables when valid and available (or unknown offline).

**Trust.** Shield in a grey circle. *Thanks for trusting us.* Card with lime lock: "Your privacy
matters to us." / "Your route is trimmed at both ends before anyone sees it. No ads, and your data
is never sold." (The first draft promised "you choose what appears on your profile. Change it any
time in Settings"; Settings has no profile controls, so that sentence waits until it does.)

**Attribution.** *How did you hear about us?* TikTok, App Store, A friend, X / Twitter, Other,
Reddit, YouTube, Instagram (brand marks from Simple Icons, CC0). Selected row: white, black label,
check. **Continue →** grey until a choice; the arrow is drawn (`Button`'s `trailing`), so VoiceOver
says "Continue", not "rightwards arrow".

**Safety.** The existing acknowledgement, restyled to this flow: the same four guidelines with
drawn lime glyphs in place of their emoji, the same tickbox and legal line. The button reads
**I agree**, since the next screen is setup, not a drive.

**Setup.** Wordmark. *Getting your car ready.* Silhouette (or photo), make over model. "Making it
yours" with a lime percent. Checklist, ticking as the percent crosses each: Your car · Your drive
preferences (Your units. Your country. Your way.) · Your stats · Your rankings · Your setup
(Keeping everything ready for your first drive.). Then *You're all set.* / Your next drive starts
here. "Ready to drive 100%" and **Continue**.

**Paywall** (flagged). Wordmark, close button, a real `<ShareCard>` rendered from a sample drive
(labelled sample) as the hero, "Share your best drives" / "Create clean share cards from your best
drives and routes." Plan cards Monthly (preselected) and Weekly (`PRO_PLANS`) with
`PAYWALL_PLACEHOLDER_PRICES` (no reference prices, no trial), lime **Unlock Gapped Pro**, then Terms of Use · Privacy Policy · Restore
Purchases. Purchase and restore are stubs.

Deliberate departures from the reference, each for a stated reason:
- A small close button (top right): rule 5, always dismissible. Android back and both stubs also
  finish onboarding.
- One honesty line under the pitch, "Share cards and the boards stay free. Pro adds class
  brackets, deeper telemetry and a bigger garage." (`PAYWALL_PRO_NOTE` in `src/config/plans.ts`,
  tested against the published matrix): share cards are free, so a paywall that only sold them would be selling
  something nobody pays for.
- The plan cards sit side by side in the pinned footer, beside the button, so the price is never
  scrolled away from the thing that charges it (on a 667 pt phone they used to be). Past 1.3x text
  the plans and links move into the scrolling page and only the button stays pinned, because a
  pinned footer cannot scroll.
- The SAMPLE label is a tab over the card's top edge, unscaled, so it stays legible at any card size.
- The sample card carries the person's username and units but not their vehicle: an invented 0–60
  printed beside a real car they own would be a made-up figure for that car (rule 1). It never
  wears VERIFIED.

## Look and motion

Reuse `src/theme/tokens.ts`: canvas, `surface2` cards (radius 16), `accent` lime for progress,
checks, links, wordmark and the paywall CTA only. Primary buttons in this flow are **white pills
with black labels** (`Button variant="light"`); disabled is `color.disabled` with `text3`. Errors use
`color.warning` (orange, `#FF9F0A`). Motion is ease-out 350–550 ms, nothing bounces, numbers count,
bars grow, sheets rise; reduced motion gets end states. No haptics are required by the reference;
the app's existing selection haptic on choices is kept.

Headlines grow with Dynamic Type up to 1.5x (past that the wide display face breaks words in
half); body copy is never capped, and every step scrolls where its content outgrows the screen.

## Sound

One sting (`assets/sounds/launch-sting.wav`, ~1.6 s, generated by `scripts/generate-sting.py`),
played once when the splash wordmark lands, through `expo-audio`, respecting the silent switch.
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
- 0017 is applied to the local stack only. Until `supabase db push`, the cloud project answers the
  two RPCs with PGRST202 and the screens show their early variants; answer writes fail quietly and
  are retried on every sync pass.
