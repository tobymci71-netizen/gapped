-- Gapped — make table privileges deterministic, not inherited.
--
-- Found by running the round-trip against a real cloud project after it had
-- passed locally: `select * from drive_routes_private` returned an empty list
-- there instead of "permission denied". Empty means SELECT was *granted* and
-- RLS filtered the rows; denied means there was no privilege path at all.
--
-- The cause is that "the default ACL" is not one thing. This machine's CLI
-- creates tables in `public` with almost nothing granted to anon/authenticated
-- (see 0002), while the cloud project grants them full INSERT/SELECT/UPDATE/
-- DELETE. So 0002 and 0005 were written against one default and deployed onto
-- the other, and tables that were supposed to have no client privileges at all
-- — drive_routes_private, device_attestations — arrived with every privilege.
--
-- Nothing was exposed: both tables have RLS on with zero policies, and RLS is
-- default-deny, so every row was filtered. But that is protection by accident.
-- It means the untrimmed route and the attestation keys were one stray policy
-- away from being world-writable, and the comments in 0002/0005 claiming "no
-- grants" were not true on the deployed project.
--
-- The fix is to stop inheriting: revoke everything from the client roles on
-- every table we own, then grant back exactly the intended set. After this the
-- privilege state is identical on any project, whatever its defaults were, and
-- reading the grants tells you the real story.

-- ── 1. Start from zero on every table this schema owns ──────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'vehicles', 'drives', 'drive_fixes', 'drive_routes_private',
    'leaderboard_entries', 'friendships', 'achievements', 'device_attestations'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated, public', t);
  end loop;
end $$;

-- Future tables in this schema must not inherit client privileges either.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ── 2. Grant back exactly what the policy model needs ───────────────────────
-- service_role is the verification authority: RLS-exempt, full access.
grant select, insert, update, delete on all tables in schema public to service_role;

-- profiles: usernames are public (boards); only the owner writes.
grant select         on profiles to anon, authenticated;
grant insert, update on profiles to authenticated;

grant select, insert, update, delete on vehicles    to authenticated;
grant select, delete                 on drives      to authenticated;
grant select, insert                 on drive_fixes to authenticated;

-- drives inserts stay column-scoped (0005): the client may name only the
-- advisory columns, never route, attestation or verification_meta.
grant insert (
  id, profile_id, vehicle_id, started_at, ended_at,
  distance_m, duration_s, max_speed_ms, avg_speed_ms,
  max_g, avg_g, zero_to_60_s, verification
) on drives to authenticated;

-- Boards and achievements are world-readable; writes are service-role only.
grant select on leaderboard_entries to anon, authenticated;
grant select on achievements        to anon, authenticated;

grant select, insert, delete on friendships to authenticated;

-- drive_routes_private and device_attestations get nothing, on purpose, and
-- now demonstrably: the untrimmed route and the attested device keys have no
-- privilege path from a client, independent of RLS.

-- ── 3. Functions ────────────────────────────────────────────────────────────
-- Same reasoning: EXECUTE defaults to PUBLIC on new functions, so be explicit
-- about which ones a client may call.
revoke all on function public.delete_account()   from public, anon;
revoke all on function public.add_friend(text)   from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.list_friends()     from public, anon;

grant execute on function public.delete_account()    to authenticated;
grant execute on function public.add_friend(text)    to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friends()      to authenticated;

-- Boards are readable signed-out, so board_top stays open to anon.
grant execute on function
  public.board_top(text, text, text, text, boolean, int) to anon, authenticated;
