-- Sub-group AUDIENCE in the practice / kiosk RPCs (2026-09-02).
--
-- The columns already exist (subgroups.visibility 'all'|'ip'|'hidden' default
-- 'all'; subgroups.ip_extra_level text; portal_accounts.is_ip boolean default
-- false). This file makes every question-serving RPC honour them. The rule is
-- lib/subgroup-visibility.ts, mirrored here as public.subgroup_visible():
--
--   a student sees a sub-group iff  visibility='all' and level matches;
--                                or visibility='ip' and is_ip and level matches;
--                                or ip_extra_level = the student's level and is_ip;
--   'hidden' -> nobody but admin (p_admin sees everything in the tree).
--   A question filed ONLY under sub-groups the audience cannot see is not
--   served through the topic tag either; a topic exists for an audience only
--   while it has >= 1 visible sub-group (so "Modulus Functions" vanishes from
--   a non-IP AM picker, mix and timed set entirely).
--
-- LEGACY × IP (measured 2026-09-02): every one of the 60 Modulus questions
-- (809–814) is legacy_syllabus = true — the 2026-08-28 "cut content never
-- serves" leg — so without a rule the 'ip' verdict would unlock nothing.
-- The two flags mean different syllabuses: legacy = not in the O-Level paper,
-- 'ip' = IP schools still sit it. Resolution here: a legacy question serves
-- ONLY through a filing under a visibility='ip' sub-group the viewer can see
-- (IP student or admin). Legacy questions filed under 'all' sub-groups (23 in
-- AM) or unfiled stay blocked for everyone, exactly as today. (Alternative,
-- if preferred: clear legacy_syllabus on the 60 Modulus rows and drop the
-- `or … ip` clauses below — same outcome for IP students.)
--
-- BACKWARD COMPATIBLE: every new parameter defaults to the ordinary (non-IP,
-- non-admin) student, so callers that predate this file keep working and see
-- the 'all' audience. Run it BEFORE deploying the website build that passes
-- p_is_ip / p_admin. Signatures change (new params; practice_subgroups also
-- gains three columns), so the old overloads are DROPPED first — PostgREST
-- cannot choose between two overloads when a caller passes a subset of named
-- params (/api/health-check already warns about overload drift here).
-- Grants are re-applied to what each function had before the drop
-- (kiosk_pool: postgres + service_role only; the rest: default public grants).

begin;

-- ── The predicate ───────────────────────────────────────────────────────────
create or replace function public.subgroup_visible(
  s_level text, s_visibility text, s_ip_extra_level text,
  p_level text, p_is_ip boolean default false, p_admin boolean default false
) returns boolean
language sql immutable
as $$
  select case
    when p_level is null or p_level = '' then false
    when not (s_level = p_level or coalesce(s_ip_extra_level, '') = p_level) then false
    when coalesce(p_admin, false) then true
    when coalesce(s_visibility, 'all') not in ('all', 'ip') then false      -- 'hidden' and anything unknown fail closed
    when s_level = p_level then (coalesce(s_visibility, 'all') = 'all' or coalesce(p_is_ip, false))
    else coalesce(p_is_ip, false)                                            -- lent via ip_extra_level: IP students only
  end;
$$;
grant execute on function public.subgroup_visible(text, text, text, text, boolean, boolean) to anon, authenticated, service_role;

-- ── practice_pool: THE definition of "which questions belong to a topic" ────
drop function if exists public.practice_pool(text, text);
create function public.practice_pool(
  p_level text, p_topic text default null,
  p_is_ip boolean default false, p_admin boolean default false
) returns table(topic text, question_id uuid)
language sql stable
as $$
  with tree as (
    -- every sub-group in this level's tree: filed here, or lent here for IP students
    select s.id, s.topic,
           public.subgroup_visible(s.level, s.visibility, s.ip_extra_level, p_level, p_is_ip, p_admin) as visible,
           coalesce(s.visibility, 'all') = 'ip' as ip_only
    from public.subgroups s
    where s.level = p_level or coalesce(s.ip_extra_level, '') = p_level
  ),
  live_topics as (
    -- a topic exists for this audience only while it has >= 1 visible sub-group
    select distinct t.topic from tree t
    where t.visible and (p_topic is null or t.topic = p_topic)
  ),
  blocked as (
    -- questions whose EVERY filing in this tree is a sub-group the audience cannot see
    select qs.question_id
    from public.question_subgroups qs
    join tree t on t.id = qs.subgroup_id
    group by qs.question_id
    having bool_and(not t.visible)
  )
  -- filed: placed in a VISIBLE sub-group of this tree (level, topic). A
  -- legacy_syllabus question serves only through an 'ip' filing (see header).
  select t.topic, qs.question_id
  from public.question_subgroups qs
  join tree t on t.id = qs.subgroup_id
  join public.questions q on q.id = qs.question_id
  where t.visible
    and (p_topic is null or t.topic = p_topic)
    and (not q.legacy_syllabus or t.ip_only)
  union
  -- tagged: topics[] names a live tree topic the question is not filed under;
  -- bank level fits the tree; and the question is not filed ONLY under
  -- sub-groups this audience cannot see (a Modulus-only filing tagged
  -- "Quadratic Functions" must not reach a non-IP student through the tag)
  select lt.topic, q.id
  from live_topics lt
  join public.questions q on q.topics @> array[lt.topic]
  where q.deleted_at is null
    and not q.legacy_syllabus
    and q.level = any(public.practice_qlevels(p_level))
    and not exists (
      select 1 from public.question_subgroups qs
      join tree t on t.id = qs.subgroup_id
      where qs.question_id = q.id and t.topic = lt.topic
    )
    and not exists (select 1 from blocked b where b.question_id = q.id);
$$;
grant execute on function public.practice_pool(text, text, boolean, boolean) to anon, authenticated, service_role;

-- ── practice_topics ─────────────────────────────────────────────────────────
drop function if exists public.practice_topics(text, text);
create function public.practice_topics(
  p_level text, p_qlevel text default null,
  p_is_ip boolean default false, p_admin boolean default false
) returns table(topic text, n bigint, advanced_count bigint)
language sql stable security definer
set search_path to 'public'
as $$
  select p.topic,
         count(distinct q.id) as n,
         count(distinct q.id) filter (where lower(q.difficulty) in ('advanced', 'challenging', 'bonus')) as advanced_count
  from public.practice_pool(p_level, null, p_is_ip, p_admin) p
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
$$;
grant execute on function public.practice_topics(text, text, boolean, boolean) to anon, authenticated, service_role;

-- ── practice_subgroups: the picker's "kinds of question" rows ───────────────
-- Gains level / visibility / ip_extra_level so the admin view can badge rows.
drop function if exists public.practice_subgroups(text, text, text);
create function public.practice_subgroups(
  p_level text, p_topic text default null, p_qlevel text default null,
  p_is_ip boolean default false, p_admin boolean default false
) returns table(
  id bigint, topic text, name text, order_index real, n bigint, advanced_count bigint,
  level text, visibility text, ip_extra_level text
)
language sql stable security definer
set search_path to 'public'
as $$
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
    and (not q.legacy_syllabus or coalesce(s.visibility, 'all') = 'ip')  -- legacy serves only via an 'ip' filing
    and (q.has_image = false or q.figure_url is not null or q.image_watermark_status = 'clean')
    and ((q.solution is not null and q.solution <> '')
      or (q.answer is not null and q.answer <> '')
      or (q.parts::text like '%"answer"%'))
  group by s.id, s.topic, s.name, s.order_index, s.level, s.visibility, s.ip_extra_level
  having count(distinct q.id) > 0
  order by s.topic, s.order_index, s.name;
$$;
grant execute on function public.practice_subgroups(text, text, text, boolean, boolean) to anon, authenticated, service_role;

-- ── practice_next: one random question (mix, or one sub-group) ──────────────
drop function if exists public.practice_next(text, text, uuid[], text, bigint, text);
create function public.practice_next(
  p_level text, p_topic text, p_exclude uuid[] default '{}'::uuid[],
  p_tier text default null, p_subgroup bigint default null, p_qlevel text default null,
  p_is_ip boolean default false, p_admin boolean default false
) returns table(
  id uuid, question_text text, parts jsonb, total_marks integer, has_image boolean,
  image_url text, images jsonb, figure_url text, school text, year integer, paper text,
  question_number text, has_solution boolean
)
language sql stable
as $$
  select q.id, q.question_text, q.parts, q.total_marks,
         q.has_image, q.image_url, q.images, q.figure_url,
         q.school, q.year, q.paper, q.question_number,
         (q.solution is not null and q.solution <> '') as has_solution
  from public.questions q
  where q.deleted_at is null
    -- legacy_syllabus serves only through an 'ip' filing this caller can see (see header)
    and (not q.legacy_syllabus or exists (
      select 1 from public.question_subgroups qs
      join public.subgroups s on s.id = qs.subgroup_id
      where qs.question_id = q.id and coalesce(s.visibility, 'all') = 'ip'
        and public.subgroup_visible(s.level, s.visibility, s.ip_extra_level, p_level, p_is_ip, p_admin)
    ))
    and (p_qlevel is null or q.level = p_qlevel)
    and coalesce(q.flagged_count, 0) < 3
    and (q.ai_generated is not true or q.verified = true)
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
        -- a sub-group the caller may not see serves nothing, whatever id they post
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
$$;
grant execute on function public.practice_next(text, text, uuid[], text, bigint, text, boolean, boolean) to anon, authenticated, service_role;

-- ── practice_overview: the picker's per-topic counts + mastery ──────────────
drop function if exists public.practice_overview(uuid, text, text);
create function public.practice_overview(
  p_user uuid, p_level text, p_qlevel text default null,
  p_is_ip boolean default false, p_admin boolean default false
) returns table(
  topic text, question_count bigint, advanced_count bigint, attempts bigint,
  avg_mastery numeric, last_practiced_at timestamp with time zone
)
language sql stable
as $$
  with pool as (
    select p.topic, p.question_id from public.practice_pool(p_level, null, p_is_ip, p_admin) p
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
$$;
grant execute on function public.practice_overview(uuid, text, text, boolean, boolean) to anon, authenticated, service_role;

-- ── kiosk_pool: printed worksheets (kiosk, bot, portal "Print a paper") ─────
drop function if exists public.kiosk_pool(text[], text, text, text[]);
create function public.kiosk_pool(
  p_tag_levels text[], p_sg_level text, p_topic text, p_difficulties text[] default null,
  p_is_ip boolean default false, p_admin boolean default false
) returns table(
  id uuid, question_text text, parts jsonb, total_marks integer, answer text,
  figure_url text, has_image boolean, image_url text
)
language sql stable security definer
set search_path to 'public'
as $$
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
    -- legacy_syllabus serves only through a visible 'ip' filing (see header)
    and (not q.legacy_syllabus or exists (
      select 1 from public.question_subgroups qs join tree t on t.id = qs.subgroup_id
      where qs.question_id = q.id and t.visible and t.ip_only
    ))
    and q.level = any(p_tag_levels)
    and (
      -- filed in a VISIBLE sub-group of this (level, topic)
      exists (
        select 1 from public.question_subgroups qs join tree t on t.id = qs.subgroup_id
        where qs.question_id = q.id and t.visible and t.topic = p_topic
      )
      or (
        -- tag match — only while the topic is live for this audience, and never
        -- for a question filed ONLY under sub-groups the audience cannot see
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
$$;
-- kiosk_pool was deliberately NOT executable by anon/authenticated (drop_unused_anon_policies) — keep it that way.
revoke execute on function public.kiosk_pool(text[], text, text, text[], boolean, boolean) from public, anon, authenticated;
grant execute on function public.kiosk_pool(text[], text, text, text[], boolean, boolean) to service_role;

-- ── Admin-side consumers keep the whole bank ────────────────────────────────
-- practice_candidates = Adrian's "From Adrian" picks; practice_exemplars =
-- generation context. Neither is a student surface, so they read the pool as
-- admin (everything) — exactly what they saw before this file.
create or replace function public.practice_candidates(
  p_level text, p_topic text, p_tier text default null, p_limit integer default 12
) returns table(
  id uuid, question_text text, parts jsonb, total_marks integer, has_image boolean,
  image_url text, images jsonb, figure_url text, school text, year integer, paper text,
  question_number text, difficulty text, has_solution boolean
)
language sql stable
as $$
  select q.id, q.question_text, q.parts, q.total_marks,
         q.has_image, q.image_url, q.images, q.figure_url,
         q.school, q.year, q.paper, q.question_number, q.difficulty,
         (q.solution is not null and q.solution <> '') as has_solution
  from public.questions q
  where q.deleted_at is null
    and coalesce(q.flagged_count, 0) < 3
    and (q.ai_generated is not true or q.verified = true)
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
$$;

create or replace function public.practice_exemplars(
  p_level text, p_topic text, p_limit integer default 4
) returns table(question_text text, answer text, solution text, total_marks integer)
language sql stable
as $$
  select q.question_text, q.answer, q.solution, q.total_marks
  from public.questions q
  where q.deleted_at is null
    and q.solution is not null and q.solution <> ''
    and q.question_text is not null and q.question_text <> ''
    and q.id in (select p.question_id from public.practice_pool(p_level, p_topic, true, true) p)
  order by random()
  limit greatest(1, least(p_limit, 8));
$$;

commit;

-- ── Verification (read-only; expected on 2026-09-02 data) ───────────────────
-- select topic, n from practice_topics('AM') where topic = 'Modulus Functions';          -- 0 rows (non-IP)
-- select topic, n from practice_topics('AM', null, true) where topic = 'Modulus Functions'; -- 1 row, n = 48 (IP; 60 filed, 48 pass the answer/figure gates)
-- select count(*) from practice_subgroups('S1', 'Algebra (Factorization)');              -- 6 (455–460)
-- select id from practice_subgroups('S1', 'Algebra (Factorization)', null, true);        -- 7 rows, incl. 461
-- select id from practice_next('AM', 'Modulus Functions', '{}', null, 809);              -- 0 rows (non-IP posts sg 809)
-- select id from practice_next('AM', 'Modulus Functions', '{}', null, 809, null, true);  -- 1 row (IP)
-- select count(*) from kiosk_pool(array['AM','S3_AM'], 'AM', 'Modulus Functions');       -- 0
-- select count(*) from kiosk_pool(array['AM','S3_AM'], 'AM', 'Modulus Functions', null, true); -- > 0 (IP)
