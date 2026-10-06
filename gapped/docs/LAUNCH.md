# Launch checklist (v1.0.0, build 9)

The owner's list for the first App Store release, in order. Each step says what "done" looks
like. The steps before App Store Connect matter most: App Review opens the privacy and support
links, and a dead link is a rejection.

**Status on 5 October 2026.** Already done, and verified:
- Section 3: the pages are live at `https://tobymci71-netizen.github.io/gapped/` (draft build, so
  they say "Contact address coming soon" until section 1 is done and they are republished).
- Section 5 steps 1–4 and 6: migrations 0018–0021 pushed (the cloud is at 0021), verify-drive v4,
  decode-vin v2 and attest-device deployed, the three retention jobs scheduled, no
  `country_number_one` rows. Step 5 was not needed: the only real drive (m061087, 31 mph) is under
  every limit. The 21 test accounts (buddy_*, vin_*, the nameless ones) were deleted; tobym, toby,
  gayahhnga and m061087 remain.
- Section 6: build 1.0.0 (8), uploaded to App Store Connect on 6 October 2026: every vehicle
  is a liveried 3D render (docs/VEHICLE_ART.md), lit so dark paints read as their colour, on
  top of build 6's Nightrun redesign. Archived locally in Xcode (not EAS) after
  `npm run check:release` passed. It replaces build 7 as the launch candidate.

Still open for the owner: sections 1, 4, 5 step 7 (Email provider off), 7, 8 and 9.

---

## 1. Choose the contact address

- [ ] Pick a mailbox you will check every day. It is published on the web pages, so expect spam.
      Nothing in the app contains it: the app's "Contact us" and "Leave feedback" open the
      support page, which shows it, so the address can change later without an app release.
- [ ] Put it in `site/site.config.json` as `contactEmail`, and set `effectiveDate` to the day the
      pages go live (`YYYY-MM-DD`).

## 2. Build the web pages

From the `gapped` folder, with `node_modules` installed (the acknowledgements page reads the
licence files there; nothing is downloaded):

```sh
node scripts/build-legal-pages.mjs && node scripts/build-acknowledgements.mjs
```

This writes `site/dist/`: the landing page, `privacy/`, `terms/`, `support/`,
`acknowledgements/` and `.nojekyll`. `site/dist/` is not committed (`dist/` is in `.gitignore`).

- The build **stops** if `contactEmail` is empty. To read the pages before the address is
  decided, run `node scripts/build-legal-pages.mjs --draft`: the pages say "Contact address
  coming soon", carry a draft banner and ask search engines not to index them. Never publish a
  draft build.
- Check the build: `node --test site/test/*.test.mjs` (the converter, the placeholder rules, the docs'
  hygiene and the App Store field lengths).
- [ ] Open `site/dist/index.html` in a browser and read every page, on a phone too, in light and
      dark mode.

## 3. Publish to GitHub Pages

The links in the app (`src/config/links.ts`) are
`https://tobymci71-netizen.github.io/gapped/{privacy,terms,support,acknowledgements}/`, served
from the repository's `gh-pages` branch. GitHub Pages on a free account needs the repository to
be public, which it is.

The first time, from the repository root (the folder that holds `gapped/`):

```sh
git worktree add --orphan -b gh-pages ../gapped-pages
cp -R gapped/site/dist/. ../gapped-pages/
cd ../gapped-pages
git add -A
git commit -m "Publish the Gapped web pages"
git push -u origin gh-pages
```

Then on GitHub: the repository → **Settings → Pages → Build and deployment → Source: Deploy from
a branch → Branch: `gh-pages`, folder `/ (root)` → Save.**

Every later update (after rebuilding in step 2):

```sh
cd ../gapped-pages
git rm -rq --ignore-unmatch .
cp -R ../overnight-build/gapped/site/dist/. .
git add -A
git commit -m "Update the Gapped web pages"
git push
```

(Adjust `../overnight-build/gapped` to wherever the repository is checked out.)

- [ ] All four URLs load on a phone, over mobile data, and show the real contact address.

## 4. Legal and admin

These are the owner's decisions; `docs/DPIA.md` explains each.

- [ ] **UK representative.** UK GDPR Article 27 asks a controller outside the UK that serves
      people in the UK to appoint a UK representative, unless the processing is occasional and
      low-risk. Location tracking is neither. Appoint one, or take advice, before launch. A
      representative's name and address go in `docs/PRIVACY.md` ("Which laws apply") before the
      pages are published.
- [ ] **Register with the ODPA** (odpa.gg) as a controller and pay any fee due.
- [ ] **Supabase data processing agreement** accepted in the dashboard, copy kept.
- [ ] **Supabase region** confirmed as London (`eu-west-2`): Dashboard → Project Settings →
      General. The privacy policy says London.
- [ ] **DPIA** (`docs/DPIA.md`) completed and signed.
- [ ] Read the Privacy Policy and Terms of Use as published. If anything in them is not how you
      run Gapped, change the document, not the practice, before launch.

## 5. Backend

The lead pushes these; the owner checks them. **In this order**: the new verify-drive reads
`drives.fixes_purged_at`, which only exists once 0021 is applied, and the first nightly purge
deletes raw GPS points that the re-verification in step 5 needs.

1. [ ] **Read-only checks on the cloud project first** (`supabase db query --linked "..."`).
   Each must come back empty or as noted, or the push aborts part-way:
   - `select id, username from public.profiles where username is not null and username !~ '^[a-z0-9_]{3,20}$';`
     must be empty (0019 refuses to apply otherwise). Clear any with
     `update public.profiles set username = null where id = '...';`
   - `select id, make, model from public.vehicles where not (char_length(make) between 1 and 80 and char_length(model) between 1 and 80 and make !~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]' and model !~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]');`
     must be empty.
   - `select p.oid::regprocedure, p.proowner::regrole from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proowner <> 'postgres'::regrole and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');`
     must be empty (0018's privilege audit fails the push otherwise).
   - `select name, installed_version from pg_available_extensions where name = 'pg_cron';`
     must list pg_cron (0021 schedules the retention jobs with it).
   - Note the numbers these give, for the record:
     `select count(*) from public.achievements where kind = 'country_number_one';` (0020 deletes
     them) and `select count(*) from public.drives where started_at < now() - interval '90 days';`
     (the first 03:10 UTC purge deletes their raw points and untrimmed routes).
2. [ ] `supabase db push`, then `supabase migration list --linked` shows every migration up to
   `0021`. Read the NOTICE output: 0019 lists any existing username or make the denylist
   already covers. Clear those names (`supabase/snippets/moderation.sql`, section 4).
3. [ ] `supabase functions deploy verify-drive attest-device decode-vin`.
4. [ ] Run `delete from public.achievements where kind = 'country_number_one';` once more: the old
   verify-drive could grant one between the push and the deploy.
5. [ ] **Before 03:10 UTC on the night after the push**, re-verify every existing drive, so a top
   speed above its country's ranking limit leaves the public boards: call verify-drive with the
   service-role key (`Authorization: Bearer <service role key>`, body `{"drive_id": "..."}`) for
   each id from `select id from public.drives where fixes_purged_at is null;`. Service calls skip
   the rate limit. A drive purged before it is re-verified still loses an over-limit top speed
   (verify-drive checks its stored figure), but re-verifying first is cleaner. To hold the purge
   back until this is done: `select cron.unschedule('gapped_purge_drive_raw_data');`, then
   `select public.schedule_retention_jobs();` afterwards.
6. [ ] The retention jobs are scheduled: `select jobname, schedule, username, active from cron.job
   where jobname like 'gapped\_%';` lists `gapped_purge_drive_raw_data`,
   `gapped_purge_rate_limits` and `gapped_purge_anonymous_users`, owned by `postgres`. The
   privacy policy promises what they do. `supabase/snippets/retention.sql` runs or reschedules
   them by hand.
7. [ ] Dashboard → Authentication → Sign In / Providers → **Email: off** (matches
   `[auth.email] enable_signup = false` in `supabase/config.toml`). Leave "Allow new users to
   sign up" on: anonymous sign-in needs it.
8. [ ] **Never run `npm run verify:roundtrip` against the production project.** It creates test
   accounts and drives, and they would appear on the live boards. It refuses remote hosts
   unless `ALLOW_REMOTE=1` is set: never set it for production.

## 6. The build

- [ ] `app.json`: `version` `1.0.0`, `ios.buildNumber` `6`. With `appVersionSource: "remote"` EAS
      keeps its own build counter: check it with `eas build:version:get -p ios` before building.
- [ ] Production environment on EAS (`eas env:list --environment production`):
      `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set;
      **`EXPO_PUBLIC_SENTRY_DSN` and `EXPO_PUBLIC_POSTHOG_API_KEY` not set.** The privacy policy
      says there is no crash reporting and no analytics. Setting either key makes it untrue
      (`docs/APP_PRIVACY_LABELS.md`, "If this changes"). The production profile's pre-install
      check (`scripts/check-build-env.mjs`, also `npm run check:release` locally) stops a release
      build that breaks these rules.
- [ ] The privacy manifest in `app.json` matches `docs/APP_PRIVACY_LABELS.md` exactly.
- [ ] `eas build --profile production --platform ios`, then `eas submit` to TestFlight.

## 7. Check the TestFlight build on a phone

- [ ] Onboarding: the safety step needs the guidelines, 18+ with a licence, and the Terms; the
      Terms link opens the published Terms.
- [ ] Settings: Privacy Policy, Terms of Use, Contact us, Leave feedback and Acknowledgements all
      open the published pages. Nothing opens an email app.
- [ ] Settings shows the Account ID, Change username, Country and Hidden drivers.
- [ ] Ranks opens on Distance. Report driver and Hide driver work on another driver.
- [ ] On production, the World · All-time Distance board lists at least one real driver besides
      a brand-new account (yours counts). App Review signs in fresh, and with nobody else on the
      board it cannot find Report or Hide, which Guideline 1.2 requires it to see.
- [ ] Nothing mentions Pro, plans or prices anywhere.
- [ ] A drive with the screen locked keeps recording and shows the location indicator.
- [ ] With a throwaway account, not the one whose drives keep the board above populated: delete
      a drive, then Delete account, and confirm on the server that the rows are gone.
- [ ] Every step in `docs/APP_REVIEW_NOTES.md` matches what is on screen. Fix the notes if not.

## 8. App Store Connect

- [ ] **App Privacy:** answer from `docs/APP_PRIVACY_LABELS.md`, then publish.
- [ ] **Age rating:** answer from `docs/APP_STORE_LISTING.md`, then Override to Higher Age
      Rating: 18+.
- [ ] **Product page:** name, subtitle, promotional text, description, keywords, What's New,
      categories (Navigation, then Utilities), support and privacy URLs, copyright, all from
      `docs/APP_STORE_LISTING.md`.
- [ ] **Availability:** Pricing and Availability → untick every EU member state (27) and Iceland,
      Liechtenstein and Norway. Decide on Switzerland (`docs/DPIA.md`, open point 4). The privacy
      policy says Gapped is not offered in the European Economic Area.
- [ ] **Screenshots:** show the Distance board and the drive summary. No screenshot that presents
      speed on a public road as a competition, and nothing about Pro.
- [ ] **App Review Information:** paste `docs/APP_REVIEW_NOTES.md`, sign-in not required, your
      contact details.
- [ ] Submit for review.

## 9. From launch day

- [ ] **Moderation every day** (`docs/MODERATION.md`), starting the day you submit: App Review may
      file a test report.
- [ ] Check the contact mailbox every day. Data requests are answered within one month.
- [ ] When `docs/PRIVACY.md` or `docs/TERMS.md` changes: update `effectiveDate`, rebuild and
      republish the pages, and tell users in the app if the change matters to them.
