-- PDPA retention purge — runs daily at 20:15 SGT via pg_cron (job: pdpa-retention-purge).
-- Applied to Supabase project nempslbewxtlikfzachi.
-- 2026-07-08: added weakness_tags fade so resolved weaknesses stop shadowing grading
--             and the table is retention-consistent with the rest.

CREATE OR REPLACE FUNCTION public.pdpa_retention_purge()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.conversation_history      where created_at < now() - interval '12 months';
  delete from public.student_question_requests where created_at < now() - interval '12 months';
  delete from public.student_attempts          where attempted_at < now() - interval '24 months';
  delete from public.portal_invite_tokens
    where (consumed_at is not null and consumed_at < now() - interval '3 months')
       or (consumed_at is null and expires_at < now() - interval '3 months');
  -- Weakness memory fades: drop error tags not seen in 12 months.
  delete from public.weakness_tags             where last_seen < now() - interval '12 months';
end;
$function$;
