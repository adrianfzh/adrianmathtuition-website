-- Twins phase 2 (30 Sep 2026, SPEC-TWINS.md §6): the flip, per (tree level, topic).
-- A row exists only once Adrian has flipped a topic; no row = school rows still
-- served. Where school_rows is false, the four serving RPCs admit only our own
-- rows (school in ('AdrianMath', 'AI Generated')). Nothing flips itself: the
-- only writer is POST /api/admin/serving-policy, which refuses a flip below the
-- threshold (verified twins ≥ school rows drawn in 90 days) and logs who flipped.

create table if not exists public.serving_policy (
  level text not null,
  topic text not null,
  school_rows boolean not null default true,
  flipped_at timestamptz,
  flipped_by text,
  primary key (level, topic)
);
alter table public.serving_policy enable row level security;
comment on table public.serving_policy is 'SPEC-TWINS §6: per (subgroups.level, topic) — school_rows=false means only AdrianMath / AI Generated rows are served there. Written only by /api/admin/serving-policy.';

create or replace function public.serving_school_rows(p_level text, p_topic text)
returns boolean language sql stable
set search_path to 'public'
as $$
  select coalesce((select sp.school_rows from public.serving_policy sp where sp.level = p_level and sp.topic = p_topic), true);
$$;

-- Readiness per (level, topic): what the ops board's Flip button reads.
create or replace view public.twin_readiness as
with filed as (
  select distinct s.level, s.topic, q.id, q.school, q.twin_of, q.verified, q.ai_generated, q.national
  from public.question_subgroups qs
  join public.subgroups s on s.id = qs.subgroup_id
  join public.questions q on q.id = qs.question_id
  where q.deleted_at is null
),
drawn as (select distinct source_id from public.twin_queue where draws_90d > 0)
select f.level, f.topic,
  (count(*) filter (where f.twin_of is not null and f.verified))::int as verified_twins,
  (count(*) filter (where f.twin_of is not null and not coalesce(f.verified, false)))::int as pending_twins,
  (count(*) filter (where f.school not in ('AdrianMath', 'AI Generated', 'GCE') and not coalesce(f.national, false) and f.ai_generated is not true))::int as school_rows,
  (count(*) filter (where d.source_id is not null))::int as drawn_90d,
  coalesce(sp.school_rows, true) as school_rows_served,
  sp.flipped_at, sp.flipped_by
from filed f
left join drawn d on d.source_id = f.id
left join public.serving_policy sp on sp.level = f.level and sp.topic = f.topic
group by f.level, f.topic, sp.school_rows, sp.flipped_at, sp.flipped_by;

comment on view public.twin_readiness is 'SPEC-TWINS §6: per (tree level, topic) — verified/pending twins, school rows, school rows drawn in 90 days, and the current policy. Flip is ready when verified_twins >= drawn_90d and verified_twins > 0.';

-- The four serving doors: where a topic is flipped, only our own rows pass.

create or replace function public.practice_pool(p_level text, p_topic text DEFAULT NULL::text, p_is_ip boolean DEFAULT false, p_admin boolean DEFAULT false)
 returns table(topic text, question_id uuid)
 language sql stable
as $function$
  with tree as (
    select s.id, s.topic,
           public.subgroup_visible(s.level, s.visibility, s.ip_extra_level, p_level, p_is_ip, p_admin) as visible,
           coalesce(s.visibility, 'all') = 'ip' as ip_only
    from public.subgroups s
    where s.level = p_level or coalesce(s.ip_extra_level, '') = p_level
  ),
  live_topics as (
    select distinct t.topic from tree t
    where t.visible and (p_topic is null or t.topic = p_topic)
  ),
  blocked as (
    select qs.question_id
    from public.question_subgroups qs
    join tree t on t.id = qs.subgroup_id
    group by qs.question_id
    having bool_and(not t.visible)
  )
  select t.topic, qs.question_id
  from public.question_subgroups qs
  join tree t on t.id = qs.subgroup_id
  join public.questions q on q.id = qs.question_id
  where t.visible
    and not q.national
    and (p_topic is null or t.topic = p_topic)
    and (not q.legacy_syllabus or t.ip_only)
    and (q.school in ('AdrianMath', 'AI Generated') or public.serving_school_rows(p_level, t.topic))
  union
  select lt.topic, q.id
  from live_topics lt
  join public.questions q on q.topics @> array[lt.topic]
  where q.deleted_at is null
    and not q.national
    and not q.legacy_syllabus
    and q.level = any(public.practice_qlevels(p_level))
    and (q.school in ('AdrianMath', 'AI Generated') or public.serving_school_rows(p_level, lt.topic))
    and not exists (
      select 1 from public.question_subgroups qs
      join tree t on t.id = qs.subgroup_id
      where qs.question_id = q.id and t.topic = lt.topic
    )
    and not exists (select 1 from blocked b where b.question_id = q.id);
$function$;

create or replace function public.practice_next(p_level text, p_topic text, p_exclude uuid[] DEFAULT '{}'::uuid[], p_tier text DEFAULT NULL::text, p_subgroup bigint DEFAULT NULL::bigint, p_qlevel text DEFAULT NULL::text, p_is_ip boolean DEFAULT false, p_admin boolean DEFAULT false)
 returns table(id uuid, question_text text, parts jsonb, total_marks integer, has_image boolean, image_url text, images jsonb, figure_url text, school text, year integer, paper text, question_number text, has_solution boolean)
 language sql stable
as $function$
  select q.id, q.question_text, q.parts, q.total_marks,
         q.has_image, q.image_url, q.images, q.figure_url,
         q.school, q.year, q.paper, q.question_number,
         (q.solution is not null and q.solution <> '') as has_solution
  from public.questions q
  where q.deleted_at is null
    and not q.national
    and (not q.legacy_syllabus or exists (
      select 1 from public.question_subgroups qs
      join public.subgroups s on s.id = qs.subgroup_id
      where qs.question_id = q.id and coalesce(s.visibility, 'all') = 'ip'
        and public.subgroup_visible(s.level, s.visibility, s.ip_extra_level, p_level, p_is_ip, p_admin)
    ))
    and (p_qlevel is null or q.level = p_qlevel)
    and coalesce(q.flagged_count, 0) < 3
    and (q.ai_generated is not true or q.verified = true)
    and (q.school in ('AdrianMath', 'AI Generated') or public.serving_school_rows(p_level, p_topic))
    and ((q.solution is not null and q.solution <> '') or (q.answer is not null and q.answer <> ''))
    and ((q.question_text is not null and q.question_text <> '')
         or q.has_image = true
         or (q.image_url is not null and q.image_url <> '')
         or (q.parts is not null and jsonb_array_length(coalesce(q.parts,'[]'::jsonb)) > 0))
    and not (q.id = any(coalesce(p_exclude, '{}'::uuid[])))
    and (
      p_tier is null
      or (p_tier = 'Advanced' and q.difficulty in ('Advanced', 'Challenging'))
      or (p_tier = 'Standard' and coalesce(q.difficulty, 'Standard') not in ('Advanced', 'Challenging'))
    )
    and (
      (p_subgroup is null and q.id in (
        select p.question_id from public.practice_pool(p_level, p_topic, p_is_ip, p_admin) p
      ))
      or (p_subgroup is not null and q.id in (
        select qs.question_id
        from public.question_subgroups qs
        join public.subgroups s on s.id = qs.subgroup_id
        where s.id = p_subgroup and s.topic = p_topic
          and public.subgroup_visible(s.level, s.visibility, s.ip_extra_level, p_level, p_is_ip, p_admin)
      ))
    )
    and not exists (select 1 from public.figure_flags ff where ff.question_id = q.id and ff.status = 'open')
  order by random()
  limit 1;
$function$;

create or replace function public.practice_candidates(p_level text, p_topic text, p_tier text DEFAULT NULL::text, p_limit integer DEFAULT 12)
 returns table(id uuid, question_text text, parts jsonb, total_marks integer, has_image boolean, image_url text, images jsonb, figure_url text, school text, year integer, paper text, question_number text, difficulty text, has_solution boolean)
 language sql stable
as $function$
  select q.id, q.question_text, q.parts, q.total_marks,
         q.has_image, q.image_url, q.images, q.figure_url,
         q.school, q.year, q.paper, q.question_number, q.difficulty,
         (q.solution is not null and q.solution <> '') as has_solution
  from public.questions q
  where q.deleted_at is null
    and not q.national
    and coalesce(q.flagged_count, 0) < 3
    and (q.ai_generated is not true or q.verified = true)
    and (q.school in ('AdrianMath', 'AI Generated') or public.serving_school_rows(p_level, p_topic))
    and ((q.solution is not null and q.solution <> '') or (q.answer is not null and q.answer <> ''))
    and ((q.question_text is not null and q.question_text <> '')
         or q.has_image = true
         or (q.image_url is not null and q.image_url <> '')
         or (q.parts is not null and jsonb_array_length(coalesce(q.parts,'[]'::jsonb)) > 0))
    and (
      p_tier is null
      or (p_tier = 'Advanced' and q.difficulty in ('Advanced', 'Challenging'))
      or (p_tier = 'Standard' and coalesce(q.difficulty, 'Standard') not in ('Advanced', 'Challenging'))
    )
    and q.id in (select p.question_id from public.practice_pool(p_level, p_topic, true, true) p)
    and not exists (select 1 from public.figure_flags ff where ff.question_id = q.id and ff.status = 'open')
  order by random()
  limit greatest(1, least(coalesce(p_limit, 12), 40));
$function$;

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
    and (q.school in ('AdrianMath', 'AI Generated') or public.serving_school_rows(p_sg_level, p_topic))
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
