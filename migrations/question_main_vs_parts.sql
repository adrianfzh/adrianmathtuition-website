-- 15 Oct 2026: a check that flags a question whose main sub-skill differs from its part labels.
-- SPEC-PART-SKILLS.md. A row = the part labels put the most marks on a sub-skill that the question is NOT filed
-- under at all (in that topic); filed under any of the tied top sub-skills is fine. Read-only; applied to BOTH projects.
create or replace view public.question_main_vs_parts as
with per as (
  select p.question_id, p.subgroup_id, s.topic, s.level, sum(coalesce(p.marks,0)) marks
  from public.question_part_subgroups p join public.subgroups s on s.id = p.subgroup_id
  group by 1,2,3,4
), top as (
  select question_id, topic, level, max(marks) top_marks from per group by 1,2,3
), filed as (  -- every filing of the question inside that topic (main + secondary)
  select t.question_id, t.topic, t.level, m.subgroup_id, m.is_primary, coalesce(pm.marks,0) pmarks
  from top t
  join public.question_subgroups m on m.question_id = t.question_id
  join public.subgroups ms on ms.id = m.subgroup_id and ms.topic = t.topic and ms.level = t.level
  left join per pm on pm.question_id = m.question_id and pm.subgroup_id = m.subgroup_id
)
select t.question_id, t.level as tree, t.topic,
       (select string_agg(f.subgroup_id::text, ',') from filed f where f.question_id=t.question_id and f.topic=t.topic and f.level=t.level) as filed_subgroup_ids,
       t.top_marks,
       (select string_agg(p2.subgroup_id::text, ',') from per p2 where p2.question_id=t.question_id and p2.topic=t.topic and p2.level=t.level and p2.marks=t.top_marks) as parts_say
from top t
where exists (select 1 from filed f where f.question_id=t.question_id and f.topic=t.topic and f.level=t.level)
  and not exists (select 1 from filed f where f.question_id=t.question_id and f.topic=t.topic and f.level=t.level and f.pmarks = t.top_marks);

-- 19 Oct 2026: the daily leak test found this view readable by a signed-out visitor (50 rows).
-- It is an admin check view only (nothing in the app reads it): run as the caller, no anon/authenticated access.
-- Applied to both projects (maths nempslbewxtlikfzachi, science eaxnstsecxmqdobfvmjh).
alter view public.question_main_vs_parts set (security_invoker = true);
revoke all on public.question_main_vs_parts from anon, authenticated;
