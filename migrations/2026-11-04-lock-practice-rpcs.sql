-- Lock the two practice counting functions to the server (Adrian, 4 Nov 2026: "Yes, fix them").
-- MATHS project nempslbewxtlikfzachi.
--
-- What was wrong: practice_topics and practice_subgroups are SECURITY DEFINER (they
-- read the bank, which is locked to everyone but the server) and anyone holding the
-- public anon key could call them through /rest/v1/rpc/… with p_admin=true.
-- Measured 4 Nov 2026, level AM: anon got 41 topic names (students see 30) and
-- 227 sub-skill names (students see 221) — names and counts of admin-only and
-- IP-only content, never the questions themselves.
--
-- Every real caller already runs on the server with the service-role key
-- (getSupabaseAdmin() in portal/practice/{topics,overview,subgroups,timed-set},
-- kiosk/topics, bot/worksheet, kiosk-pool; health-check uses SUPABASE_SECRET_KEY).
-- No browser code and nothing in the bot repo calls them. So: take EXECUTE away
-- from PUBLIC, anon and authenticated; service_role keeps it. search_path was
-- already pinned to 'public' on both.
--
-- If either function is ever DROPPED and re-created (not CREATE OR REPLACE),
-- Supabase's default privileges grant anon/authenticated again — repeat these lines.

revoke execute on function public.practice_topics(text, text, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke execute on function public.practice_subgroups(text, text, text, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.practice_topics(text, text, boolean, boolean, boolean) to service_role;
grant execute on function public.practice_subgroups(text, text, text, boolean, boolean, boolean) to service_role;
