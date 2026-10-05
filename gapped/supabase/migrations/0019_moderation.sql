-- ─────────────────────────────────────────────────────────────────────────────
-- Gapped — moderation (App Review Guideline 1.2).
--
-- An app whose users' names appear on public boards needs four things: a way
-- to keep the worst names out, a way for anyone to report a driver, a way for
-- anyone to stop seeing a driver, and an owner who acts on reports (within 24
-- hours, by hand, with supabase/snippets/moderation.sql). This migration is the
-- server half of the first three:
--
--   1. blocked_terms + is_blocked_text   the denylist, and how text meets it
--   2. profiles.username                 format and denylist, enforced here
--   3. vehicles.make / model             bounded, printable; make vs denylist
--   4. driver_reports + report_driver    Report driver
--   5. blocks + list_blocked             Hide driver (a block)
--   6. moderation_hidden                 the owner's switch: off every board
--   7. onboarding_answers.terms_accepted_at
--
-- 0020 makes the boards honour 5 and 6.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══ 1. The denylist ══════════════════════════════════════════════════════════
--
-- Terms are stored NORMALISED, in the form text is compared in (below), so a
-- term is lower-case letters and the digits leetspeak leaves alone (2 6 8 9).
--
--   match = 'contains'  the term anywhere in the text, once every separator is
--                       gone: "f_u_c_k" and "xxfuckxx" both match "fuck".
--                       For words with no innocent hosts.
--   match = 'word'      the term as a whole word: one '_'-separated part of
--                       the text (digits at its start, its end or both
--                       ignored, so "admin123", "4dm1n" and "4dmin1" are all
--                       "admin"), or the whole text run
--                       together ("a_s_s"). For short words that sit inside
--                       ordinary ones: substring matching "sex" refuses Essex
--                       and Sussex, "admin" refuses badminton, "staff" refuses
--                       Staffordshire, "cum" refuses Cummins, "rapist"
--                       refuses therapist, "pedo" refuses pedometer.
--   kind = 'allow'      an innocent host: a real word or name that happens to
--                       contain a term (Scunthorpe, Penistone, Milford,
--                       snigger). Cut out of the run-together text before
--                       any term is looked for, so "scunthorpe_fc" is fine and
--                       "scunthorpe_cunt" is not; a 'word' term must still be
--                       there once the hosts are gone.
--   kind = 'allow_make' the same, for a make only: a real make that holds a
--                       term (the NHTSA list the app offers has "BAD ASS
--                       Choppers" and "Crazy Dago Customs"). Not cut out of a
--                       username, where "crazy_dago_customs" is just a slur
--                       with a fig leaf.
--
-- No client can read or write this table. Knowing the exact list only helps
-- someone write around it.

create table if not exists public.blocked_terms (
  term     text primary key check (term ~ '^[a-z2689]{2,80}$'),
  kind     text not null,
  match    text not null default 'contains' check (match in ('contains', 'word')),
  added_at timestamptz not null default now()
);

-- Named, and dropped first, so a re-run widens a check made before
-- 'allow_make' existed.
alter table public.blocked_terms drop constraint if exists blocked_terms_kind_check;
alter table public.blocked_terms add constraint blocked_terms_kind_check
  check (kind in ('profanity', 'slur', 'reserved', 'allow', 'allow_make'));

comment on table public.blocked_terms is
  'Username and make denylist, normalised (public.blocked_text_key). match: contains = substring of the separator-free text; word = a whole _-separated word or the whole text. kind allow = innocent hosts cut out of the text before any term is matched; allow_make = the same, for makes only. Service role / postgres only.';

alter table public.blocked_terms enable row level security;
revoke all on public.blocked_terms from public, anon, authenticated;
grant select, insert, update, delete on public.blocked_terms to service_role;

-- A reasonable English starting list, not an exhaustive one: the owner adds to
-- it from reports (snippets/moderation.sql), and every report path stays open
-- for what it misses.
insert into public.blocked_terms (term, kind, match) values
  -- profanity, sexual and violent terms with no common innocent host
  ('fuck', 'profanity', 'contains'), ('shit', 'profanity', 'contains'),
  ('cunt', 'profanity', 'contains'), ('bitch', 'profanity', 'contains'),
  ('wanker', 'profanity', 'contains'), ('bollock', 'profanity', 'contains'),
  ('bastard', 'profanity', 'contains'), ('asshole', 'profanity', 'contains'),
  ('arsehole', 'profanity', 'contains'), ('twat', 'profanity', 'contains'),
  ('tosser', 'profanity', 'contains'), ('bellend', 'profanity', 'contains'),
  ('minge', 'profanity', 'contains'), ('skank', 'profanity', 'contains'),
  ('slut', 'profanity', 'contains'), ('whore', 'profanity', 'contains'),
  ('dildo', 'profanity', 'contains'), ('penis', 'profanity', 'contains'),
  ('vagina', 'profanity', 'contains'), ('pussy', 'profanity', 'contains'),
  ('porn', 'profanity', 'contains'), ('blowjob', 'profanity', 'contains'),
  ('handjob', 'profanity', 'contains'), ('rimjob', 'profanity', 'contains'),
  ('jizz', 'profanity', 'contains'), ('orgasm', 'profanity', 'contains'),
  ('masturbat', 'profanity', 'contains'), ('milf', 'profanity', 'contains'),
  ('cumshot', 'profanity', 'contains'), ('cocksuck', 'profanity', 'contains'),
  ('bukkake', 'profanity', 'contains'), ('gangbang', 'profanity', 'contains'),
  ('incest', 'profanity', 'contains'), ('paedophile', 'profanity', 'contains'),
  ('pedophile', 'profanity', 'contains'), ('bestiality', 'profanity', 'contains'),
  ('necrophil', 'profanity', 'contains'), ('molest', 'profanity', 'contains'),
  ('hitler', 'profanity', 'contains'), ('siegheil', 'profanity', 'contains'),
  ('whitepower', 'profanity', 'contains'), ('kkk', 'profanity', 'contains'),
  -- profanity as whole words only (each sits inside ordinary words)
  ('ass', 'profanity', 'word'), ('arse', 'profanity', 'word'),
  ('cum', 'profanity', 'word'), ('sex', 'profanity', 'word'),
  ('anal', 'profanity', 'word'), ('anus', 'profanity', 'word'),
  ('tits', 'profanity', 'word'), ('cock', 'profanity', 'word'),
  ('dick', 'profanity', 'word'), ('prick', 'profanity', 'word'),
  ('piss', 'profanity', 'word'), ('crap', 'profanity', 'word'),
  ('wank', 'profanity', 'word'), ('rape', 'profanity', 'word'),
  ('rapist', 'profanity', 'word'), ('shag', 'profanity', 'word'),
  ('knob', 'profanity', 'word'), ('boob', 'profanity', 'word'),
  ('boobs', 'profanity', 'word'), ('nude', 'profanity', 'word'),
  ('nudes', 'profanity', 'word'), ('horny', 'profanity', 'word'),
  ('pedo', 'profanity', 'word'), ('paedo', 'profanity', 'word'),
  ('nonce', 'profanity', 'word'), ('bugger', 'profanity', 'word'),
  ('slag', 'profanity', 'word'), ('nazi', 'profanity', 'word'),
  -- slurs with no common innocent host
  ('nigger', 'slur', 'contains'), ('nigga', 'slur', 'contains'),
  ('faggot', 'slur', 'contains'), ('retard', 'slur', 'contains'),
  ('spastic', 'slur', 'contains'), ('wetback', 'slur', 'contains'),
  ('raghead', 'slur', 'contains'), ('towelhead', 'slur', 'contains'),
  ('golliwog', 'slur', 'contains'), ('pikey', 'slur', 'contains'),
  ('mongoloid', 'slur', 'contains'),
  -- slurs as whole words only
  ('fag', 'slur', 'word'), ('fags', 'slur', 'word'), ('tranny', 'slur', 'word'),
  ('kike', 'slur', 'word'), ('chink', 'slur', 'word'), ('gook', 'slur', 'word'),
  ('spic', 'slur', 'word'), ('beaner', 'slur', 'word'), ('wog', 'slur', 'word'),
  ('coon', 'slur', 'word'), ('paki', 'slur', 'word'), ('jap', 'slur', 'word'),
  ('dyke', 'slur', 'word'), ('lesbo', 'slur', 'word'), ('homo', 'slur', 'word'),
  ('gyppo', 'slur', 'word'), ('gypo', 'slur', 'word'), ('sambo', 'slur', 'word'),
  ('negro', 'slur', 'word'), ('wop', 'slur', 'word'), ('dago', 'slur', 'word'),
  ('kraut', 'slur', 'word'), ('honky', 'slur', 'word'), ('mong', 'slur', 'word'),
  ('spaz', 'slur', 'word'),
  -- reserved: names that would let a driver pass as the app, the store or
  -- its staff, or that are what a bug writes instead of a name
  ('gapped', 'reserved', 'contains'), ('gappedapp', 'reserved', 'contains'),
  ('appstore', 'reserved', 'contains'), ('administrator', 'reserved', 'contains'),
  ('moderator', 'reserved', 'contains'), ('official', 'reserved', 'contains'),
  ('admin', 'reserved', 'word'), ('support', 'reserved', 'word'),
  ('apple', 'reserved', 'word'), ('staff', 'reserved', 'word'),
  ('root', 'reserved', 'word'), ('system', 'reserved', 'word'),
  ('null', 'reserved', 'word'), ('undefined', 'reserved', 'word'),
  -- innocent hosts: places and words
  ('scunthorpe', 'allow', 'contains'), ('penistone', 'allow', 'contains'),
  ('milford', 'allow', 'contains'), ('pussycat', 'allow', 'contains'),
  ('snigger', 'allow', 'contains'),
  -- innocent hosts in a make only: makes in the app's own catalogue
  ('badasschoppers', 'allow_make', 'contains'), ('crazydagocustoms', 'allow_make', 'contains')
on conflict (term) do nothing;

-- A list seeded before 'allow_make' existed held these two as 'allow', which
-- let them through as usernames too.
update public.blocked_terms
set kind = 'allow_make'
where term in ('badasschoppers', 'crazydagocustoms') and kind = 'allow';

-- ── how text meets the list ──────────────────────────────────────────────────
-- Lower-cased; leetspeak mapped (0→o 1→i 3→e 4→a 5→s 7→t @→a $→s, and
-- !→i, which a make can hold though a username cannot); then
-- every character that is not a letter or digit removed — '_' included, as
-- are the spaces and hyphens a make can hold. This is also the form a term is
-- stored in, so the owner can add a username as it is spelt
-- (`insert ... values (public.blocked_text_key('some_name'), ...)`).
create or replace function public.blocked_text_key(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(coalesce(p_text, '')), '013457@$!', 'oieastasi'),
    '[^[:alnum:]]', '', 'g'
  );
$$;

-- Which kinds of term the text matches: '{}' when none. The username filter
-- refuses any kind; the make filter only profanity and slurs (a make called
-- "Apple" impersonates nobody). p_make: the text is a make, so the
-- 'allow_make' hosts are cut out as well as the 'allow' ones.
create or replace function public.blocked_text_kinds(p_text text, p_make boolean)
returns text[]
language sql
stable
set search_path = ''
as $$
  with lowered as (
    select lower(coalesce(p_text, '')) as t
  ),
  flat as (
    select public.blocked_text_key(p_text) as s
  ),
  -- Innocent hosts cut out, longest first, before any term is sought.
  cleaned as (
    select coalesce(regexp_replace(f.s, a.pattern, '', 'g'), f.s) as s
    from flat f
    cross join (
      select '(' || string_agg(b.term, '|' order by length(b.term) desc, b.term) || ')' as pattern
      from public.blocked_terms b
      where b.kind = 'allow' or (p_make and b.kind = 'allow_make')
    ) a
  ),
  -- Whole words: each part between separators (@ $ ! kept, they are letters
  -- here), mapped as it stands and with the digits at its start, its end and
  -- both trimmed ("4dmin1" is "admin" only once the 4 is kept and the 1
  -- trimmed); and the whole text run together.
  parts as (
    select w.part
    from lowered l, regexp_split_to_table(l.t, '[^[:alnum:]@$!]+') as w(part)
  ),
  words as (
    select translate(p.part, '013457@$!', 'oieastasi') as word from parts p
    union
    select translate(btrim(p.part, '0123456789'), '013457@$!', 'oieastasi') from parts p
    union
    select translate(ltrim(p.part, '0123456789'), '013457@$!', 'oieastasi') from parts p
    union
    select translate(rtrim(p.part, '0123456789'), '013457@$!', 'oieastasi') from parts p
    union
    select f.s from flat f
  )
  select coalesce(array_agg(distinct b.kind order by b.kind), '{}')
  from public.blocked_terms b
  where b.kind not in ('allow', 'allow_make')
    and (
      (b.match = 'contains' and strpos((select c.s from cleaned c), b.term) > 0)
      or (b.match = 'word' and b.term in (select w.word from words w)
          and strpos((select c.s from cleaned c), b.term) > 0)
    );
$$;

-- Text that is not a make: a username, or whatever the owner asks about.
create or replace function public.blocked_text_kinds(p_text text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select public.blocked_text_kinds(p_text, false);
$$;

create or replace function public.is_blocked_text(p_text text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select cardinality(public.blocked_text_kinds(p_text)) > 0;
$$;

comment on function public.is_blocked_text(text) is
  'True when the text matches any blocked_terms entry (profanity, slur or reserved), after lower-casing, mapping leetspeak (0o 1i 3e 4a 5s 7t @a $s !i) and dropping _ and other separators. See 0019.';

-- Not RPCs. The triggers below run them as their owner; service_role may use
-- them from admin tooling.
revoke all on function public.blocked_text_key(text)   from public, anon, authenticated;
revoke all on function public.blocked_text_kinds(text) from public, anon, authenticated;
revoke all on function public.blocked_text_kinds(text, boolean) from public, anon, authenticated;
revoke all on function public.is_blocked_text(text)    from public, anon, authenticated;
grant execute on function public.blocked_text_key(text)   to service_role;
grant execute on function public.blocked_text_kinds(text) to service_role;
grant execute on function public.blocked_text_kinds(text, boolean) to service_role;
grant execute on function public.is_blocked_text(text)    to service_role;


-- ══ 2. Usernames ═════════════════════════════════════════════════════════════
--
-- The app has always required ^[a-z0-9_]{3,20}$ (src/lib/username.ts), but
-- only the app did: profiles.username took anything the column type allowed.
-- Now the server refuses, with ONE answer for both reasons a name can fail:
--
--   SQLSTATE 23514, message 'username_not_allowed'
--
-- sync.ts treats it exactly as it treats a taken name (23505): the name stays
-- local, the driver is asked for another, nothing retries in a loop. One
-- answer on purpose: telling a client which word tripped the list teaches it
-- how to spell around it.
--
-- A trigger, not only a CHECK, because a CHECK cannot read blocked_terms
-- (and one that called a function reading it would be checked against a list
-- that can change underneath it, and break restores). It fires on every write
-- that names the column, even with an unchanged value, so a name the list
-- grew to cover is refused the next time the app pushes it and the driver is
-- asked for a new one; writes that do not touch the username (country, units)
-- never see it. SECURITY DEFINER so it can read the list, which the caller
-- cannot. It applies to every role, postgres included: to give the app an
-- official name, disable the trigger for that one statement.

create or replace function public.enforce_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is not null
     and (new.username !~ '^[a-z0-9_]{3,20}$' or public.is_blocked_text(new.username)) then
    raise exception 'username_not_allowed'
      using errcode = '23514',
            detail = 'Usernames are 3-20 lowercase letters, numbers or underscores, and some words are not allowed.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_username() from public, anon, authenticated;

drop trigger if exists profiles_username_allowed on public.profiles;
create trigger profiles_username_allowed
  before insert or update of username on public.profiles
  for each row execute function public.enforce_username();

-- The format as a constraint too: structural, visible in the schema, and true
-- of every row rather than of every future write. The trigger runs first, so
-- a client never sees this constraint's own message.
--
-- NOT VALID, then VALIDATE. Existing rows are checked first and the migration
-- stops, naming them, if any break the format — a VALIDATE failure would only
-- say "violated by some row". Locally every named profile already conforms;
-- run the query in the lead's review notes against the cloud project before
-- pushing. A NOT VALID constraint left in place would still be checked on
-- every UPDATE of such a row, so a driver whose old name broke it could not
-- even change their country — the rows have to be fixed, not skipped.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z0-9_]{3,20}$') not valid;

do $$
declare
  bad text;
begin
  select string_agg(format('%L (%s)', p.username, p.id), ', ' order by p.created_at)
  into bad
  from public.profiles p
  where p.username is not null and p.username !~ '^[a-z0-9_]{3,20}$';

  if bad is not null then
    raise exception 'profiles.username: rows break ^[a-z0-9_]{3,20}$: %', bad
      using hint = 'Clear them first (update public.profiles set username = null where id = ...); the app then asks those drivers for a new name.';
  end if;
end $$;

alter table public.profiles validate constraint profiles_username_format;

-- Names already on the server that the list now covers are reported, not
-- changed: the owner decides (snippets/moderation.sql, "clear a username").
do $$
declare
  hits text;
begin
  select string_agg(format('%L (%s)', p.username, p.id), ', ')
  into hits
  from public.profiles p
  where p.username is not null and public.is_blocked_text(p.username);

  if hits is not null then
    raise notice 'existing usernames that the denylist covers (left as they are): %', hits;
  end if;
end $$;


-- ══ 3. Vehicle make and model ════════════════════════════════════════════════
--
-- Free text since 0001 ("Not listed? Add it yourself"), and the make is
-- printed on other drivers' screens by make_popularity (at five drivers). So:
--
--   * 1–80 characters. The lead's brief said 40; the catalogue the app offers
--     (src/vehicles/data/vehicles.json, from NHTSA) has 38 makes and 2 models
--     longer than that, up to 72 characters, and the free-text model field
--     allows 60 (MAX_MODEL_LENGTH). A 40 cap would refuse those vehicles'
--     rows, and with the vehicles row refused every drive in that car fails
--     its foreign key. 80 holds every value the app can produce, and still
--     bounds what a client can store.
--   * printable: no control characters, and none of the invisible ones used
--     to disguise text — zero-width spaces and joiners (U+200B–U+200F, U+2060–
--     U+2064, U+FEFF) and the bidirectional overrides (U+202A–U+202E) that
--     make a string display as something other than what it is. Written as
--     regex escapes (​), not the characters themselves, so this file
--     and the constraint definition hold nothing a reviewer cannot see.
--   * the make against profanity and slurs: SQLSTATE 23514, message
--     'make_not_allowed'. Reserved names are not applied to makes.
--
-- The model is never shown to anyone else, so it is bounded but not filtered.

alter table public.vehicles drop constraint if exists vehicles_make_text;
alter table public.vehicles drop constraint if exists vehicles_model_text;

alter table public.vehicles
  add constraint vehicles_make_text check (
    char_length(make) between 1 and 80
    and make !~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]'
  ) not valid,
  add constraint vehicles_model_text check (
    char_length(model) between 1 and 80
    and model !~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]'
  ) not valid;

do $$
declare
  bad text;
begin
  select string_agg(format('%s make=%L model=%L', v.id, v.make, v.model), '; ')
  into bad
  from public.vehicles v
  where not (
    char_length(v.make) between 1 and 80
    and v.make !~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]'
    and char_length(v.model) between 1 and 80
    and v.model !~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]'
  );

  if bad is not null then
    raise exception 'vehicles: rows break the make/model text rules: %', bad;
  end if;
end $$;

alter table public.vehicles validate constraint vehicles_make_text;
alter table public.vehicles validate constraint vehicles_model_text;

-- A row that already exists is not checked again when it is re-sent. sync.ts
-- pushes the main vehicle on every launch as an upsert with ignoreDuplicates
-- (INSERT ... ON CONFLICT DO NOTHING), and BEFORE INSERT triggers run before
-- the conflict is found. Checked, a make already on the server that the list
-- later grew to cover would be refused on every launch, sync.ts throws on a
-- vehicles error, and every drive the driver records would be held back for
-- good. Skipping it writes nothing: the insert then conflicts and does
-- nothing (or fails 23505 without ON CONFLICT). A merging upsert still meets
-- the UPDATE branch below, and that is checked. A new row, or a renamed make,
-- is always checked.
create or replace function public.enforce_vehicle_make()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and exists (select 1 from public.vehicles v where v.id = new.id) then
    return new;
  end if;
  if public.blocked_text_kinds(new.make, true) && array['profanity', 'slur'] then
    raise exception 'make_not_allowed'
      using errcode = '23514',
            detail = 'That make contains a word that is not allowed.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_vehicle_make() from public, anon, authenticated;

-- Note for the client: a NEW vehicle whose make is refused comes back as
-- 23514 'make_not_allowed' (or 23514 from vehicles_make_text for length or
-- invisible characters), and drives in that vehicle cannot upload until the
-- make is changed. Re-sending a row the server already has is never refused
-- by this trigger (above).
drop trigger if exists vehicles_make_allowed on public.vehicles;
create trigger vehicles_make_allowed
  before insert or update of make on public.vehicles
  for each row execute function public.enforce_vehicle_make();

do $$
declare
  hits text;
begin
  select string_agg(format('%L (%s)', v.make, v.id), ', ')
  into hits
  from public.vehicles v
  where public.blocked_text_kinds(v.make, true) && array['profanity', 'slur'];

  if hits is not null then
    raise notice 'existing makes that the denylist covers (left as they are): %', hits;
  end if;
end $$;


-- ══ 4. Report driver ═════════════════════════════════════════════════════════
--
-- Reports are written by one function and read by nobody but the owner. The
-- reporter cannot see, edit or withdraw a report, and cannot learn whether
-- anyone else has reported the same driver.
--
-- The reported username is copied at report time: the report is about what
-- was on the board, and a driver who renames themselves after being reported
-- must not make the report unreadable.
--
-- Both ends cascade with the account: a report is the reporter's words about
-- someone, so it goes when either of them asks to be erased (0011's "vacate,
-- not anonymise").

create table if not exists public.driver_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  reported_id       uuid not null references public.profiles (id) on delete cascade,
  reported_username text,
  reason            text not null
                      check (reason in ('offensive_username', 'cheating', 'impersonation', 'other')),
  details           text check (char_length(details) <= 500),
  status            text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolution        text,
  constraint driver_reports_not_self check (reporter_id <> reported_id)
);

comment on table public.driver_reports is
  'Report driver (Guideline 1.2). Written only by report_driver(); read and resolved by the owner (snippets/moderation.sql) within 24 hours. No client privileges.';

-- One open report per reporter per driver: reporting again while the first is
-- still open adds nothing for the owner to read.
create unique index if not exists driver_reports_one_open
  on public.driver_reports (reporter_id, reported_id) where status = 'open';
create index if not exists driver_reports_open_idx
  on public.driver_reports (created_at) where status = 'open';
create index if not exists driver_reports_reported_idx on public.driver_reports (reported_id);

alter table public.driver_reports enable row level security;
revoke all on public.driver_reports from public, anon, authenticated;
grant select, insert, update, delete on public.driver_reports to service_role;

-- report_driver(p_reported, p_reason, p_details) → void
--
-- Errors, by message (the app should key off the message):
--   not_authenticated   28000   no session
--   invalid_reason      22023   reason outside the four keys
--   details_too_long    22023   more than 500 characters after trimming
--   cannot_report_self  22023
--   no_such_driver      P0002   no profile with that id
--   rate_limited        PT429   more than 10 reports in 24 hours; PostgREST
--                               answers HTTP 429
--
-- Ten a day per reporter, through the same fixed-window limiter verify-drive
-- uses (0013), called here server-side: the function runs as its owner, so
-- the limiter stays out of the client's reach (0018). The unit is spent once
-- the report is valid, before the insert, so repeating a report still counts.
create or replace function public.report_driver(
  p_reported uuid,
  p_reason   text,
  p_details  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  v_details  text := nullif(btrim(p_details), '');
  v_username text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_reason is null
     or p_reason not in ('offensive_username', 'cheating', 'impersonation', 'other') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if char_length(v_details) > 500 then
    raise exception 'details_too_long' using errcode = '22023';
  end if;
  if p_reported = uid then
    raise exception 'cannot_report_self' using errcode = '22023';
  end if;

  select p.username into v_username from public.profiles p where p.id = p_reported;
  if not found then
    raise exception 'no_such_driver' using errcode = 'P0002';
  end if;

  if not public.consume_rate_limit(uid, 'report_driver', 10, 86400) then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;

  insert into public.driver_reports (reporter_id, reported_id, reported_username, reason, details)
  values (uid, p_reported, v_username, p_reason, v_details)
  on conflict (reporter_id, reported_id) where status = 'open' do nothing;
end;
$$;

comment on function public.report_driver(uuid, text, text) is
  'Report driver: files an open report for the owner. Rate limited to 10 per reporter per 24 h. Errors by message: not_authenticated, invalid_reason, details_too_long, cannot_report_self, no_such_driver, rate_limited (PT429).';

revoke all on function public.report_driver(uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_driver(uuid, text, text) to authenticated;


-- ══ 5. Hide driver (block) ═══════════════════════════════════════════════════
--
-- A block is one-directional and private: it changes only what the blocker
-- sees (0020 drops the blocked driver from every board and friends list the
-- blocker reads), the blocked driver is never told, and nobody but the blocker
-- can see that it exists. blocker_id defaults to the caller, so the app sends
-- only blocked_id. Unblocking is a delete.
--
-- Write as INSERT ... ON CONFLICT DO NOTHING (supabase-js: upsert with
-- ignoreDuplicates) or a plain insert that treats 23505 as done: there is no
-- UPDATE grant, so a merging upsert is refused.

create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.blocks is
  'Hide driver: the blocker no longer sees the blocked driver on boards or friends lists (0020). Own rows only.';

-- Deleting the blocked driver's account cascades through this.
create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

drop policy if exists blocks_select on public.blocks;
drop policy if exists blocks_insert on public.blocks;
drop policy if exists blocks_delete on public.blocks;
create policy blocks_select on public.blocks for select using (auth.uid() = blocker_id);
create policy blocks_insert on public.blocks for insert with check (auth.uid() = blocker_id);
create policy blocks_delete on public.blocks for delete using (auth.uid() = blocker_id);

revoke all on public.blocks from public, anon, authenticated;
grant select, delete on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;
grant select, insert, update, delete on public.blocks to service_role;

-- The Hidden drivers screen: who you have blocked, newest first. Security
-- invoker — blocks' own-row policy is the filter, and profiles are public.
-- username is null for a driver who has none (or whose name was cleared).
create or replace function public.list_blocked()
returns table (blocked_id uuid, username text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.blocked_id, p.username, b.created_at
  from public.blocks b
  left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.list_blocked() from public, anon, authenticated;
grant execute on function public.list_blocked() to authenticated;


-- ══ 6. Hidden by the owner ═══════════════════════════════════════════════════
-- A driver listed here is off every board, bracket count, friends list and
-- make count for everyone (0020), themselves included. Their account, drives
-- and history are untouched; deleting the row puts them back. Owner only.

create table if not exists public.moderation_hidden (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  reason     text,
  hidden_at  timestamptz not null default now()
);

comment on table public.moderation_hidden is
  'Drivers the owner has taken off every public surface (0020). Service role / postgres only.';

alter table public.moderation_hidden enable row level security;
revoke all on public.moderation_hidden from public, anon, authenticated;
grant select, insert, update, delete on public.moderation_hidden to service_role;


-- ══ 7. Terms acceptance ══════════════════════════════════════════════════════
-- Onboarding now asks the driver to accept the Terms of Use. When they did is
-- recorded on their own onboarding_answers row (own-row RLS from 0017), sent
-- by sync.ts with the other answers.
--
-- The trigger keeps the record honest in two ways: a write that sends null
-- (an older build, or a store that has not got the answer yet) cannot erase
-- an acceptance already on the server, and a device clock running fast
-- cannot record an acceptance in the future.

alter table public.onboarding_answers add column if not exists terms_accepted_at timestamptz;

comment on column public.onboarding_answers.terms_accepted_at is
  'When the driver accepted the Terms of Use in onboarding (client clock, never later than the server''s now()). A null write never clears it.';

create or replace function public.touch_onboarding_answers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.terms_accepted_at := coalesce(new.terms_accepted_at, old.terms_accepted_at);
  end if;
  if new.terms_accepted_at > now() then
    new.terms_accepted_at := now();
  end if;
  return new;
end;
$$;

-- Column grants, as 0017 explains: the upsert names each column it sends.
grant insert (terms_accepted_at) on public.onboarding_answers to authenticated;
grant update (terms_accepted_at) on public.onboarding_answers to authenticated;


-- ══ audit ════════════════════════════════════════════════════════════════════
-- 0018's gate, extended by this migration's two RPCs.

do $$
declare
  anon_ok regprocedure[] := array[
    'public.board_top(text, text, text, text, boolean, int, text)',
    'public.board_brackets(text, text, text, text, boolean)',
    'public.make_popularity(text)',
    'public.country_activity(text)'
  ]::regprocedure[];
  authenticated_ok regprocedure[] := anon_ok || array[
    'public.list_friends()',
    'public.add_friend(text)',
    'public.remove_friend(uuid)',
    'public.delete_account()',
    'public.delete_drives_and_reconcile(uuid[], boolean)',
    'public.report_driver(uuid, text, text)',
    'public.list_blocked()'
  ]::regprocedure[];
  wrong text;
begin
  select string_agg(format('%s → %s %s', p.oid::regprocedure, r.role,
           case when has_function_privilege(r.role, p.oid, 'EXECUTE')
                then 'can call it' else 'cannot call it' end), '; ')
  into wrong
  from pg_proc p
  cross join (values ('anon'), ('authenticated')) as r(role)
  where p.pronamespace = 'public'::regnamespace
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
    and has_function_privilege(r.role, p.oid, 'EXECUTE')
        <> (p.oid = any(case r.role when 'anon' then anon_ok else authenticated_ok end));

  if wrong is not null then
    raise exception 'function privilege audit failed: %', wrong;
  end if;
end $$;
