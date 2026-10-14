-- 14 Oct 2026 — 🩺 Question health (Adrian: "yes"). SPEC-QUESTION-HEALTH.md.
-- Runs on the MATHS project. Applied 14 Oct 2026.
--
-- A maths bank question is checked the first time it is about to reach a student, never all
-- 47,000. One row per question that has been asked for; a pass is stamped and never re-checked
-- unless the question's content changes (the trigger below sends it round again).
--
-- Inert until Adrian switches it on: question_health_settings.is_on = false means qh_enqueue /
-- qh_prefetch queue nothing and qh_claim hands out nothing. The three serving pickers below
-- gain two things that do nothing while the table is empty:
--   · a paused or retired question is never served,
--   · practice_next serves a checked question before an unchecked one.
-- RLS on, no policies: only the service role (the website's server) reads or writes.

create table if not exists public.question_health_settings (
  id int primary key default 1 check (id = 1),
  is_on boolean not null default false,
  changed_at timestamptz,
  changed_by text
);
insert into public.question_health_settings (id, is_on) values (1, false) on conflict (id) do nothing;
alter table public.question_health_settings enable row level security;

create table if not exists public.question_health (
  question_id uuid primary key references public.questions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'checking', 'passed', 'fixed', 'paused', 'retired')),
  reason text not null default 'practice',     -- which door asked first (lib/question-health.ts HEALTH_REASONS)
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  checks int not null default 0,               -- finished checks; a copy fix sends it round again
  checked_at timestamptz,
  method jsonb,                                -- {solver_model, scheme_found, scheme_source, parts, completeness}
  note text,                                   -- one plain line: what the check found
  decided_by text,                             -- 'check' | 'adrian'
  decided_at timestamptz
);
create index if not exists question_health_status_idx on public.question_health (status, queued_at);
alter table public.question_health enable row level security;

create table if not exists public.question_health_edits (
  id bigserial primary key,
  question_id uuid not null references public.questions(id) on delete cascade,
  field text not null check (field in ('question_text', 'parts', 'topics', 'level', 'answer')),
  before jsonb,
  after jsonb,
  kind text not null check (kind in ('copy', 'topic', 'level', 'key', 'twin-rewrite', 'adrian')),
  evidence text not null,
  made_at timestamptz not null default now(),
  made_by text not null default 'check',
  undone_at timestamptz,
  undone_by text
);
create index if not exists question_health_edits_q_idx on public.question_health_edits (question_id, made_at desc);
create index if not exists question_health_edits_made_idx on public.question_health_edits (made_at desc);
alter table public.question_health_edits enable row level security;

-- A checked question whose content changes is checked again (never re-checked otherwise).
create or replace function public.qh_content_changed() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  update public.question_health
     set status = 'queued', reason = 'after-fix', queued_at = now(), claimed_at = null, claimed_by = null
   where question_id = new.id and status not in ('queued', 'checking');
  return new;
end $$;
drop trigger if exists qh_content_changed on public.questions;
create trigger qh_content_changed after update on public.questions
for each row when (
  old.question_text is distinct from new.question_text or old.answer is distinct from new.answer
  or old.parts is distinct from new.parts or old.solution is distinct from new.solution
  or old.figure_url is distinct from new.figure_url or old.image_url is distinct from new.image_url
  or old.images is distinct from new.images or old.topics is distinct from new.topics or old.level is distinct from new.level
)
execute function public.qh_content_changed();

-- Queue these questions (the ones never asked for). Nothing while the switch is off.
create or replace function public.qh_enqueue(p_ids uuid[], p_reason text default 'practice') returns int
language sql security definer set search_path to 'public' as $$
  with ins as (
    insert into public.question_health (question_id, reason)
    select q.id, coalesce(p_reason, 'practice')
      from public.questions q
     where q.id = any(coalesce(p_ids, '{}'::uuid[]))
       and q.deleted_at is null and not q.national
       and (select is_on from public.question_health_settings where id = 1)
    on conflict (question_id) do nothing
    returning 1
  )
  select count(*)::int from ins;
$$;

-- App practice: when a topic opens, queue a few of its never-checked questions so the next
-- ones a student meets are already checked. Nothing while the switch is off.
create or replace function public.qh_prefetch(p_level text, p_topic text, p_is_ip boolean default false, p_n int default 4) returns int
language sql security definer set search_path to 'public' as $$
  select case when not (select is_on from public.question_health_settings where id = 1) then 0
  else public.qh_enqueue(array(
    select p.question_id from public.practice_pool(p_level, p_topic, p_is_ip, false) p
     where not exists (select 1 from public.question_health h where h.question_id = p.question_id)
     order by random() limit greatest(0, least(coalesce(p_n, 4), 12))
  ), 'prefetch') end;
$$;

-- The worker takes up to n questions: never-taken first (a student's own pick before a prefetch),
-- or one whose worker went quiet past the 30-minute lease. Nothing while the switch is off.
create or replace function public.qh_claim(p_runner text, p_n int default 3) returns setof uuid
language sql security definer set search_path to 'public' as $$
  with pick as (
    select h.question_id from public.question_health h
     where (select is_on from public.question_health_settings where id = 1)
       and (h.status = 'queued' or (h.status = 'checking' and h.claimed_at < now() - interval '30 minutes'))
     order by case h.reason when 'practice' then 0 when 'sheet' then 1 when 'worksheet' then 1 when 'assign' then 1 when 'paper' then 1 when 'after-fix' then 2 else 3 end, h.queued_at
     limit greatest(1, least(coalesce(p_n, 3), 10))
     for update skip locked
  )
  update public.question_health h set status = 'checking', claimed_at = now(), claimed_by = p_runner
    from pick where h.question_id = pick.question_id
  returning h.question_id;
$$;

revoke all on function public.qh_enqueue(uuid[], text), public.qh_prefetch(text, text, boolean, int), public.qh_claim(text, int) from public, anon, authenticated;

-- ── the serving pickers: the live definitions of 14 Oct 2026, plus the health lines ──────────

CREATE OR REPLACE FUNCTION public.practice_next(p_level text, p_topic text, p_exclude uuid[] DEFAULT '{}'::uuid[], p_tier text DEFAULT NULL::text, p_subgroup bigint DEFAULT NULL::bigint, p_qlevel text DEFAULT NULL::text, p_is_ip boolean DEFAULT false, p_admin boolean DEFAULT false)
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
    and not exists (select 1 from public.question_health h where h.question_id = q.id and h.status in ('paused', 'retired'))
  order by exists (select 1 from public.question_health h where h.question_id = q.id and h.status in ('passed', 'fixed')) desc, random()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.kiosk_pool(p_tag_levels text[], p_sg_level text, p_topic text, p_difficulties text[] DEFAULT NULL::text[], p_is_ip boolean DEFAULT false, p_admin boolean DEFAULT false)
 RETURNS TABLE(id uuid, question_text text, parts jsonb, total_marks integer, answer text, figure_url text, has_image boolean, image_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    and not exists (select 1 from public.question_health h where h.question_id = q.id and h.status in ('paused', 'retired'))
  order by q.id
  limit 400;
$function$;

CREATE OR REPLACE FUNCTION public.practice_candidates(p_level text, p_topic text, p_tier text DEFAULT NULL::text, p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, question_text text, parts jsonb, total_marks integer, has_image boolean, image_url text, images jsonb, figure_url text, school text, year integer, paper text, question_number text, difficulty text, has_solution boolean)
 LANGUAGE sql
 STABLE
AS $function$
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
    and not exists (select 1 from public.question_health h where h.question_id = q.id and h.status in ('paused', 'retired'))
  order by exists (select 1 from public.question_health h where h.question_id = q.id and h.status in ('passed', 'fixed')) desc, random()
  limit greatest(1, least(coalesce(p_limit, 12), 40));
$function$;
