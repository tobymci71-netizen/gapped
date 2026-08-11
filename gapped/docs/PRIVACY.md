# Gapped — Privacy Policy

> **DRAFT FOR REVIEW — NOT LEGAL ADVICE.**
>
> Written by reading what the code actually does, not what the product intends.
> Toby must review it, and it should be checked by someone qualified before it
> is published: it makes representations about background location and
> international transfers, which are the two areas regulators actually look at.
>
> Last derived from the codebase: migrations `0001`–`0013`.
> Placeholders marked `TODO(toby)` must be filled before publication.

**Effective date:** TODO(toby)
**Controller:** TODO(toby) — legal name and address of the data controller
**Contact:** TODO(toby) — a monitored address for privacy requests

---

## 1. What this app is

Gapped records car and motorbike journeys using your phone's GPS and motion
sensors, and ranks them on public leaderboards. Recording location precisely,
including while the app is in the background, is the core function rather than
an optional extra.

## 2. You are not asked who you are

Gapped signs you in **anonymously**. There is no email address, no password, no
phone number and no social login. Your account is a random identifier generated
on your device the first time you open the app.

Practically:

- We cannot email you, because we do not have an address for you.
- We cannot recover your account if you delete the app, because there is
  nothing to recover it with.
- Your data is **pseudonymous, not anonymous**: it is all linked to that random
  identifier, and your chosen username is shown publicly on leaderboards.

## 3. What is collected

Everything below is collected because a feature needs it. Nothing is collected
for advertising, and nothing is sold.

### Location — precise, including in the background

| Data | Why |
| --- | --- |
| Latitude and longitude, several times per second during a drive | Route, distance and speed |
| Speed, heading, altitude, GPS accuracy | The recorded drive and its verification |
| The complete route geometry of each drive | Map display and server-side verification |

Background collection happens **only while a drive is recording** — one you
started, or one automatic detection started from sustained motion. It is not
continuous. Recording stops when the drive ends.

Precise location is the most sensitive thing Gapped holds. A route history
shows where you live, work, and go.

### Motion

Accelerometer readings (gravity excluded) sampled alongside GPS, used to check
that a run is a real drive rather than a spoofed location.

### Vehicle and profile

Username, country, unit preference, vehicle make, model, year and published
specification figures. Username and country are **public** — they appear beside
your runs on leaderboards.

### Device integrity

An App Attest / Play Integrity key identifier and attestation, used to confirm
runs come from genuine hardware. This is not an advertising identifier and is
not used for tracking.

### Diagnostics

Crash reports and anonymous product analytics. **Coordinates, route geometry,
tokens, account identifiers and email-shaped strings are stripped on the device
before any diagnostic leaves it** (see `src/lib/scrub.ts`). Analytics are not
linked to your account: the app never calls PostHog's `identify()`.

### What is NOT collected

No contacts, photos, microphone, health data, advertising identifiers,
browsing history, or payment information. No third-party advertising or
tracking SDKs are present.

## 4. Where it is stored

Data is held in **Supabase** (PostgreSQL) hosted in **London, United Kingdom**
(`eu-west-2`).

| Recipient | Purpose | Location |
| --- | --- | --- |
| Supabase | Database, authentication, serverless functions | UK (eu-west-2) |
| Sentry | Crash reporting (scrubbed before sending) | TODO(toby) — confirm the Sentry org's data region; EU hosting is available and should be preferred |
| PostHog | Anonymous product analytics | TODO(toby) — currently defaults to US hosting; EU hosting is available |

TODO(toby): if Sentry or PostHog remain US-hosted, the transfer needs a lawful
basis — in practice the UK IDTA or the UK Addendum to the EU SCCs. Choosing EU
or UK hosting for both is simpler than papering the transfer.

## 5. Legal bases

Gapped is operated from **Guernsey**, so the **Data Protection (Bailiwick of
Guernsey) Law, 2017** applies. For users in the United Kingdom, **UK GDPR** and
the Data Protection Act 2018 also apply. The two regimes are closely aligned;
where they differ, the stricter is applied.

| Purpose | Basis |
| --- | --- |
| Recording drives, showing leaderboards | Performance of a contract (Guernsey s.6(1)(b) / UK GDPR Art. 6(1)(b)) |
| Precise background location | **Consent**, given through the operating system permission prompt, withdrawable at any time in iOS Settings |
| Verifying runs, preventing spoofed entries | Legitimate interests — a leaderboard nobody trusts has no value |
| Crash reporting | Legitimate interests, minimised by on-device scrubbing |

Withdrawing location permission stops recording. It does not delete drives
already recorded — use deletion for that.

## 6. How long it is kept

| Data | Retention |
| --- | --- |
| Drives, GPS fixes, route geometry | Until you delete the drive or your account |
| Leaderboard entries | Until you delete your account, then removed |
| Profile | Until you delete your account |
| Crash reports | Sentry's retention, TODO(toby) — default is 90 days |

There is currently **no automatic expiry** of old drives. TODO(toby): decide
whether raw GPS fixes should expire — they are the most sensitive data held and
the least useful once a drive has been verified and summarised.

## 7. Your rights

Under both regimes you may request access, correction, erasure, restriction,
objection and portability.

**Erasure is built into the app and needs no request:** Settings → Delete
account. It removes your profile, every drive and GPS fix, your route
geometries, your leaderboard entries, your achievements and vehicles, and the
account itself — on the server and on the device. It is immediate, atomic and
cannot be undone. Leaderboard entries are **removed, not anonymised**: your runs
vacate the boards entirely.

For anything else, contact TODO(toby).

You may complain to the **Office of the Data Protection Authority, Bailiwick of
Guernsey** (odpa.gg), or to the **Information Commissioner's Office** (ico.org.uk)
if you are in the UK.

## 8. Children

Gapped is not intended for anyone under 17. It is about driving.

## 9. Public information

Your username, country, vehicle and verified run figures are visible to all
users on leaderboards. Your route geometry, GPS fixes and precise locations are
**never** shown to other users.

## 10. Changes

Material changes will be notified in the app before taking effect.

---

## Appendix: findings for Toby (remove before publishing)

Things the code review turned up that are product decisions, not policy text:

1. **`profiles.avatar_url` and `vehicles.photo_url` exist in the schema and are
   never written or read** — zero references outside the migrations. Nothing is
   collected into them today, so they are not a privacy issue, but they are
   columns that look like they hold user images. Either use them or drop them;
   an unused column that names a photo is a question at review time.
2. **No retention limit on raw GPS fixes.** They are the most sensitive data
   held and their value drops sharply once a drive is verified and summarised.
   An expiry job would reduce risk more than any wording here.
3. **Sentry and PostHog regions are unconfirmed.** Both default to US hosting.
   Both offer EU hosting. Choosing it removes an international-transfer problem
   rather than documenting one.
4. **There is no in-app link to this policy.** App Review requires a reachable
   privacy policy URL, and Settings has no row for it. That needs a hosted URL
   first — see BLOCKED ON TOBY.
