-- Applied 5 Oct 2026 (Phase G re-audit). The twin views ran as their owner (security
-- definer) and were readable with the public anon key; every reader uses the service key.
revoke select on public.twin_queue from anon, authenticated;
revoke select on public.twin_readiness from anon, authenticated;
alter view public.twin_queue set (security_invoker = true);
alter view public.twin_readiness set (security_invoker = true);
-- explanations: the anon policy lets anyone LIST rows, which carried the Telegram
-- chat_id. Keep the columns the /explain page reads; drop chat_id from anon.
revoke select on public.explanations from anon, authenticated;
grant select (id, question_text, bot_answer, content, topic, level, identified_subgroup_id,
              identified_subgroup_name, created_at, expires_at) on public.explanations to anon;
