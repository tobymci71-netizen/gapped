# Moderation runbook

The promise, made in the Terms of Use (section 7), the support page and the App Review notes:
**every report is reviewed and acted on within 24 hours.** App Review Guideline 1.2 requires it
of any app that shows user content, and Apple tests it. This is how the owner keeps it.

What the app gives users, and the server does on its own (migrations 0019, 0020):

- **Username filter.** The server refuses a username outside `^[a-z0-9_]{3,20}$` or matching the
  denylist (`blocked_terms`); the app treats that like a taken name and asks for another.
  Vehicle makes are checked against the profanity and slur terms. A driver whose new make is
  refused is told in the Garage tab that drives in that car cannot upload, and to contact
  support: if the make is a real one, add it as an `allow_make` term (snippets section 7) and
  the app's next sync goes through.
- **Report driver.** Writes a row to `driver_reports` (reason: `offensive_username`,
  `cheating`, `impersonation` or `other`; up to 500 characters of details). At most 10 reports
  per reporter per 24 hours; one open report per reporter per driver.
- **Hide driver.** A private block (`blocks`): the driver disappears from that user's boards and
  friends list. Nothing for the owner to do.
- **Hidden by the owner** (`moderation_hidden`): the driver disappears from every board, bracket
  count, friends list and make count, for everyone. Reversible.

What only the owner can do is everything below. There is **no notification** when a report
arrives in v1, so the daily check is the only way reports get seen.

---

## Every day

Set a recurring reminder at a fixed time. One check every 24 hours is the minimum: a report filed
a minute after today's check waits until tomorrow's. Checking morning and evening gives slack.

1. **Open the queue.** Supabase dashboard → project `gapped` → SQL Editor. Run section 1, "Open
   reports, oldest first", of `supabase/snippets/moderation.sql`. Its placeholders (`'PROFILE_ID'`,
   `'REPORT_ID'`) are not valid ids, so a query run before you replace them fails rather than
   acting on the wrong row. Without the snippet:

   ```sql
   select r.id, r.created_at,
          round(extract(epoch from now() - r.created_at) / 3600) as hours_open,
          r.reason, r.reported_username, p.username as username_now,
          r.reported_id, r.details
   from public.driver_reports r
   left join public.profiles p on p.id = r.reported_id
   where r.status = 'open'
   order by r.created_at;
   ```

2. **Work oldest first.** Anything near 24 hours goes first.

3. **Look at the driver** before deciding: their current username, how many reports they have
   (open and closed), when the account was made, and their recent results. Section 2 of the
   snippet, "A reported driver, in context", shows their board presence and recent drives. Read
   only what the decision needs.

4. **Decide** (table below), **act** (SQL below), then **close the report** (section 6,
   "Resolve a report", which can also close every open report on one driver at once):

   ```sql
   update public.driver_reports
   set status = 'actioned',            -- or 'dismissed'
       resolved_at = now(),
       resolution = 'username cleared, term added'   -- short and factual
   where id = '<report id>';
   ```

   Close every open report about the same driver that the action covers.

5. **Log it** (see "The log").

6. **Reply** to any email about it: a report someone also emailed, or an appeal. Reports made in
   the app carry no contact details (the reporter is only an Account ID and a username), so there
   is nobody to reply to unless they wrote in.

Once a week, also run section 8, "Who hides whom": drivers hidden by several people are worth a
look even when nobody has reported them.

If you will be away from a computer for more than a day, decide before you go who covers it.
Anyone covering needs dashboard access and must keep what they see confidential. There is no
safe way to pause reports.

---

## Deciding

Zero tolerance means acting on anything that breaks the Terms, not acting on everything
reported. A report is a claim; check it.

| Report | What you find | Action |
| --- | --- | --- |
| Offensive username | Slur, hate, sexual, threatening or harassing | Hide the driver, block the term, clear the username. If it is their second time, delete the account. |
| Offensive username | Crude but minor | Hide the driver, block the term, clear the username; unhide once they have a new name. |
| Offensive username | Not offensive (misread, a real place or word) | Dismiss. If the denylist would wrongly catch it, add it as an `allow` term (`allow_make` if it is only a make). |
| Impersonation | A real person, a brand, or "Gapped" staff | Hide the driver, block that exact name (`reserved`), clear the username; unhide once they have a new name. |
| Cheating | Results that a real drive could not produce, or a pattern of them | Remove the drive's results (below). Repeated or blatant: hide the driver. |
| Cheating | Fast but plausible | Dismiss. The server has already checked the drive; a top speed above the highest limit in the country is never ranked anyway. |
| Other | Read the details | Apply the Terms (section 6). Threats of violence: keep the evidence and consider reporting to the police. |
| Any | The reporter is filing false or abusive reports | Dismiss them; repeated, treat it as abuse under the Terms (section 6). |

Suspending a driver means hiding them. Ending an account means deleting it.

---

## Actions

Run in the SQL Editor (it runs as `postgres`). Prefer the numbered sections of
`supabase/snippets/moderation.sql`: hide (3), clear a username (4), delete an account (5),
resolve (6) and the denylist (7). The SQL here is the same thing written out, for when you need
to vary it.

### Hide a driver from every board (suspend)

```sql
insert into public.moderation_hidden (profile_id, reason)
values ('<account id>', 'offensive username, report <id>')
on conflict (profile_id) do update set reason = excluded.reason;
```

Unhide: `delete from public.moderation_hidden where profile_id = '<account id>';`

### Clear a username, so it stays cleared

The app re-sends the username it holds every time it starts. Clearing the name on the server
alone does not stick: the next launch puts it back. So **block the name first**, then clear it.
The app's next push is refused (`username_not_allowed`) and it asks the driver to choose a new
name, exactly as for a taken one. Section 4 of the snippet does both for the driver's exact
name (a `word` term). To block the offending word wherever it appears instead, do it by hand:

```sql
-- 1. Block the offending word (or, for impersonation, the whole name).
--    blocked_text_key gives the stored form. 'contains' catches it anywhere;
--    use 'word' for short words that sit inside innocent ones.
insert into public.blocked_terms (term, kind, match)
values (public.blocked_text_key('<word or name>'), 'profanity', 'contains')  -- or 'slur', 'reserved'
on conflict (term) do nothing;

-- 2. Check the current name is now refused: should return true.
select public.is_blocked_text(username) from public.profiles where id = '<account id>';

-- 3. Clear it.
update public.profiles set username = null where id = '<account id>';
```

If step 2 returns false, the term did not match: fix the term before clearing.

Always hide the driver while their username is cleared, so no board shows a row without a name,
and unhide them once they have chosen an acceptable one (check at the next daily run).

### Remove a drive's results (cheating)

Delete the drive on the server, without deleting the account. Marking it `rejected` and
deleting its board entries is **not enough**: the driver can ask the server to check their own
drive again (verify-drive), which recalculates it from its raw points and writes the results
back. A deleted drive cannot be re-checked. The copy on the driver's phone stays as it is; it
is never uploaded again.

`delete_drives_and_reconcile` deletes the drive with its raw points, route and board entries,
and takes back any achievement it no longer earns. It acts only on the caller's own drives, so
say who the caller is first, with the **driver's** Account ID (the drive's `profile_id`):

```sql
-- 1. Dry run: should say would_delete_drives = 1.
select public.delete_drives_and_reconcile(array['<drive id>']::uuid[])
from (select set_config('request.jwt.claims', '{"sub": "<driver account id>"}', true)) as as_driver;

-- 2. Delete.
select public.delete_drives_and_reconcile(array['<drive id>']::uuid[], false)
from (select set_config('request.jwt.claims', '{"sub": "<driver account id>"}', true)) as as_driver;
```

If the dry run says 0, the Account ID is not the drive's owner: check
`select profile_id from public.drives where id = '<drive id>';`.

### Delete an account (terminate)

```sql
delete from auth.users where id = '<account id>';
```

This cascades exactly as the in-app Delete account does: profile, drives, results, vehicles,
reports by and about them, blocks and achievements all go. It cannot be undone. Because accounts
are anonymous, the person can install the app again and start a new account; the denylist and
another report are what stop a returning name.

---

## The log

Keep a private moderation log (a spreadsheet is fine, not shared, not in this repo). One row
per action:

| Date and time | Report id | Account ID | Reason | Action | Hours from report to action |
| --- | --- | --- | --- | --- | --- |

Record what was done and why in a few words. Do not copy report details or other personal data
into it: the report row already holds them, and the log is not a second database. The log shows
the 24-hour promise is being kept, and it is what to point to if Apple or a regulator asks.

Delete a row once the account it names has been deleted, as the privacy policy says reports and
the notes about them go with the account.

## Emails

- **Appeals** ("my name was cleared unfairly"): look again, reply, and undo the action if it was
  wrong.
- **Reports by email**: treat exactly like an in-app report, within 24 hours.
- **Data requests** go through the privacy process, not this one (`docs/PRIVACY.md`, "Your
  rights"): answered within one month.
