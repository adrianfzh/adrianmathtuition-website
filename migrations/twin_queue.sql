-- Twins phase 0 (30 Sep 2026, SPEC-TWINS.md §9): the queue of school rows worth
-- twinning, most-drawn first, and the serving guard so an unverified twin never
-- reaches a student. practice_next / practice_candidates already refuse
-- ai_generated rows that are not verified; kiosk_pool did not — fixed here.

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
  and q.ai_generated is not true;

comment on view public.twin_queue is 'SPEC-TWINS §9: school rows to twin. Order by draws_90d desc, then by sub-skill for the rest of the pool. text_len = 0 means the question lives only in its image (skip).';

-- kiosk_pool: the same verified guard practice_next carries.
create or replace function public.kiosk_pool(p_tag_levels text[], p_sg_level text, p_topic text, p_difficulties text[] default null::text[], p_is_ip boolean default false, p_admin boolean default false)
 returns table(id uuid, question_text text, parts jsonb, total_marks integer, answer text, figure_url text, has_image boolean, image_url text)
 language sql stable security definer
 set search_path to 'public'
as $function$
  with tree as (
    select s.id, s.topic,
           public.subgroup_visible(s.level, s.visibility, s.ip_extra_level, p_sg_level, p_is_ip, p_admin) as visible,
           coalesce(s.visibility, 'all') = 'ip' as ip_only
    from public.subgroups s
    where s.level = p_sg_level or coalesce(s.ip_extra_level, '') = p_sg_level
  )
  select q.id, q.question_text, q.parts, q.total_marks, q.answer, q.figure_url, q.has_image, q.image_url
  from public.questions q
  where q.deleted_at is null
    and not q.national
    and (q.ai_generated is not true or q.verified = true)
    and (not q.legacy_syllabus or exists (
      select 1 from public.question_subgroups qs join tree t on t.id = qs.subgroup_id
      where qs.question_id = q.id and t.visible and t.ip_only
    ))
    and q.level = any(p_tag_levels)
    and (
      exists (
        select 1 from public.question_subgroups qs join tree t on t.id = qs.subgroup_id
        where qs.question_id = q.id and t.visible and t.topic = p_topic
      )
      or (
        q.topics && array[p_topic]
        and exists (select 1 from tree t where t.visible and t.topic = p_topic)
        and not exists (
          select 1 from public.question_subgroups qs join tree t on t.id = qs.subgroup_id
          where qs.question_id = q.id
          group by qs.question_id
          having bool_and(not t.visible)
        )
      )
    )
    and (q.has_image = false or q.figure_url is not null or q.image_watermark_status = 'clean')
    and ((q.answer is not null and q.answer <> '') or q.parts::text like '%"answer"%')
    and (p_difficulties is null or q.difficulty = any(p_difficulties))
    and not exists (select 1 from public.figure_flags ff where ff.question_id = q.id and ff.status = 'open')
  order by q.id
  limit 400;
$function$;
