-- 🎚 Practice levels Core / Advanced / Challenge + Core Short/Long (SPEC-TWINS.md §12, 15 Oct 2026).
-- Same signature as before (no overload); p_tier now reads:
--   'Standard'        Core (anything not Advanced/Challenging)   — unchanged
--   'Standard:short'  Core, 1–4 marks
--   'Standard:long'   Core, 5+ marks
--   'Advanced'        difficulty = Advanced only (Challenging moved to its own level)
--   'Challenge'       difficulty = Challenging
CREATE OR REPLACE FUNCTION public.practice_next(p_level text, p_topic text, p_exclude uuid[] DEFAULT '{}'::uuid[], p_tier text DEFAULT NULL::text, p_subgroup bigint DEFAULT NULL::bigint, p_qlevel text DEFAULT NULL::text, p_is_ip boolean DEFAULT false, p_admin boolean DEFAULT false, p_ip_content boolean DEFAULT false)
 RETURNS TABLE(id uuid, question_text text, parts jsonb, total_marks integer, has_image boolean, image_url text, images jsonb, figure_url text, school text, year integer, paper text, question_number text, has_solution boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select q.id, q.question_text, q.parts, q.total_marks,
         q.has_image, q.image_url, q.images, q.figure_url,
         q.school, q.year, q.paper, q.question_number,
         (q.solution is not null and q.solution <> '') as has_solution
  from public.questions q
  where q.deleted_at is null
    and not q.national
    and (not q.legacy_syllabus
      or (p_ip_content and q.ip_syllabus)
      or exists (
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
      or (p_tier = 'Advanced' and q.difficulty = 'Advanced')
      or (p_tier = 'Challenge' and q.difficulty = 'Challenging')
      or (p_tier like 'Standard%' and coalesce(q.difficulty, 'Standard') not in ('Advanced', 'Challenging')
          and (p_tier = 'Standard'
               or (p_tier = 'Standard:short' and coalesce(q.total_marks, 0) between 1 and 4)
               or (p_tier = 'Standard:long' and q.total_marks >= 5)))
    )
    and (
      (p_subgroup is null and q.id in (
        select p.question_id from public.practice_pool(p_level, p_topic, p_is_ip, p_admin, p_ip_content) p
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
