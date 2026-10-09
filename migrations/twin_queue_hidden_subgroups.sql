-- 9 Oct 2026 — a HIDDEN sub-skill is never asked for twins (Adrian: "yes to all three").
-- Runs on the MATHS project. Applied 9 Oct 2026 (by hand).
--
-- What leaked: `subgroups.visibility = 'hidden'` (lib/subgroup-visibility.ts) takes a sub-skill
-- off the practice lists, the kiosk and Find, but the twins side never read the column. Live
-- proof on 9 Oct 2026: JC sub-skill 863 "Linear first-order with integrating factor" is hidden,
-- its 8 school questions are not marked old syllabus, and math_twin_units asked for 5 twins.
--
-- The fix is in the VIEW, not in math_twin_units: the function (migrations/math_twin_units.sql),
-- scripts/twins/twin.mjs `queue`, the cloud door (lib/twin-store.ts) and the dashboard tile all
-- read their seeds from twin_queue, and twin.mjs also pages the view itself — so a rule placed
-- only in the function would leave the lane offering the same seeds. math_twin_units is unchanged.
--
-- The rule, value by value (the SQL half of lib/subgroup-visibility.ts normaliseVisibility):
--   'all' / NULL  open — twins wanted, as before.
--   'ip'          open — IP students are still taught it (A Math Modulus), so twins are wanted.
--   'hidden'      closed — and so is any value the code does not know (fails closed).
-- A seed's sub-skill is now its best OPEN filing (primary first, then confidence): a question
-- filed under a hidden sub-skill AND an open one is counted under the open one, the way the
-- practice lists serve it. A question filed ONLY under closed sub-skills is not a seed at all
-- (the practice lists never serve it either). An unfiled question is untouched (subgroup_id null).
--
-- Columns and order are the same as migrations/twin_queue.sql, so CREATE OR REPLACE keeps the
-- grants — but NOT security_invoker (see the ALTER VIEW after the view).
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
  order by qs.question_id, qs.is_primary desc nulls last, qs.confidence desc nulls last
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
  -- filed, but only under closed sub-skills → not a seed
  and (p.question_id is not null or not exists (select 1 from public.question_subgroups qs where qs.question_id = q.id));

-- CREATE OR REPLACE VIEW drops the option (seen when this file was applied on 9 Oct 2026) — set it again.
alter view public.twin_queue set (security_invoker = true);

comment on view public.twin_queue is 'SPEC-TWINS §9: school rows to twin. Order by draws_90d desc, then by sub-skill for the rest of the pool. text_len = 0 means the question lives only in its image (skip). A hidden sub-skill offers no seeds (9 Oct 2026).';
