# App Store Connect — App Privacy answers

> **DRAFT FOR REVIEW.** Derived from what the code collects, not from what the
> product intends to collect. Every row cites where it happens so any answer can
> be checked rather than trusted.
>
> Fill this in at App Store Connect → your app → App Privacy.

---

## Question 1: Do you or your third-party partners collect data from this app?

**YES.**

## Question 2: Is data used to track users?

**NO.**

"Tracking" in Apple's sense means linking user or device data with third-party
data for advertising or measurement, or sharing it with a data broker. Gapped
does neither: there are no advertising SDKs, no advertising identifier is
requested (no `ATTrackingManager`), and no data is shared with brokers. PostHog
receives anonymous product analytics that are never joined to third-party data.

Consequence: **no App Tracking Transparency prompt is required**, and
`NSPrivacyTracking` is `false` in the privacy manifest.

---

## Data types collected

For each: **Linked** means tied to the user's identity — which, in this app,
means tied to their (anonymous) account.

### Location → Precise Location

| Field | Answer |
| --- | --- |
| Collected | **Yes** |
| Linked to identity | **Yes** |
| Used for tracking | No |
| Purposes | **App Functionality** |

GPS coordinates, speed, heading, altitude and accuracy, several times per
second during a drive, including in the background. Stored in `drive_fixes` and
`drive_routes_private` against the user's `profile_id`.

*Source: `src/drive/recorder.ts`, migration `0001`.*

### Location → Coarse Location

| Field | Answer |
| --- | --- |
| Collected | **Yes** |
| Linked to identity | **Yes** |
| Used for tracking | No |
| Purposes | **App Functionality** |

The user's country, used to scope national leaderboards. **Chosen by the user
from a picker, not derived from the device** — declared anyway because it is
country-level location data held against the account, and under-declaring is
the failure mode that gets apps rejected.

*Source: `src/data/countries.ts`, `profiles.country`.*

### Identifiers → User ID

| Field | Answer |
| --- | --- |
| Collected | **Yes** |
| Linked to identity | **Yes** |
| Used for tracking | No |
| Purposes | **App Functionality** |

A random account UUID from Supabase anonymous auth, plus the user's chosen
username. **No email address, phone number or password is ever collected** —
`signInAnonymously()` is the only sign-in path.

*Source: `src/lib/supabase.ts`.*

### Identifiers → Device ID

| Field | Answer |
| --- | --- |
| Collected | **Yes** |
| Linked to identity | **Yes** |
| Used for tracking | No |
| Purposes | **App Functionality** |

An App Attest / Play Integrity key identifier, used to confirm a run came from
genuine hardware. Not an advertising identifier and not usable as one.

*Source: `src/lib/attestation.ts`, `device_attestations`.*

### Usage Data → Product Interaction

| Field | Answer |
| --- | --- |
| Collected | **Yes** |
| Linked to identity | **No** |
| Used for tracking | No |
| Purposes | **Analytics** |

Anonymous PostHog events. Unlinked because the app **never calls
`identify()`** — PostHog holds a device-scoped id with no path back to a Gapped
account.

> If `identify()` is ever added, this answer becomes **Linked**, and
> `app.json`'s privacy manifest must change with it. That coupling is noted in
> `src/lib/observability.ts`.

*Source: `src/lib/observability.ts`.*

### Diagnostics → Crash Data

| Field | Answer |
| --- | --- |
| Collected | **Yes** |
| Linked to identity | **No** |
| Used for tracking | No |
| Purposes | **App Functionality** |

Sentry crash reports. Unlinked because coordinates, route geometry, tokens and
account identifiers are stripped **on the device before send**.

*Source: `src/lib/scrub.ts`, 10 tests in `src/lib/__tests__/scrub.test.ts`.*

### Diagnostics → Performance Data

Same answers as Crash Data. Sentry performance traces, sampled at 10%.

### User Content → Other User Content

| Field | Answer |
| --- | --- |
| Collected | **Yes** |
| Linked to identity | **Yes** |
| Used for tracking | No |
| Purposes | **App Functionality** |

Vehicle make, model, year and specification figures.

*Source: `vehicles` table, `src/vehicles/`.*

---

## Data types NOT collected

Answer **No** to all of these. Each was checked rather than assumed:

Contact Info (no email, phone, name or address — anonymous auth) · Health &
Fitness · Financial Info · Contacts · User Content → Photos or Videos, Audio,
Customer Support, Emails or Text Messages · Browsing History · Search History ·
Sensitive Info · Purchases · Advertising Data · Other Diagnostic Data

---

## Findings worth Toby's attention

**Two schema columns look like they collect images and do not.**
`profiles.avatar_url` and `vehicles.photo_url` exist in migration `0001` and
have **zero references** anywhere outside the migrations — nothing writes them,
nothing reads them. So "Photos or Videos" is correctly answered **No** today.

This is worth deciding rather than leaving: a reviewer reading the schema sees
columns named for user images. Either wire them up (and change this document
and the privacy manifest), or drop them in a migration. Leaving them is the
option that creates a question with no answer.

**Coarse Location is declared for a user-entered value.** Country comes from a
picker, not from the device. It is declared because it is country-level
location held against an account, and Apple's guidance treats
under-declaration far more harshly than over-declaration. If Toby disagrees, it
is a defensible removal — but it should be a decision, not an oversight.
