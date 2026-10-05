# Data protection impact assessment (draft)

**Status:** draft for the owner to review, complete and sign before launch. Not legal advice.
**Controller:** Toby Mcintosh, Guernsey. **Processing:** the Gapped iOS app, v1.0.0, and its
Supabase backend.

Why one is needed: Gapped processes **precise location**, systematically, including in the
background, and **publishes** results derived from it. Under UK GDPR a DPIA is required for
processing likely to result in a high risk, and the ICO's list of such processing includes
tracking a person's location. The Guernsey law requires the same for high-risk processing. Doing
one is cheap; being asked for one and not having it is not.

---

## 1. The processing

| | |
| --- | --- |
| Purpose | Record drives, verify them, rank results on public boards |
| People | Drivers aged 18+ who install the app (UK, Guernsey and other non-EU storefronts) |
| Data | Precise location and motion during drives; username, country, unit preference; vehicles; setup answers and Terms acceptance; follows, blocks, reports; technical logs. Full list: `docs/PRIVACY.md` |
| Public | Username, country, unit preference, account creation date, results with the day of each drive, verification state, vehicle class, Account ID |
| Not public | Routes and GPS points, motion data, times of day, make, model, VIN, nickname, photo, setup answers, follows, blocks, reports, achievements |
| Recipients | Supabase (processor, London); NHTSA vPIC (VIN only, on request); Apple (map tiles); GitHub (web pages) |
| Retention | Raw points and untrimmed route: 90 days after the drive, checked or not. Summaries and trimmed route: until deleted. Abandoned empty accounts: 30 days. Rate limits: 2 days. (`supabase/migrations/0021_retention.sql`) |
| Lawful basis | Contract for the core service; legitimate interests for verification, moderation, safety safeguards, setup answers |

## 2. Necessity and proportionality

- **Precise location is the product.** Distance, speed and 0–60 cannot be measured without it.
  It is collected only during a drive; between drives nothing is recorded (positions read to
  detect a drive stay in memory and are discarded).
- **Raw points are kept only as long as verification needs them.** 90 days, then deleted; the
  drive keeps its summary and trimmed route.
- **Identity is minimal.** Anonymous accounts: no name, email, phone or password.
- **Publication is limited to what a ranking needs.** Routes are never published; dates are cut
  to the day; drivers are ranked one row each, not drive by drive; small counts (under 10, or 5
  for vehicle makes) are withheld so an aggregate cannot point at one person.
- **No secondary use.** No analytics, advertising, tracking, crash reporting or sale.

## 3. Risks and measures

| Risk to people | Likelihood / severity before measures | Measures | Residual |
| --- | --- | --- | --- |
| Someone learns where a driver lives or works from their routes | Likely / severe | Routes never public; the untrimmed route has no client access (`drive_routes_private`); shared routes trimmed 1.0–1.7 miles at each end with a server-side salt; raw points deleted after 90 days | Low |
| Someone learns when a named driver was out driving | Possible / moderate | Board dates cut to the UTC day; direct reads of `leaderboard_entries` revoked (0020); "drove yesterday" counts withheld below 10 | Low |
| Public speed rankings encourage dangerous driving, harming the driver and others | Possible / severe | Ranks open on Distance; top speeds above the highest speed limit in the country never ranked (`supabase/functions/_shared/speedLimits.ts`); no "fastest in country" award; no in-drive prompts or notifications; safety acknowledgement, 18+ and Terms in onboarding; Terms limit speed runs to tracks and closed roads | Medium. This is the main residual risk and it is a product decision; review it with real data after launch |
| Public data used as evidence of speeding | Possible / moderate | Over-limit speeds are not published; the Terms say measurements are not reliable for legal use; dates only to the day | Low |
| Children use the app | Possible / moderate | 18+ in Terms and onboarding; 18+ App Store rating; accounts deleted on report | Low (self-declaration only) |
| Offensive or impersonating usernames harm other people | Likely / moderate | Server-side filter; report and hide; owner review within 24 hours (`docs/MODERATION.md`) | Low, if the daily check is kept |
| A data subject request is made by someone other than the account holder | Possible / moderate | Account ID alone is not accepted as proof (it is public in board data); ownership shown in the app, e.g. by changing the username to a code | Low |
| Breach of the database | Unlikely / severe | RLS on every table, explicit grants (0007, 0018), service key only in edge functions, TLS, no secrets in the app | Low |
| Data reaches the US through Supabase's support access | Possible / low | Supabase DPA with transfer safeguards; data stored in London | Low |
| Lost phone or removed app leaves an account that cannot be reached | Likely / low | Deletion by email after checking the account has gone quiet; empty accounts purged after 30 days | Low |

## 4. Open points for the owner

1. **UK representative (UK GDPR Article 27).** A controller outside the UK that offers a service
   to people in the UK must appoint a representative in the UK unless its processing is
   occasional and unlikely to be a risk. Systematic location processing is neither. Guernsey is
   outside the UK. Decide before launch: appoint a UK representative service, or take advice on
   whether the exemption applies.
2. **Registration with the ODPA.** Controllers established in the Bailiwick must register with
   the Office of the Data Protection Authority and pay any fee due. Check the category and fee at
   odpa.gg.
3. **Supabase data processing agreement.** Accept it in the Supabase dashboard (organisation
   settings, legal documents) and keep a copy. Confirm the project region is London (eu-west-2).
4. **EU, EEA and Switzerland.** v1 is not offered in the EU or EEA, so no EU representative is
   named. Switzerland's data protection law can also require a representative for foreign
   controllers; decide whether to leave the Swiss storefront unticked too.
5. **Breach procedure.** Write down who to tell and how fast: the ODPA must be told of a
   reportable breach within 72 hours, and the ICO for UK users on the same clock.

## 5. Sign-off

| | |
| --- | --- |
| Assessed by | |
| Date | |
| Decision | Proceed / proceed with changes / do not proceed |
| Review | After launch, when the first month of real data shows how the boards are used, and before any new data use (analytics, crash reporting, photos, payments) |
