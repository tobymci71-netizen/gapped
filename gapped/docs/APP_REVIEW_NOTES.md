# App Review notes (v1.0.0, build 5)

Paste the block below into App Store Connect → the version → App Review Information → Notes.
Apple's limit is 4,000 characters; `site/test/listing.test.mjs` checks it.

Also in App Review Information: **Sign-in required: No** (there is no account to give), and the
owner's name, phone number and email address as the review contact.

Before pasting, confirm on the submitted build that every step below matches what is on screen.

<!-- field:review-notes max:4000 -->
```text
Gapped records car and motorbike drives with GPS and ranks verified results on public boards.

NO LOGIN
There is no sign-in. An anonymous account is created on first launch, so no demo account is needed.

TRYING IT WITHOUT DRIVING
1. Onboarding: choose a car, units and country, allow location (Always is optional), pick a username, then agree to the safety guidelines, confirm you are 18+ with a valid driving licence, and accept the Terms of Use.
2. Ranks tab: the public boards. They open on Distance, World, 7 days. Tap the ⋯ beside another driver (or press and hold the row) for Report driver and Hide this driver. If no other driver is listed, choose All-time.
3. Driving tab: tap Start drive while parked, then walk for a few minutes and tap End drive. The drive appears in your list; open it to see its stats, export GPX/CSV, share a card, or Delete drive. A short or slow drive may show as unverified; that is expected.
Automatic detection only starts a drive after more than 15 km/h for 30 seconds, so walking never triggers it. A drive also ends by itself after 3 minutes standing still.

WHY "ALWAYS" LOCATION
Location is recorded only during a drive: one started with Start drive, or by automatic detection while the app is open. Always access lets that drive continue when the screen locks or another app is in front, and iOS shows the location indicator while it records. Recording stops when the drive ends. Without Always, drives record only while the app is on screen. Gapped never tracks location between drives.

SAFETY
- Onboarding requires agreeing to the safety guidelines (obey traffic laws and speed limits, start and stop only when parked, use a phone holder, never touch the phone while driving) and confirming 18+ with a valid licence.
- The Ranks tab opens on Distance, not speed.
- A top speed above the ranking limit for the driver's country is never ranked publicly: the highest speed limit anywhere in that country (for example 70 mph in the UK, 85 mph in the US), or 130 km/h where the country has no general limit or no figure is on file. It stays in the driver's own history, marked "not ranked".
- Nothing prompts, rewards or notifies during a drive. Results appear only after it ends. The app sends no notifications.
- The Terms put top-speed and 0-60 runs on tracks and closed roads only.

USER-GENERATED CONTENT (GUIDELINE 1.2)
The only user content other drivers see is the username. Usernames are filtered on the server (format rules plus a denylist of profanity, slurs and reserved names). Any driver can be reported (offensive username, cheating, impersonation, other) or hidden from your boards; hidden drivers are managed in Settings > Hidden drivers. The Terms of Use, with zero tolerance for objectionable content and abusive users, are accepted during onboarding. The developer reviews reports within 24 hours and acts by resetting the username, removing results, hiding the driver from the boards or deleting the account.

ACCOUNT DELETION
You tab > Settings > Delete account. It deletes everything on the server and the device immediately. Single drives: open the drive > Delete drive.

NO PURCHASES, NO TRACKING
No in-app purchases, subscriptions or ads. No analytics, crash reporting or tracking, so there is no tracking prompt.

Privacy: https://tobymci71-netizen.github.io/gapped/privacy/
Terms: https://tobymci71-netizen.github.io/gapped/terms/
Support: https://tobymci71-netizen.github.io/gapped/support/
```
