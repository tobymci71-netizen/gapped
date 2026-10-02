-- 0013 created consume_rate_limit and revoked it from PUBLIC, intending it to
-- be "service role only" — but never granted it back to service_role. 0007
-- replaced Supabase's default privileges with explicit grants, so the service
-- role does not inherit EXECUTE on new functions either.
--
-- verify-drive calls this limiter with the service-role client and fails
-- CLOSED on any error, so every user-initiated verification returned 429
-- "rate limited": no drive verified, nothing reached a board. Found by
-- `node scripts/verify-roundtrip.mjs` against a fresh local stack
-- ("permission denied for function consume_rate_limit").
--
-- Still never granted to anon or authenticated.

grant execute on function public.consume_rate_limit(uuid, text, int, int) to service_role;
