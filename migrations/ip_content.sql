-- IP-ONLY CONTENT for IP students (Adrian, 15 Oct 2026: "yes").
--
-- Two flags on a maths bank row mean different things:
--   legacy_syllabus = true  → the SERVING GATE: not on the current O-Level syllabus.
--   ip_syllabus     = true  → PROVENANCE: the row came from an IP school's paper.
-- A row with BOTH is IP-only content (TJC MSM Progressions, Permutations and
-- Combinations, Vectors, Matrices, Functions; questions built on methods only IP
-- schools teach). Until today it reached nobody. A row that is legacy but NOT
-- ip_syllabus is old O-Level syllabus (GCE papers 2003–2013) and stays blocked
-- for everyone — except the A Math Modulus rows filed under visibility='ip'
-- sub-groups, which IP students have been served since 2 Sep 2026
-- (subgroup_audience.sql) and which this file leaves alone.
--
-- THE RULE (lib/ip-content.ts is the TypeScript twin — keep the two in step):
--   a legacy_syllabus row serves  iff  filed under a visible 'ip' sub-group (unchanged)
--                                  or  p_ip_content and ip_syllabus.
--   p_ip_content = the caller's verdict: Adrian's admin view, the preview student,
--   or an IP student once IP_TOPICS_OPEN_TO_STUDENTS (src/lib/portal-beta.ts) is on.
--   IP-only topics have no sub-groups yet, so a topic also goes live for a
--   p_ip_content caller when an IP-only row at this level carries its tag.
--
-- BACKWARD COMPATIBLE: p_ip_content defaults to false, so every caller that
-- does not pass it (kiosk, worksheets, the bot, practice_candidates,
-- practice_exemplars, the health check) sees exactly what it saw before.
-- Signatures change, so the old overloads are DROPPED first (PostgREST cannot
-- choose between two overloads given a subset of named params).

begin;

drop function if exists public.practice_pool(text, text, boolean, boolean);
drop function if exists public.practice_next(text, text, uuid[], text, bigint, text, boolean, boolean);
drop function if exists public.practice_subgroups(text, text, text, boolean, boolean);
drop function if exists public.practice_topics(text, text, boolean, boolean);
drop function if exists public.practice_overview(uuid, text, text, boolean, boolean);

-- ── practice_pool ───────────────────────────────────────────────────────────
create or replace function public.practice_pool(
  p_level text, p_topic text default null,
  p_is_ip boolean default false, p_admin boolean default false,
  p_ip_content boolean default false
)
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
    union
    -- IP-only topics with no sub-groups yet (Progressions, Vectors, …): live for
    -- an IP-content caller while an IP-only row at this level carries the tag.
    select distinct tg.topic
    from public.questions q, unnest(coalesce(q.topics, '{}')) as tg(topic)
    where p_ip_content
      and q.legacy_syllabus and q.ip_syllabus
      and q.deleted_at is null and not q.national
      and q.level = any(public.practice_qlevels(p_level))
      and (p_topic is null or tg.topic = p_topic)
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
    and (not q.legacy_syllabus or t.ip_only or (p_ip_content and q.ip_syllabus))
    and (q.school in ('AdrianMath', 'AI Generated') or public.serving_school_rows(p_level, t.topic))
  union
  select lt.topic, q.id
  from live_topics lt
  join public.questions q on q.topics @> array[lt.topic]
  where q.deleted_at is null
    and not q.national
    and (not q.legacy_syllabus or (p_ip_content and q.ip_syllabus))
    and q.level = any(public.practice_qlevels(p_level))
    and (q.school in ('AdrianMath', 'AI Generated') or public.serving_school_rows(p_level, lt.topic))
    and not exists (
      select 1 from public.question_subgroups qs
      join tree t on t.id = qs.subgroup_id
      where qs.question_id = q.id and t.topic = lt.topic
    )
    and not exists (select 1 from blocked b where b.question_id = q.id);
$function$;

-- ── practice_next ───────────────────────────────────────────────────────────
create or replace function public.practice_next(
  p_level text, p_topic text, p_exclude uuid[] default '{}'::uuid[],
  p_tier text default null, p_subgroup bigint default null, p_qlevel text default null,
  p_is_ip boolean default false, p_admin boolean default false,
  p_ip_content boolean default false
)
returns table(id uuid, question_text text, parts jsonb, total_marks integer, has_image boolean,
              image_url text, images jsonb, figure_url text, school text, year integer,
              paper text, question_number text, has_solution boolean)
language sql stable
as $function$
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
      or (p_tier = 'Advanced' and q.difficulty in ('Advanced', 'Challenging'))
      or (p_tier = 'Standard' and coalesce(q.difficulty, 'Standard') not in ('Advanced', 'Challenging'))
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

-- ── practice_subgroups ──────────────────────────────────────────────────────
create or replace function public.practice_subgroups(
  p_level text, p_topic text default null, p_qlevel text default null,
  p_is_ip boolean default false, p_admin boolean default false,
  p_ip_content boolean default false
)
returns table(id bigint, topic text, name text, order_index real, n bigint, advanced_count bigint,
              level text, visibility text, ip_extra_level text)
language sql stable security definer
set search_path to 'public'
as $function$
  select s.id, s.topic, s.name, s.order_index,
         count(distinct q.id) as n,
         count(distinct q.id) filter (where q.difficulty in ('Advanced', 'Challenging')) as advanced_count,
         s.level, coalesce(s.visibility, 'all') as visibility, s.ip_extra_level
  from public.subgroups s
  join public.question_subgroups qs on qs.subgroup_id = s.id
  join public.questions q on q.id = qs.question_id
  where public.subgroup_visible(s.level, s.visibility, s.ip_extra_level, p_level, p_is_ip, p_admin)
    and (p_topic is null or s.topic = p_topic)
    and (p_qlevel is null or q.level = p_qlevel)
    and q.deleted_at is null
    and (not q.legacy_syllabus or coalesce(s.visibility, 'all') = 'ip' or (p_ip_content and q.ip_syllabus))
    and (q.has_image = false or q.figure_url is not null or q.image_watermark_status = 'clean')
    and ((q.solution is not null and q.solution <> '')
      or (q.answer is not null and q.answer <> '')
      or (q.parts::text like '%"answer"%'))
  group by s.id, s.topic, s.name, s.order_index, s.level, s.visibility, s.ip_extra_level
  having count(distinct q.id) > 0
  order by s.topic, s.order_index, s.name;
$function$;

-- ── practice_topics ─────────────────────────────────────────────────────────
create or replace function public.practice_topics(
  p_level text, p_qlevel text default null,
  p_is_ip boolean default false, p_admin boolean default false,
  p_ip_content boolean default false
)
returns table(topic text, n bigint, advanced_count bigint)
language sql stable security definer
set search_path to 'public'
as $function$
  select p.topic,
         count(distinct q.id) as n,
         count(distinct q.id) filter (where lower(q.difficulty) in ('advanced', 'challenging', 'bonus')) as advanced_count
  from public.practice_pool(p_level, null, p_is_ip, p_admin, p_ip_content) p
  join public.questions q on q.id = p.question_id
  where (p_qlevel is null or q.level = p_qlevel)
    and q.deleted_at is null
    and (q.has_image = false or q.figure_url is not null or q.image_watermark_status = 'clean')
    and ((q.solution is not null and q.solution <> '')
      or (q.answer is not null and q.answer <> '')
      or (q.parts::text like '%"answer"%'))
  group by p.topic
  having count(distinct q.id) > 0
  order by p.topic;
$function$;

-- ── practice_overview ───────────────────────────────────────────────────────
create or replace function public.practice_overview(
  p_user uuid, p_level text, p_qlevel text default null,
  p_is_ip boolean default false, p_admin boolean default false,
  p_ip_content boolean default false
)
returns table(topic text, question_count bigint, advanced_count bigint, attempts bigint,
              avg_mastery numeric, last_practiced_at timestamp with time zone)
language sql stable
as $function$
  with pool as (
    select p.topic, p.question_id from public.practice_pool(p_level, null, p_is_ip, p_admin, p_ip_content) p
  ),
  topics as (
    select p.topic,
           count(distinct q.id) as question_count,
           count(distinct q.id) filter (where q.difficulty in ('Advanced', 'Challenging')) as advanced_count
    from pool p
    join public.questions q on q.id = p.question_id
    where (p_qlevel is null or q.level = p_qlevel)
      and q.deleted_at is null
      and ((q.solution is not null and q.solution <> '') or (q.answer is not null and q.answer <> ''))
    group by p.topic
    having count(distinct q.id) > 0
  ),
  attempt_topics as (
    select distinct
      sa.id as attempt_id,
      p.topic,
      sa.attempted_at,
      coalesce(
        case
          when (sa.marking_json->>'outOf') ~ '^[0-9]+(\.[0-9]+)?$'
               and (sa.marking_json->>'outOf')::numeric > 0
               and (sa.marking_json->>'score') ~ '^[0-9]+(\.[0-9]+)?$'
          then (sa.marking_json->>'score')::numeric / (sa.marking_json->>'outOf')::numeric * 100
        end,
        case lower(coalesce(sa.marking_json->>'verdict', sa.marking_verdict, ''))
          when 'correct' then 100
          when 'partial' then 50
          when 'wrong' then 0
          when 'incorrect' then 0
          else null
        end
      ) as mastery
    from public.student_attempts sa
    join pool p on p.question_id = sa.question_id
    where sa.user_id = p_user
  ),
  att as (
    select topic,
           count(*) as attempts,
           avg(mastery) as avg_mastery,
           max(attempted_at) as last_practiced_at
    from attempt_topics
    group by topic
  )
  select t.topic,
         t.question_count,
         t.advanced_count,
         coalesce(a.attempts, 0) as attempts,
         a.avg_mastery,
         a.last_practiced_at
  from topics t
  left join att a on a.topic = t.topic
  order by t.topic;
$function$;

grant execute on function public.practice_pool(text, text, boolean, boolean, boolean) to anon, authenticated, service_role;
grant execute on function public.practice_next(text, text, uuid[], text, bigint, text, boolean, boolean, boolean) to anon, authenticated, service_role;
grant execute on function public.practice_subgroups(text, text, text, boolean, boolean, boolean) to anon, authenticated, service_role;
grant execute on function public.practice_topics(text, text, boolean, boolean, boolean) to anon, authenticated, service_role;
grant execute on function public.practice_overview(uuid, text, text, boolean, boolean, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
