-- 12 Oct 2026 — a seed's sub-skill no longer changes from one read to the next (Adrian: "yes").
-- Runs on the MATHS project. Applied 12 Oct 2026.
--
-- What leaked: primary_sg picks a seed's sub-skill with DISTINCT ON … ORDER BY is_primary,
-- confidence. A question filed under two or three sub-skills with no primary and no confidence
-- (most Sec 3 rows: S3_EM 368 of 1,107 seeds, S3_AM 331 of 1,700) ties, and Postgres returns
-- any one of the tied rows — a different one on different reads. math_twin_units counts a
-- sub-skill's twins through this column, so the count moved: "Express as Product of Prime
-- Factors" (988) read 9 twins and, minutes later, 5. A sub-skill at the cap of 5 sometimes read
-- 4, `twin.mjs need` answered 1, and the lane wrote another — E Math had ~120 twins past 5
-- over 46 sub-skills, ~52 of them written on 10–11 Oct 2026.
--
-- The fix: one more ORDER BY key, the sub-skill id, so a tie always resolves the same way.
-- Nothing else changes. The body is the LIVE definition of 12 Oct 2026 — the 9 Oct file
-- (twin_queue_hidden_subgroups.sql) plus `not parts_have_legacy(q.parts)`, which
-- part_syllabus_keep_marks.sql asked to be folded in and which was applied by hand.
create or replace view public.twin_queue as
with drawn as (
  select question_id from public.student_attempts where attempted_at > now() - interval '90 days'
  union all
  select question_id from public.portal_generation_log where created_at > now() - interval '90 days' and question_id is not null
  union all
  select question_id from public.portal_assignments where created_at > now() - interval '90 days' and question_id is not null
  union all
  select unnest(practice_question_ids) from public.sheet_sections where created_at > now() - interval '90 days'
),
draws as (select question_id, count(*)::int as n from drawn group by question_id),
primary_sg as (
  select distinct on (qs.question_id) qs.question_id, s.id as subgroup_id, s.name as subgroup, s.topic
  from public.question_subgroups qs join public.subgroups s on s.id = qs.subgroup_id
  where coalesce(s.visibility, 'all') in ('all', 'ip')
  order by qs.question_id, qs.is_primary desc nulls last, qs.confidence desc nulls last, s.id
)
select q.id as source_id, q.level, coalesce(p.topic, q.topics[1]) as topic, p.subgroup_id, p.subgroup,
       q.school, q.year, q.total_marks, q.difficulty, q.has_image,
       length(coalesce(q.question_text, '')) + length(coalesce(q.parts::text, '')) as text_len,
       coalesce(d.n, 0) as draws_90d,
       exists (select 1 from public.questions t where t.twin_of = q.id and t.deleted_at is null and t.verified) as has_verified_twin,
       exists (select 1 from public.questions t where t.twin_of = q.id and t.deleted_at is null) as has_any_twin
from public.questions q
left join draws d on d.question_id = q.id
left join primary_sg p on p.question_id = q.id
where q.deleted_at is null
  and q.school not in ('GCE', 'AdrianMath', 'AI Generated')
  and not coalesce(q.national, false)
  and not coalesce(q.legacy_syllabus, false)
  and q.ai_generated is not true
  and not public.parts_have_legacy(q.parts)
  -- filed, but only under closed sub-skills → not a seed
  and (p.question_id is not null or not exists (select 1 from public.question_subgroups qs where qs.question_id = q.id));

-- CREATE OR REPLACE VIEW drops the option (seen on 9 Oct 2026) — set it again.
alter view public.twin_queue set (security_invoker = true);
