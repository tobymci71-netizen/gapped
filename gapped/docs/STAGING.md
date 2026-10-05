# Staging environment

**Status: prepared, not created** (as of v1.0.0). Everything in the repo is ready for a
second Supabase project. Creating it needs Toby — see [What Toby must do](#what-toby-must-do).

Why it was not created automatically: a new Supabase project is a billable
resource on Toby's account and counts against the free-tier project limit.
Creating one is not reversible in the way editing a file is, so it was left as
a decision rather than made on his behalf.

---

## Why staging exists

There is currently **one** Supabase project (`esyffuzecjvgddidfeph`) and it is
effectively production. That means:

- Every migration is tested against local Postgres and then applied straight to
  the environment real users depend on.
- There is nowhere to point a TestFlight build that is not production.
- A destructive migration has no rehearsal.
- `npm run verify:roundtrip` has nowhere to run except locally. It creates
  accounts and drives, so it must **never** run against production: they would
  appear on the live boards. Staging is where it can run against a real
  deployment.

The local stack (`npm run db:start`) covers most of this, but not everything:
Edge Functions behave differently deployed than served locally, auth flows
against `localhost` differ from a real domain, and nothing local exercises the
PostgREST/connection-pooler layer that production traffic goes through.

## What already separates the environments

Environment separation is **already implemented** — it just currently has one
destination.

| Layer | Mechanism | Where |
| --- | --- | --- |
| Build profile | `EXPO_PUBLIC_ENV` per profile (`development` / `staging` / `production`) | `eas.json` |
| Backend URL | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | EAS environment variables |
| Update channel | `channel` per profile | `eas.json` |
| Schema | Ordered migrations, applied with `supabase db push` | `supabase/migrations/` |
| Seed/reference data | Migrations (e.g. the 250 canonical countries in `0010`) | `supabase/migrations/` |

The `preview` build profile is already wired to `EXPO_PUBLIC_ENV=staging`. It
points at production today only because there is nowhere else to point it.

## Migration path

Migrations are ordered, idempotent where it matters, and have been run against a
fresh database repeatedly (`supabase db reset`), so a new project reaches the
current schema with one command. There is no drift to reconcile: the local
stack, production and any new project all derive from the same files.

```bash
supabase link --project-ref <STAGING_REF>
supabase db push          # applies every migration in order, 0001 to 0021
supabase functions deploy verify-drive attest-device decode-vin
```

`0013` seeds `app_releases` with `min_build = 1`, so a fresh staging project
does not accidentally block every client. `0021` enables `pg_cron` and schedules
the three retention jobs; check they exist on the new project (below).

## What Toby must do

1. **Create the project.** Supabase dashboard → New project. Same organisation.
   Name it `gapped-staging`. Choose the same region as production
   (`eu-west-2`) so latency measurements are comparable.

2. **Capture the credentials.** Project Settings → API gives the project URL and
   the anon key. Project Settings → Database gives the connection string.

3. **Apply the schema.** From the repo root, run the three commands above with
   the new project ref. Then re-link to production so a later `db push` does not
   go to the wrong place:

   ```bash
   supabase link --project-ref esyffuzecjvgddidfeph
   ```

   The last step matters. `supabase link` is sticky and there is no prompt
   before `db push` reaches production.

4. **Set the EAS environment variables** so `preview` builds stop pointing at
   production:

   ```bash
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<STAGING_REF>.supabase.co
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <STAGING_ANON_KEY>
   ```

5. **Set the Edge Function secrets** on staging — at minimum whatever
   `supabase/functions/.env` holds locally (App Attest keys, service role).

6. **Decide about data.** Staging should start empty. Do not copy production
   drives across: they are precise location histories belonging to real people,
   and a staging project is by definition the one with looser access. The
   privacy policy names the production project's processor and region; copying
   real data into another project would need the policy to say so.

## Verifying it worked

```bash
supabase db query --linked "select count(*) from countries"     # expect 250
supabase db query --linked "select platform, min_build from app_releases"
supabase db query --linked "select jobname from cron.job"       # the three gapped_purge_* jobs
npm run test:db                                                 # pgTAP, against the local stack
```

Then build `preview` and confirm the app talks to staging — the quickest check
is that the leaderboards are empty. Then run the round-trip against staging
(never production):

```bash
ALLOW_REMOTE=1 SUPABASE_URL=https://<STAGING_REF>.supabase.co \
  SUPABASE_ANON_KEY=<STAGING_ANON_KEY> npm run verify:roundtrip
```

The script refuses any host but localhost unless `ALLOW_REMOTE=1` is set. Set it
for staging only; with a staging service-role key in `SUPABASE_SERVICE_ROLE_KEY`
the checks that need one run too, and without it they are reported as SKIP.
