-- ─────────────────────────────────────────────────────────────────────────────
-- Gapped — moderation, by hand.
--
-- The owner reviews every report within 24 hours (the promise made to App
-- Review under Guideline 1.2, and in the Terms). These are the queries for
-- that review. Run them one at a time in the Studio SQL editor (Supabase
-- dashboard → SQL Editor), which runs as postgres.
--
-- Placeholders are written 'PROFILE_ID' and 'REPORT_ID'. They are not valid
-- uuids, so a query run before they are replaced fails instead of acting on
-- the wrong row. A profile id is the driver's id: reports carry it as
-- reported_id, and section 1 prints it.
--
-- What each action does to the app:
--   hide        the driver is off every board, bracket count, friends list
--               and make count, for everyone, themselves included (0020).
--               Nothing is deleted; unhiding puts them straight back.
--   clear name  their username becomes null and the name is added to the
--               denylist, so when the app pushes it again it is refused
--               ('username_not_allowed') and the driver is asked for a new one.
--   delete      the account and everything in it, permanently (0011).
-- ─────────────────────────────────────────────────────────────────────────────


-- ══ 1. Open reports, oldest first ════════════════════════════════════════════
-- overdue = older than the 24 hours promised.

select
  r.created_at,
  now() - r.created_at > interval '24 hours'                     as overdue,
  r.id                                                            as report_id,
  r.reason,
  r.details,
  r.reported_id,
  r.reported_username                                             as username_reported,
  p.username                                                      as username_now,
  (select count(*) from public.driver_reports o
    where o.reported_id = r.reported_id and o.status = 'open')    as open_reports_on_driver,
  exists (select 1 from public.moderation_hidden h
           where h.profile_id = r.reported_id)                    as already_hidden,
  rp.username                                                     as reporter
from public.driver_reports r
left join public.profiles p  on p.id  = r.reported_id
left join public.profiles rp on rp.id = r.reporter_id
where r.status = 'open'
order by r.created_at;


-- ══ 2. A reported driver, in context ═════════════════════════════════════════
-- Their board presence and recent drives, to judge a "cheating" report.

select p.id, p.username, p.country, p.created_at,
       (select count(*) from public.drives d where d.profile_id = p.id)                    as drives,
       (select count(*) from public.drives d
         where d.profile_id = p.id and d.verification = 'verified')                        as verified_drives,
       (select max(e.value) * 3.6 from public.leaderboard_entries e
         where e.profile_id = p.id and e.metric = 'top_speed' and e.period = 'all')        as best_top_speed_kmh,
       (select count(*) from public.driver_reports r where r.reported_id = p.id)           as reports_ever
from public.profiles p
where p.id = 'PROFILE_ID';

select d.started_at, round(d.distance_m) as m, round((d.max_speed_ms * 3.6)::numeric, 1) as max_kmh,
       d.verification, d.attestation, d.verification_meta
from public.drives d
where d.profile_id = 'PROFILE_ID'
order by d.started_at desc
limit 20;


-- ══ 3. Hide a driver ═════════════════════════════════════════════════════════

insert into public.moderation_hidden (profile_id, reason)
values ('PROFILE_ID', 'WHY (e.g. report REPORT_ID: offensive username)')
on conflict (profile_id) do update
  set reason = excluded.reason, hidden_at = now();

-- Everyone hidden at the moment.
select h.hidden_at, h.profile_id, p.username, h.reason
from public.moderation_hidden h
left join public.profiles p on p.id = h.profile_id
order by h.hidden_at desc;

-- Unhide.
delete from public.moderation_hidden where profile_id = 'PROFILE_ID';


-- ══ 4. Clear a username ══════════════════════════════════════════════════════
-- Both statements, in this order: the name goes on the denylist first, so the
-- app's next push of it is refused and the driver is asked for another, then
-- it is cleared. 'word' matches that exact name however it is spaced or
-- spelt in leetspeak (i_hate_x, ihatex, 1_h4te_x), and nothing longer.

insert into public.blocked_terms (term, kind, match)
select public.blocked_text_key(p.username), 'profanity', 'word'
from public.profiles p
where p.id = 'PROFILE_ID' and p.username is not null
on conflict (term) do nothing;

update public.profiles set username = null where id = 'PROFILE_ID';


-- ══ 5. Delete an account ═════════════════════════════════════════════════════
-- PERMANENT. Cascades exactly as the in-app "Delete account" does (0011):
-- profile, vehicles, drives, fixes, routes, board entries, achievements,
-- friendships, blocks, reports by them and about them, onboarding answers.
-- There are no storage buckets, so there are no files to clean up.
--
-- Look first:
select u.id, u.created_at, u.is_anonymous, p.username, p.country,
       (select count(*) from public.drives d where d.profile_id = u.id) as drives
from auth.users u
left join public.profiles p on p.id = u.id
where u.id = 'PROFILE_ID';

-- Then:
delete from auth.users where id = 'PROFILE_ID';


-- ══ 6. Resolve a report ══════════════════════════════════════════════════════
-- status: 'actioned' (you hid, cleared or deleted) or 'dismissed' (nothing
-- wrong). Say what you did; the row is the record that the report was read.

update public.driver_reports
set status = 'actioned', resolved_at = now(), resolution = 'WHAT YOU DID'
where id = 'REPORT_ID';

-- Every open report on one driver at once, after acting on them.
update public.driver_reports
set status = 'actioned', resolved_at = now(), resolution = 'WHAT YOU DID'
where reported_id = 'PROFILE_ID' and status = 'open';

-- (A deleted account's reports go with it, so there is nothing to resolve.)


-- ══ 7. The denylist ══════════════════════════════════════════════════════════
-- Would a name be refused, and as what?
select public.blocked_text_kinds('some_name'), public.blocked_text_key('some_name');

-- Add a word: replace ??? with it. As written the insert is refused (??? is
-- no term at all), so running this unedited adds nothing. 'contains' =
-- anywhere in the name; 'word' = only as a whole word (use it for short words
-- that sit inside ordinary ones). kind 'allow' = an innocent word that
-- contains a listed one (a place name); 'allow_make' = the same for a make
-- only (a real make whose name holds a listed word).
insert into public.blocked_terms (term, kind, match)
values (public.blocked_text_key('???'), 'profanity', 'contains')
on conflict (term) do update set kind = excluded.kind, match = excluded.match;

-- Remove one: replace ??? with it. As written it removes nothing.
delete from public.blocked_terms where term = public.blocked_text_key('???');

-- Names already on the boards that the list now covers (new words are not
-- applied to existing names until the app next sends them).
select p.id, p.username, public.blocked_text_kinds(p.username) as matches
from public.profiles p
where p.username is not null and public.is_blocked_text(p.username);


-- ══ 8. Who hides whom (aggregate only) ═══════════════════════════════════════
-- Drivers hidden (blocked) by many people are worth a look even unreported.
select b.blocked_id, p.username, count(*) as blocked_by
from public.blocks b
left join public.profiles p on p.id = b.blocked_id
group by b.blocked_id, p.username
having count(*) >= 3
order by blocked_by desc;
