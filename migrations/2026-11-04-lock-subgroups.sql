-- Lock the sub-skill table to the server (Adrian, 4 Nov 2026: "lock the sub-skill names table").
-- MATHS project nempslbewxtlikfzachi.
--
-- Why: policy "anon read subgroups" (using true) let anyone holding the public key read every
-- sub-skill name — including visibility 'hidden' and IP-only ones — straight from
-- /rest/v1/subgroups. Names only (no questions, nothing about students), but it undid the
-- point of locking practice_topics / practice_subgroups the same day.
--
-- Who still reads it, all on the server with the service key (bypasses RLS):
--   /revise/[topic]/[subtopic]/{recall,refresher,worked-examples} — switched to getSupabaseAdmin()
--   for their sub-skill reads in the same commit (their card reads stay on the public key so the
--   "published snippets only" rule still applies); lib/notes-data.ts loadSubgroupRows — same.
--   Everything else (portal practice, print-paper, photo, kiosk, bot, workers) already used the
--   service key. No browser code reads the table.
-- The weekly leak test's control read moved to sections_meta and 'subgroups' left its
-- PUBLIC_READ list, so a stranger reading it again is reported as a leak.
--
-- APPLY ONLY AFTER the page change is live on the main site.

drop policy if exists "anon read subgroups" on public.subgroups;
revoke select on table public.subgroups from anon, authenticated;
grant select, insert, update, delete on table public.subgroups to service_role;
