-- ─────────────────────────────────────────────────────────────────────────────
-- Moderation (0019): the username filter, the make filter, Report driver,
-- Hide driver, the owner's hidden list and terms acceptance.
--
-- Written from the client's seat wherever the client is the one acting, and in
-- the form each refusal takes: an error with the code and message the app
-- keys off, zero rows where RLS filters.
--
--   npm run test:db
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(104);

-- ══ shape ════════════════════════════════════════════════════════════════════

select has_table('public', 'blocked_terms', 'blocked_terms exists');
select has_table('public', 'driver_reports', 'driver_reports exists');
select has_table('public', 'blocks', 'blocks exists');
select has_table('public', 'moderation_hidden', 'moderation_hidden exists');

select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c
    where c.oid in ('public.blocked_terms'::regclass, 'public.driver_reports'::regclass,
                    'public.blocks'::regclass, 'public.moderation_hidden'::regclass)
      and c.relrowsecurity),
  array['blocked_terms', 'blocks', 'driver_reports', 'moderation_hidden'],
  'RLS is on for all four'
);

-- Owner only: no client role holds anything on the list, the reports or the
-- hidden set.
select table_privs_are('public', 'blocked_terms', 'anon', array[]::text[], 'anon: nothing on blocked_terms');
select table_privs_are('public', 'blocked_terms', 'authenticated', array[]::text[], 'authenticated: nothing on blocked_terms');
select table_privs_are('public', 'driver_reports', 'anon', array[]::text[], 'anon: nothing on driver_reports');
select table_privs_are('public', 'driver_reports', 'authenticated', array[]::text[], 'authenticated: nothing on driver_reports');
select table_privs_are('public', 'moderation_hidden', 'anon', array[]::text[], 'anon: nothing on moderation_hidden');
select table_privs_are('public', 'moderation_hidden', 'authenticated', array[]::text[], 'authenticated: nothing on moderation_hidden');

-- blocks: read and delete your own; insert names two columns; no update.
select table_privs_are('public', 'blocks', 'anon', array[]::text[], 'anon: nothing on blocks');
select table_privs_are('public', 'blocks', 'authenticated', array['SELECT', 'DELETE'],
  'authenticated: SELECT and DELETE on blocks as a whole (insert is per column)');
select column_privs_are('public', 'blocks', 'blocked_id', 'authenticated', array['INSERT', 'SELECT'],
  'authenticated may name blocked_id');
select column_privs_are('public', 'blocks', 'created_at', 'authenticated', array['SELECT'],
  'created_at is the server''s');
select policies_are('public', 'blocks', array['blocks_select', 'blocks_insert', 'blocks_delete'],
  'own-row select, insert and delete on blocks');

select is_definer('public', 'report_driver', array['uuid', 'text', 'text'],
  'report_driver is SECURITY DEFINER: it writes a table the caller cannot');
select is(
  (select proconfig from pg_proc where oid = 'public.report_driver(uuid, text, text)'::regprocedure),
  array['search_path=""'],
  'report_driver pins an empty search_path'
);
select function_privs_are('public', 'report_driver', array['uuid', 'text', 'text'], 'anon', array[]::text[],
  'anon cannot report');
select function_privs_are('public', 'report_driver', array['uuid', 'text', 'text'], 'authenticated', array['EXECUTE'],
  'authenticated can report');
select function_privs_are('public', 'list_blocked', array[]::text[], 'authenticated', array['EXECUTE'],
  'authenticated can list who they have blocked');
select function_privs_are('public', 'is_blocked_text', array['text'], 'authenticated', array[]::text[],
  'the denylist cannot be probed through is_blocked_text');

select has_trigger('public', 'profiles', 'profiles_username_allowed', 'profiles has the username trigger');
select has_trigger('public', 'vehicles', 'vehicles_make_allowed', 'vehicles has the make trigger');
select ok(
  (select bool_and(convalidated) from pg_constraint
    where conname in ('profiles_username_format', 'vehicles_make_text', 'vehicles_model_text')
      and contype = 'c'
    having count(*) = 3),
  'the username format and make/model text constraints exist and are VALIDATED'
);

-- ══ the denylist, as a function ══════════════════════════════════════════════

select is(public.blocked_text_key('A_$h1t 4Dm1n!'), 'ashitadmini',
  'normalised: lower-cased, leetspeak mapped, every separator gone');

select is_empty(
  $$ select v.t
       from (values
         -- innocent: whole-word terms inside ordinary words
         ('essex_boy'), ('sussex_rider'), ('middlesex'), ('badminton_ace'),
         ('staffordshire'), ('therapist_tom'), ('pedometer'), ('cummins_diesel'),
         ('cockpit_view'), ('liverpool_fan'), ('arsenal_fan'), ('montenegro'),
         ('japan_trip'), ('classic_cars'), ('grassroots'), ('ecosystem'),
         ('pineapple'), ('supporter'), ('peacock'), ('dickens'), ('analysis'),
         ('assassin'), ('scrapyard'), ('grape_juice'), ('cucumber'), ('sextant'),
         ('raccoon'), ('spice_girl'), ('nazir'), ('niger'),
         -- innocent: hosts the allow list cuts out
         ('scunthorpe_utd'), ('penistone_fc'), ('milford_haven'), ('pussycat'),
         ('snigger'),
         -- names with digits
         ('bmw_m3'), ('e46_m3'), ('gt3_rs'), ('s2000_ap1'), ('golf_r32'),
         ('proof_000001'), ('buddy_muqvpii1'), ('qa_driver_rn863')
       ) as v(t)
      where public.is_blocked_text(v.t) $$,
  'no false positive among innocent names that contain a listed word'
);

select is_empty(
  $q$ select v.t
       from (values
         ('fuck'), ('f_u_c_k'), ('xxfuckxx'), ('sh1t'), ('$hit'), ('b1tch_slayer'),
         ('b!tch'), ('cunt'), ('scunthorpe_cunt'), ('snigger_nigger'), ('n1gger'),
         ('a55'), ('a_s_s'), ('a$$'), ('s3x'), ('sex69'), ('rapist'), ('c0ck'),
         ('fag'), ('jap_import'), ('kkk_member'), ('p0rn_star'), ('milf_hunter'),
         ('admin'), ('admin123'), ('4dm1n'), ('4dmin1'), ('4dm1n7'), ('the_admin'), ('gapped'),
         -- a make's innocent host is no host in a username
         ('bad_ass_choppers'), ('crazy_dago_customs'),
         ('gapped_official'), ('real_gapped_team'), ('appstore_review'),
         ('administrator'), ('moderator'), ('support'), ('apple'), ('root'),
         ('null'), ('undefined'), ('system'), ('staff')
       ) as v(t)
      where not public.is_blocked_text(v.t) $q$,
  'every listed word is caught: plain, separated, leetspeak, and as a whole word'
);

select is(public.blocked_text_kinds('Supercar System'), array['reserved'],
  'kinds are reported: a reserved word is reserved');
select is(public.blocked_text_kinds('BAD ASS Choppers', true), '{}'::text[],
  'a make from the app''s own catalogue is cut out as a host');
select is(public.blocked_text_kinds('Crazy Dago Customs', true), '{}'::text[],
  'so is the other');
select is(public.blocked_text_kinds('Crazy Dago Customs'), array['slur'],
  '…but only as a make (allow_make): as other text it is what it holds');
select is(public.blocked_text_kinds(null), '{}'::text[], 'null text matches nothing');

-- ══ fixture ══════════════════════════════════════════════════════════════════

insert into auth.users (id, instance_id, aud, role, email) values
  ('acacacac-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod-a@example.com'),
  ('acacacac-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod-b@example.com'),
  ('acacacac-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod-c@example.com');

update profiles set username = 'mod_target', country = 'GG' where id = 'acacacac-0000-0000-0000-00000000000b';
update profiles set username = 'mod_other',  country = 'GG' where id = 'acacacac-0000-0000-0000-00000000000c';

-- ══ usernames, from the client's seat ════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"acacacac-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok($$ update profiles set username = 'Mod Reporter' where id = auth.uid() $$,
  '23514', 'username_not_allowed', 'capitals and spaces are refused, as username_not_allowed');
select throws_ok($$ update profiles set username = 'ab' where id = auth.uid() $$,
  '23514', 'username_not_allowed', 'two characters are refused');
select throws_ok($$ update profiles set username = 'a_name_of_twentyone_c' where id = auth.uid() $$,
  '23514', 'username_not_allowed', 'twenty-one characters are refused');
select throws_ok($$ update profiles set username = 'gapped_official' where id = auth.uid() $$,
  '23514', 'username_not_allowed', 'a reserved name is refused, with the same answer');
select throws_ok($$ update profiles set username = 'sh1t_driver' where id = auth.uid() $$,
  '23514', 'username_not_allowed', 'leetspeak profanity is refused');
select throws_ok($$ update profiles set username = 'f_u_c_k_it' where id = auth.uid() $$,
  '23514', 'username_not_allowed', 'profanity spelt out between underscores is refused');
select lives_ok($$ update profiles set username = 'essex_driver' where id = auth.uid() $$,
  'Essex is a county, not a word on the list');
select lives_ok($$ update profiles set username = 'mod_reporter' where id = auth.uid() $$,
  'an ordinary name is accepted');
select lives_ok($$ update profiles set username = 'mod_reporter' where id = auth.uid() $$,
  'and sending it again (as sync.ts does) is accepted again');

reset role;

-- ── a name already on the server that the list later covers ────────────────
-- Made the way it would have been: before the list knew the word.
alter table profiles disable trigger profiles_username_allowed;
update profiles set username = 'legacy_admin' where id = 'acacacac-0000-0000-0000-00000000000c';
alter table profiles enable trigger profiles_username_allowed;

set local role authenticated;
set local request.jwt.claims = '{"sub":"acacacac-0000-0000-0000-00000000000c","role":"authenticated"}';

select lives_ok($$ update profiles set country = 'JE', unit_pref = 'imperial' where id = auth.uid() $$,
  'a write that does not touch the username is not held up by it');
select throws_ok($$ update profiles set username = 'legacy_admin' where id = auth.uid() $$,
  '23514', 'username_not_allowed',
  'pushing that name again is refused, so the app asks for a new one');

reset role;

-- The constraint holds without the trigger: a direct write cannot get round it.
alter table profiles disable trigger profiles_username_allowed;
select throws_ok($$ update profiles set username = 'UPPER' where id = 'acacacac-0000-0000-0000-00000000000c' $$,
  '23514', null, 'the format constraint itself refuses a bad name');
alter table profiles enable trigger profiles_username_allowed;
update profiles set username = 'mod_other' where id = 'acacacac-0000-0000-0000-00000000000c';

-- ══ vehicle make and model ═══════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"acacacac-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f1', auth.uid(), 'car', 'BMW', 'M3', true) $$,
  'an ordinary vehicle is accepted'
);
select lives_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f2', auth.uid(), 'motorbike',
             'Xinri E-Veh Hongkong Co., Limited DBA Jiangsu Xinn International Trading',
             'CVO Ultra Classic Electra Glide 5 / CVO Ultra Classic Ltd', false) $$,
  'the longest make (72) and model (57) in the app''s catalogue are accepted'
);
select lives_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f3', auth.uid(), 'motorbike', 'BAD ASS Choppers', 'Custom', false) $$,
  'a catalogue make that contains a listed word is accepted'
);
select lives_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f4', auth.uid(), 'car', 'Supercar System', 'One', false) $$,
  'reserved names are not applied to makes'
);
select lives_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f5', auth.uid(), 'car', repeat('x', 80), repeat('y', 80), false) $$,
  'eighty characters are accepted'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f6', auth.uid(), 'car', 'Big Ass Motors', 'X', false) $$,
  '23514', 'make_not_allowed', 'a make with profanity in it is refused, as make_not_allowed'
);
select throws_ok(
  $$ update vehicles set make = 'Sh1t Motors' where id = 'acacacac-0000-0000-0000-0000000000f1' $$,
  '23514', 'make_not_allowed', 'and so is renaming a make to one'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f7', auth.uid(), 'car', repeat('x', 81), 'X', false) $$,
  '23514', null, 'an 81-character make is refused'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f8', auth.uid(), 'car', 'BMW', repeat('y', 81), false) $$,
  '23514', null, 'an 81-character model is refused'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f9', auth.uid(), 'car', '', 'X', false) $$,
  '23514', null, 'an empty make is refused'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000fa', auth.uid(), 'car', 'BM' || chr(8238) || 'W', 'X', false) $$,
  '23514', null, 'a bidirectional override in a make is refused'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000fb', auth.uid(), 'car', 'BMW', E'M3\n', false) $$,
  '23514', null, 'a control character in a model is refused'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000fc', auth.uid(), 'car', 'B' || chr(8203) || 'MW', 'X', false) $$,
  '23514', null, 'a zero-width space in a make is refused'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000e1', auth.uid(), 'car', 'BMW' || chr(65279), 'X', false) $$,
  '23514', null, 'a byte-order mark (U+FEFF, the last of the invisible set) in a make is refused'
);
select lives_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000e2', auth.uid(), 'car', 'Škoda', 'Octavia vRS – Mk3', false) $$,
  'control: accented letters and an en dash are printable, and accepted'
);

-- ── a make already on the server that the list later covers ────────────────
-- sync.ts re-sends the main vehicle on every launch (ON CONFLICT DO NOTHING)
-- and throws on a vehicles error, which holds back every drive. Made the way
-- it would have been: before the list knew the word.
reset role;
insert into vehicles (id, profile_id, kind, make, model, is_primary)
values ('acacacac-0000-0000-0000-0000000000fd', 'acacacac-0000-0000-0000-00000000000a', 'car', 'Zorbo Motors', 'Z1', false);
insert into blocked_terms (term, kind, match) values ('zorbo', 'profanity', 'contains');

set local role authenticated;
set local request.jwt.claims = '{"sub":"acacacac-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000fd', auth.uid(), 'car', 'Zorbo Motors', 'Z1', false)
     on conflict (id) do nothing $$,
  're-sending a row the server already has is not refused, though the list now covers its make…'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000fe', auth.uid(), 'car', 'Zorbo Motors', 'Z1', false)
     on conflict (id) do nothing $$,
  '23514', 'make_not_allowed', '…a new row with that make is'
);
select throws_ok(
  $$ insert into vehicles (id, profile_id, kind, make, model, is_primary)
     values ('acacacac-0000-0000-0000-0000000000f1', auth.uid(), 'car', 'Sh1t Motors', 'M3', true)
     on conflict (id) do update set make = excluded.make $$,
  '23514', 'make_not_allowed', '…and so is a merging upsert that renames an existing row''s make'
);

-- ══ Report driver ════════════════════════════════════════════════════════════

select throws_ok(
  $$ select public.report_driver('acacacac-0000-0000-0000-00000000000b', 'spam', null) $$,
  '22023', 'invalid_reason', 'a reason outside the four keys is refused'
);
select throws_ok(
  $$ select public.report_driver('acacacac-0000-0000-0000-00000000000b', 'other', repeat('x', 501)) $$,
  '22023', 'details_too_long', 'details over 500 characters are refused'
);
select throws_ok(
  $$ select public.report_driver(auth.uid(), 'cheating', null) $$,
  '22023', 'cannot_report_self', 'a driver cannot report themselves'
);
select throws_ok(
  $$ select public.report_driver('acacacac-0000-0000-0000-0000000000ff', 'cheating', null) $$,
  'P0002', 'no_such_driver', 'an id with no driver behind it is refused'
);
select lives_ok(
  $$ select public.report_driver('acacacac-0000-0000-0000-00000000000b', 'offensive_username',
                                 '  ' || repeat('x', 500) || '  ') $$,
  'a report with 500 characters of details (once trimmed) is filed'
);
select lives_ok(
  $$ select public.report_driver('acacacac-0000-0000-0000-00000000000b', 'cheating', 'again') $$,
  'reporting the same driver again while the first is open is accepted…'
);
select throws_ok(
  $$ select * from driver_reports $$,
  '42501', null, 'ATTACK BLOCKED: a reporter cannot read reports, their own included'
);

reset role;

select results_eq(
  $$ select reporter_id::text, reported_id::text, reported_username, reason,
            char_length(details), status
       from driver_reports
      where reported_id = 'acacacac-0000-0000-0000-00000000000b' $$,
  $$ values ('acacacac-0000-0000-0000-00000000000a', 'acacacac-0000-0000-0000-00000000000b',
             'mod_target', 'offensive_username', 500, 'open') $$,
  '…but adds nothing: one open report, the username as it was, details trimmed'
);

-- The target renames: the report still says what was on the board.
update profiles set username = 'renamed_target' where id = 'acacacac-0000-0000-0000-00000000000b';
select is(
  (select reported_username from driver_reports where reported_id = 'acacacac-0000-0000-0000-00000000000b'),
  'mod_target',
  'the reported username is a snapshot'
);

-- ── rate limit: ten a day ───────────────────────────────────────────────────
-- Two spent above (the refused calls spent nothing). Eight more reach ten.
set local role authenticated;
set local request.jwt.claims = '{"sub":"acacacac-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ do $d$
     begin
       for i in 1..8 loop
         perform public.report_driver('acacacac-0000-0000-0000-00000000000c', 'other', null);
       end loop;
     end $d$ $$,
  'ten reports in a day are accepted'
);
select throws_ok(
  $$ select public.report_driver('acacacac-0000-0000-0000-00000000000c', 'other', null) $$,
  'PT429', 'rate_limited', 'the eleventh is refused as rate_limited (HTTP 429 through PostgREST)'
);

-- No session at all (PostgREST never sends this, but the function must not
-- trust that it won't).
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok(
  $$ select public.report_driver('acacacac-0000-0000-0000-00000000000c', 'other', null) $$,
  '28000', 'not_authenticated', 'no caller, no report'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select public.report_driver('acacacac-0000-0000-0000-00000000000c', 'other', null) $$,
  '42501', null, 'signed out, the function is not callable at all'
);

reset role;

-- The refused call's own unit went with its error (a failed RPC rolls back),
-- so the window holds at ten and every further call is refused the same way.
select is(
  (select "count" from rate_limits
    where profile_id = 'acacacac-0000-0000-0000-00000000000a' and bucket = 'report_driver'),
  10,
  'the limiter holds ten for the day: valid reports, repeats included'
);

-- ══ Hide driver (block) ══════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"acacacac-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ insert into blocks (blocked_id) values ('acacacac-0000-0000-0000-00000000000b') $$,
  'a driver can block another by naming only who'
);
select lives_ok(
  $$ insert into blocks (blocked_id) values ('acacacac-0000-0000-0000-00000000000b')
     on conflict do nothing $$,
  'blocking twice is a no-op (insert … on conflict do nothing)'
);
select results_eq(
  $$ select blocker_id::text, blocked_id::text from blocks $$,
  $$ values ('acacacac-0000-0000-0000-00000000000a', 'acacacac-0000-0000-0000-00000000000b') $$,
  'the block is theirs: blocker_id defaulted to the caller'
);
select results_eq(
  $$ select blocked_id::text, username from public.list_blocked() $$,
  $$ values ('acacacac-0000-0000-0000-00000000000b', 'renamed_target') $$,
  'list_blocked names who they blocked, as they are called now'
);
select throws_ok(
  $$ insert into blocks (blocker_id, blocked_id)
     values ('acacacac-0000-0000-0000-00000000000c', 'acacacac-0000-0000-0000-00000000000b') $$,
  '42501', null, 'ATTACK BLOCKED: cannot block on someone else''s behalf'
);
select throws_ok(
  $$ insert into blocks (blocked_id) values (auth.uid()) $$,
  '23514', null, 'cannot block yourself'
);
select throws_ok(
  $$ update blocks set created_at = now() - interval '1 year' $$,
  '42501', null, 'a block cannot be edited, only removed'
);

set local request.jwt.claims = '{"sub":"acacacac-0000-0000-0000-00000000000c","role":"authenticated"}';
select is_empty($$ select 1 from blocks $$, 'another driver cannot see that the block exists');
select is_empty($$ select 1 from public.list_blocked() $$, '…nor through list_blocked');
select lives_ok(
  $$ delete from blocks where blocker_id = 'acacacac-0000-0000-0000-00000000000a' $$,
  'their delete aimed at it runs…'
);

set local request.jwt.claims = '{"sub":"acacacac-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from blocks), 1, '…and removed nothing');
select lives_ok(
  $$ delete from blocks where blocked_id = 'acacacac-0000-0000-0000-00000000000b' $$,
  'the blocker can unblock'
);
select is_empty($$ select 1 from public.list_blocked() $$, 'and the list is empty again');

-- ══ hidden by the owner ══════════════════════════════════════════════════════

select throws_ok($$ select 1 from moderation_hidden $$, '42501', null,
  'ATTACK BLOCKED: a client cannot see who is hidden');
select throws_ok(
  $$ delete from moderation_hidden $$,
  '42501', null, 'ATTACK BLOCKED: and cannot unhide anyone'
);
select throws_ok($$ select 1 from blocked_terms $$, '42501', null,
  'ATTACK BLOCKED: a client cannot read the denylist');

-- ══ terms acceptance ═════════════════════════════════════════════════════════

select lives_ok(
  $$ insert into onboarding_answers (profile_id, focus, terms_accepted_at)
     values (auth.uid(), 'topSpeed', '2026-10-01 09:30:00+00')
     on conflict (profile_id) do update
       set profile_id = excluded.profile_id, focus = excluded.focus,
           terms_accepted_at = excluded.terms_accepted_at $$,
  'a driver records when they accepted the Terms, with their answers'
);
select is(
  (select terms_accepted_at from onboarding_answers where profile_id = auth.uid()),
  '2026-10-01 09:30:00+00'::timestamptz,
  'and it reads back'
);
select lives_ok(
  $$ insert into onboarding_answers (profile_id, attribution, terms_accepted_at)
     values (auth.uid(), 'friend', null)
     on conflict (profile_id) do update
       set profile_id = excluded.profile_id, attribution = excluded.attribution,
           terms_accepted_at = excluded.terms_accepted_at $$,
  'a later upsert that sends null for it runs…'
);
select is(
  (select terms_accepted_at from onboarding_answers where profile_id = auth.uid()),
  '2026-10-01 09:30:00+00'::timestamptz,
  '…and does not erase the acceptance'
);
select lives_ok(
  $$ update onboarding_answers set terms_accepted_at = now() + interval '3 days'
      where profile_id = auth.uid() $$,
  'a fast device clock is accepted…'
);
select is(
  (select terms_accepted_at from onboarding_answers where profile_id = auth.uid()),
  now(),
  '…but recorded as the server''s now, never in the future'
);
select throws_ok(
  $$ insert into onboarding_answers (profile_id, terms_accepted_at)
     values ('acacacac-0000-0000-0000-00000000000b', now()) $$,
  '42501', null, 'ATTACK BLOCKED: cannot accept the Terms for someone else'
);

reset role;

select column_privs_are('public', 'onboarding_answers', 'terms_accepted_at', 'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'], 'authenticated may write terms_accepted_at');

-- ══ accounts go, and take their moderation rows with them ═══════════════════

insert into blocks (blocker_id, blocked_id)
values ('acacacac-0000-0000-0000-00000000000b', 'acacacac-0000-0000-0000-00000000000a');
insert into moderation_hidden (profile_id, reason)
values ('acacacac-0000-0000-0000-00000000000a', 'test');

delete from auth.users where id = 'acacacac-0000-0000-0000-00000000000a';

select is_empty(
  $$ select 1 from driver_reports where reporter_id = 'acacacac-0000-0000-0000-00000000000a' $$,
  'the reporter''s reports go with their account'
);
select is_empty(
  $$ select 1 from blocks where 'acacacac-0000-0000-0000-00000000000a' in (blocker_id, blocked_id) $$,
  'blocks by and of them go too'
);
select is_empty(
  $$ select 1 from moderation_hidden where profile_id = 'acacacac-0000-0000-0000-00000000000a' $$,
  'and so does their hidden entry'
);

select * from finish();
rollback;
