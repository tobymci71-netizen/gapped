# App Store listing (v1.0.0)

Everything App Store Connect asks for on the app's product page, ready to paste. Each pasteable
field sits in a code block under a `field` marker with Apple's character limit, and
`site/test/listing.test.mjs` fails if a field grows past its limit or starts to mention Pro,
pricing or racing.

Rules this copy follows: no mention of Pro, plans, pricing or features not in this build; nothing
that frames speed on public roads as a competition; no competitor names; every claim true of
build 5.

---

## Name

<!-- field:name max:30 -->
```text
Gapped
```

If App Store Connect says the name is taken, use `Gapped: Drive Tracker`. Do not add speed
wording to the name.

## Subtitle

<!-- field:subtitle max:30 -->
```text
Verified drive tracking
```

## Promotional text

Can be changed at any time without a new build.

<!-- field:promotional-text max:170 -->
```text
Record your drives, see your stats and find your place on boards where every result is checked by our servers. No sign-up and no ads.
```

## Description

<!-- field:description max:4000 -->
```text
Gapped records your drives with your iPhone's GPS and motion sensors, then checks every result on our servers before it counts. No typed-in numbers and no spoofed locations: just what you actually drove.

RECORD EVERY DRIVE
• Tap Start drive before you set off, or let Gapped notice a drive starting while the app is open.
• See distance, duration, average and top speed, and G-force for every drive.
• With Always location access, recording carries on with the screen locked, so the whole journey is captured. Your location is recorded only during a drive.
• Each drive is saved on your phone as it is recorded, so an interrupted drive is recovered rather than lost.

BOARDS YOU CAN BELIEVE
• Every drive is recalculated from its raw GPS trace and checked before it reaches a board.
• See where you stand by distance and number of drives: worldwide, in your country, or among friends.
• Follow friends by username and compare your verified results.
• A top speed above your country's ranking limit is never ranked.

MEASURED, NOT GUESSED
• 0–60 mph times are measured from a true standstill, for track days and closed roads.
• If something cannot be measured cleanly, Gapped leaves it blank rather than estimating it.

PRIVATE BY DESIGN
• No sign-up: no email, no password, no phone number.
• Your routes are never shown to other drivers. A route you share is trimmed at both ends, so it never starts or finishes at your door.
• No ads, no analytics and no tracking.
• Export any drive as GPX or CSV, and delete a drive or your whole account in the app at any time.

YOUR GARAGE
• Add your car or motorbike, and every drive is attributed to the vehicle that made it.

DRIVE SAFELY
Gapped is for drivers aged 18 and over with a valid driving licence. Always obey traffic laws and speed limits. Start and end drives only when parked, keep your phone in a holder and never touch it while driving. Top-speed and 0–60 runs belong on a track or a closed road, never a public road.
```

## Keywords

Comma-separated, no spaces after commas. Apple already indexes the name and the category, so
neither is repeated here.

<!-- field:keywords max:100 -->
```text
drive tracker,driving log,trip,car,motorbike,gps,odometer,journey,track day,0-60,leaderboard,stats
```

## What's New in This Version

<!-- field:whats-new max:4000 -->
```text
Welcome to Gapped. Record your drives, see your stats and find your place on boards built on verified results.
```

## URLs

| Field | Value |
| --- | --- |
| Support URL | `https://tobymci71-netizen.github.io/gapped/support/` |
| Privacy Policy URL | `https://tobymci71-netizen.github.io/gapped/privacy/` |
| Marketing URL (optional) | `https://tobymci71-netizen.github.io/gapped/` |

These are `SUPPORT_URL` and `PRIVACY_URL` in `src/config/links.ts`. They must load before you
submit: see `docs/LAUNCH.md`.

The Terms of Use (`https://tobymci71-netizen.github.io/gapped/terms/`) are linked from the app.
App Store Connect's "License Agreement" stays on **Apple's standard EULA**: the Terms say users
are bound by it and add Apple's required terms (section 15), so no custom EULA is uploaded.

## Copyright

<!-- field:copyright max:200 -->
```text
2026 Toby Mcintosh
```

## Categories

| | Category | Why |
| --- | --- | --- |
| Primary | **Navigation** | Apple defines Navigation as apps that "provide information to help a user travel", with driving assistance and pilot logs as examples. Gapped is a GPS journey recorder: a driver's logbook with stats. Ride and drive recorders sit here, so it is where people look for one. |
| Secondary | **Utilities** | Measurement: distance, times and G-force from the phone's sensors. |

**Not Sports.** Gapped is not a sports app, and filing a road-driving app under Sports would
present driving on public roads as a sport to be won: the opposite of the safety position the app
takes (Ranks opens on Distance, over-limit speeds are not ranked, Terms put speed runs on tracks
and closed roads).

## Age rating

App Store Connect → App Information → Age Ratings. Answer the questionnaire truthfully, then
raise the result to 18+, which Apple allows when the app's own terms set a higher minimum age
(the Terms of Use, section 1: 18 and over, with a valid driving licence).

| Section | Question | Answer | Why |
| --- | --- | --- | --- |
| In-App Controls | Parental Controls | No | None in the app. |
| In-App Controls | Age Assurance | No | Users confirm they are 18+ in onboarding; that is a self-declaration, not a mechanism that confirms age. |
| Capabilities | Unrestricted Web Access | No | Links open web pages in Safari; there is no in-app browser. |
| Capabilities | User-Generated Content | Yes | Usernames are shown publicly on the boards. Moderated: filter, report, hide, 24-hour review. |
| Capabilities | Social Media | No | No feed and no posts. |
| Capabilities | Messaging and Chat | No | Drivers cannot message each other. |
| Capabilities | Advertising | No | No ads. |
| Mature Themes | Profanity or Crude Humor | None | Usernames are filtered. |
| Mature Themes | Horror/Fear Themes | None | |
| Mature Themes | Alcohol, Tobacco, or Drug Use or References | None | |
| Medical or Wellness | Medical or Treatment Information | None | |
| Medical or Wellness | Health or Wellness Topics | None | |
| Sexuality or Nudity | All three | None | |
| Violence | All four | None | |
| Chance-Based Activities | Gambling | No | |
| Chance-Based Activities | Simulated Gambling | None | |
| Chance-Based Activities | Contests | Frequent | Leaderboards rank drivers against each other. |
| Chance-Based Activities | Loot Boxes | No | |

Then choose **Override to Higher Age Rating → 18+**.

Also: **Made for Kids: No.**

## Other App Store Connect answers

| Question | Answer |
| --- | --- |
| Primary language | English (U.K.) |
| Price | Free |
| In-app purchases | None |
| Content rights: does the app contain, show or access third-party content? | Yes. Usernames chosen by users (licensed to us under the Terms of Use, section 5) and Apple Maps (MapKit). |
| Sign-in required for review | No. See `docs/APP_REVIEW_NOTES.md`. |
| Availability | Every storefront **except** the 27 EU member states, plus Iceland, Liechtenstein and Norway (see `docs/LAUNCH.md`). |
| App Privacy | `docs/APP_PRIVACY_LABELS.md` |
| Export compliance | Uses only exempt encryption (`ITSAppUsesNonExemptEncryption` is false in `app.json`). |
