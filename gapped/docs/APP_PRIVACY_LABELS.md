# App Store Connect: App Privacy answers (v1.0.0)

The answer sheet for App Store Connect → the app → **App Privacy**, question by question. Every
answer is derived from what build 5 actually sends off the phone, with the place in the code
that does it, so any answer can be checked rather than trusted. Apple's definitions are quoted
where a choice depended on them (developer.apple.com/app-store/app-privacy-details).

`app.json`'s privacy manifest (`expo.ios.privacyManifests.NSPrivacyCollectedDataTypes`) must
declare exactly the same set. The JSON is at the end of this file.

Baseline for v1: **no Sentry and no PostHog.** Their keys are blank, so neither SDK initialises
(`src/lib/observability.ts`) and nothing about crashes, performance or usage leaves the phone.
**The day either key is set, this sheet, the manifest and `docs/PRIVACY.md` must change first**
(see "If this changes" below).

---

## Data collection

**Do you or your third-party partners collect data from this app?** **Yes.**

## Tracking

**Is data used to track users?** **No.**

Apple: "Tracking refers to linking data collected from your app about a particular end-user or
device … with Third-Party Data for targeted advertising or advertising measurement purposes, or
sharing data collected from your app … with a data broker." Gapped has no advertising SDK, never
requests the advertising identifier (no `ATTrackingManager`), and shares nothing with advertisers
or brokers. No App Tracking Transparency prompt; `NSPrivacyTracking` is `false`.

---

## Summary

| Category → data type | Collected | Linked to the user | Tracking | Purposes |
| --- | --- | --- | --- | --- |
| Location → **Precise Location** | Yes | Yes | No | App Functionality |
| Location → **Coarse Location** | Yes | Yes | No | App Functionality |
| Identifiers → **User ID** | Yes | Yes | No | App Functionality |
| Contacts → **Contacts** | Yes | Yes | No | App Functionality |
| User Content → **Other User Content** | Yes | Yes | No | App Functionality, Analytics |
| Health & Fitness → **Fitness** | Yes | Yes | No | App Functionality |

Everything else: **not collected** (list at the end).

"Linked" is Yes throughout because everything is stored against the account's id. The account is
anonymous (no email, no name), but Apple counts an account-level id as identity: data is unlinked
only if it is de-identified before collection, and none of this is.

App Functionality, in Apple's words, includes "prevent fraud, implement security measures":
that covers drive verification and rate limiting as well as the features themselves.

---

## Location → Precise Location

Collected · Linked · Not tracking · **App Functionality**

Latitude and longitude about once a second during a drive (well beyond three decimal places),
with speed, heading, altitude, accuracy and a simulated-location flag (`is_mock`; expo-location
reports it on Android only, so on iPhone it is always false). Uploaded to `drive_fixes` and the
untrimmed route to `drive_routes_private`; the trimmed route and the drive's summary to `drives`.
Raw points and the untrimmed route are purged 90 days after the drive started, whatever its
verification (migration 0021).

While the app is open and idle, positions are read to detect a drive starting, but they stay in
memory and are discarded unless a drive begins (`src/drive/engine.ts`, `recent`). Apple: "Data
that is processed only on device is not collected." Only recorded drives leave the phone.

*Source: `src/drive/recorder.ts`, `src/drive/backgroundTask.ts`, `src/lib/sync.ts`
(`drive_fixes` upsert); migrations 0001, 0002, 0003.*

## Location → Coarse Location

Collected · Linked · Not tracking · **App Functionality**

The driver's country, which decides their national board and is public. It is **chosen from a
list** (the phone's region is offered first), not read from location services. It is declared
anyway: Apple defines Coarse Location as "information that describes the location of a user …
with lower resolution than" three decimal places, and a country held against an account does
that, whoever typed it. Over-declaring costs nothing; under-declaring is a rejection.

*Source: `src/onboarding/place/`, `profiles.country`, `src/lib/sync.ts` (`pushIdentity`).*

## Identifiers → User ID

Collected · Linked · Not tracking · **App Functionality**

Apple: "screen name, handle, account ID, assigned user ID …". Two things qualify: the random
account id Supabase's anonymous sign-in assigns (`auth.users.id`, `profiles.id`), and the
**username**, a public handle. No email, phone number or password exists anywhere:
`signInAnonymously()` is the only sign-in path.

*Source: `src/lib/supabase.ts`, `profiles.username`.*

## Contacts → Contacts

Collected · Linked · Not tracking · **App Functionality**

Apple's definition is wider than the address book: "a list of contacts in the user's phone,
address book, **or social graph**." Gapped never reads the iPhone's contacts, but it does store a
social graph on the server: the drivers you follow (`friendships`, added by username in Friends)
and the drivers you hide (`blocks`). Both are lists of other users held against your account, so
they are declared here rather than as Other User Content.

*Source: `src/social/friends.ts` (`add_friend`, `list_friends`), migration 0006; `blocks`
(migration 0019, Hide driver).*

## User Content → Other User Content

Collected · Linked · Not tracking · **App Functionality, Analytics**

Apple: "any other user-generated content." What the driver enters, beyond the username:

- **Vehicles:** kind, make, model, year and the "modified" flag for the main vehicle and any
  extras (`vehicles`). App Functionality: drives are attributed to a vehicle.
- **Reports:** the reason chosen and the free-text details (up to 500 characters) when reporting
  another driver (`report_driver`). App Functionality: moderation.
- **Setup answers:** "What matters to your drive?" and "How did you hear about us?"
  (`onboarding_answers`). **Analytics:** they are used only to understand what drivers want and
  where they come from, which is Apple's Analytics purpose ("understand the effectiveness of
  existing product features, plan new features, or measure audience size or characteristics").
  They are not Product Interaction or Other Usage Data, which describe activity in the app
  (taps, launches, views); these are answers the driver gives about themselves.
- **Terms acceptance:** the time the driver agreed to the Terms of Use, stored with the setup
  answers (`onboarding_answers.terms_accepted_at`). App Functionality: the record of agreement.

Not uploaded, so not collected: the vehicle nickname and the car photo, which stay on the phone
(`src/state/profile.ts`, `src/onboarding/vehicle/vehiclePhoto.ts`).

*Source: `src/lib/sync.ts`, `src/onboarding/socialProof.ts`, migrations 0009, 0017, 0019
(`driver_reports`, `onboarding_answers.terms_accepted_at`).*

## Health & Fitness → Fitness

Collected · Linked · Not tracking · **App Functionality**

Apple: "Fitness and exercise data, **including but not limited to the Motion and Fitness API**."
Each drive's points carry readings from Core Motion, which is that API: user acceleration from
`DeviceMotion` (gravity removed, up to 10 Hz) and barometric pressure from the altimeter, the one
that raises the Motion & Fitness prompt. They are uploaded with the drive (`accel_x/y/z`,
`pressure_hpa` in `drive_fixes`) and used to check that a run is a real drive.

The readings describe a vehicle, not exercise, so "Other Data Types" was considered. Apple's
definition names the API rather than the purpose, though, and the app shows the Motion & Fitness
prompt, so a reviewer will look for this type. Declared here, and not also as Other Data.

*Source: `src/drive/recorder.ts` (`DeviceMotion`, `Barometer`), `src/lib/sync.ts`.*

---

## Not collected

Answer **No** to every other type. Each was checked:

| Type | Why not |
| --- | --- |
| Contact Info (name, email, phone, address, other) | Anonymous accounts. An email you send to support arrives outside the app. |
| Health; Fitness beyond the above | No HealthKit, no health data. |
| Financial Info, Purchases | No payments or in-app purchases in v1. |
| Sensitive Info | None. |
| User Content: Photos or Videos | The car photo never leaves the phone. Share cards are images the user sends through the share sheet themselves; Gapped does not upload them. |
| User Content: Audio, Gameplay, Emails or Text Messages | None. |
| User Content: Customer Support | Support is by email from the support web page, not through the app. |
| Browsing History, Search History | Searching the country and make lists happens on the phone. |
| Identifiers: Device ID | No advertising id, no IDFV upload. App Attest is not active in v1 (no native module, `src/lib/attestation.ts` returns null), so no device key is registered. |
| Usage Data: Product Interaction, Advertising Data, Other Usage Data | No analytics SDK initialised. |
| Diagnostics: Crash Data, Performance Data, Other Diagnostic Data | No crash reporter initialised. Crash reports Apple shares from users who opted in to "Share With App Developers" come from Apple, not the app, and are not declared by developers. |
| Surroundings, Body | None. |
| Other Data Types | Motion and barometer readings are declared as Fitness. |

IP addresses reach Supabase as part of any network request and sit in its short-lived logs. They
are not used to derive location or for any purpose beyond security, so Apple's labels do not ask
for them. The privacy policy still mentions them.

## Optional disclosure

None of the exceptions applies: everything above is part of the app's main function, collected
routinely, not "only in infrequent cases".

---

## The privacy manifest must say the same

`app.json` → `expo.ios.privacyManifests.NSPrivacyCollectedDataTypes` must be exactly this
(the SETTINGS workstream owns `app.json`). Keep `NSPrivacyTracking: false`, an empty
`NSPrivacyTrackingDomains` and the three `NSPrivacyAccessedAPITypes` entries as they are.

```json
[
  {
    "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypePreciseLocation",
    "NSPrivacyCollectedDataTypeLinked": true,
    "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
  },
  {
    "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeCoarseLocation",
    "NSPrivacyCollectedDataTypeLinked": true,
    "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
  },
  {
    "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeUserID",
    "NSPrivacyCollectedDataTypeLinked": true,
    "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
  },
  {
    "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeContacts",
    "NSPrivacyCollectedDataTypeLinked": true,
    "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
  },
  {
    "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeOtherUserContent",
    "NSPrivacyCollectedDataTypeLinked": true,
    "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": [
      "NSPrivacyCollectedDataTypePurposeAppFunctionality",
      "NSPrivacyCollectedDataTypePurposeAnalytics"
    ]
  },
  {
    "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeFitness",
    "NSPrivacyCollectedDataTypeLinked": true,
    "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
  }
]
```

No `NSPrivacyCollectedDataTypeOtherDataTypes`, `CrashData`, `PerformanceData` or
`ProductInteraction` entry: nothing in v1 collects them.

## If this changes

| Change | What else must change |
| --- | --- |
| `EXPO_PUBLIC_SENTRY_DSN` set | Diagnostics → Crash Data and Performance Data (not linked, App Functionality) here and in the manifest; a "crash reporting" section and Sentry as a recipient in `docs/PRIVACY.md`; remove "no crash reporting" from the listing, review notes and support page. |
| `EXPO_PUBLIC_POSTHOG_API_KEY` set | Usage Data → Product Interaction (Analytics; linked if `identify()` is ever called) here and in the manifest, PostHog as a recipient and its region in the policy, and the same copy changes. |
| App Attest switched on | Identifiers → Device ID (App Functionality) here and in the manifest; the policy's account section. |
| Photos uploaded (car photo, avatar) | User Content → Photos or Videos, a storage bucket that account deletion empties (migration 0011's note), and the policy. |
| In-app purchases | Purchases, Financial Info as the payment flow requires, and the policy. |
