-- Read-once paper notices (5 Oct 2026, lib/paper-notice.ts READ_ONCE_KINDS).
--
-- Stamps result_json.student_notice.seen_at the first time the STUDENT renders
-- a paper carrying a read-once notice. One atomic jsonb_set, so the stamp never
-- rewrites (and never races) the rest of result_json, and it only ever sets the
-- stamp once: a run whose notice is already seen, of another kind, or owned by
-- someone else is left alone. Returns true when it stamped.
create or replace function public.stamp_paper_notice_seen(p_run_id uuid, p_student_id text, p_kinds text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  with u as (
    update paper_marking_runs
       set result_json = jsonb_set(
             result_json, '{student_notice,seen_at}',
             to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
     where id = p_run_id
       and student_id = p_student_id
       and released_at is not null
       and result_json->'student_notice'->>'kind' = any(p_kinds)
       and (result_json->'student_notice'->>'seen_at') is null
    returning 1
  )
  select exists(select 1 from u);
$$;

revoke all on function public.stamp_paper_notice_seen(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.stamp_paper_notice_seen(uuid, text, text[]) to service_role;
