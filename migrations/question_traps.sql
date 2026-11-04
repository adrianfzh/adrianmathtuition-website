-- 🪤 Common traps — questions most students lose marks on, and WHICH mistake (4 Nov 2026,
-- Adrian: "it should also be able to classify a question that most students make mistakes").
-- A label separate from the difficulty level: a Core question can be a common trap.
--
-- Evidence, aggregated here so nothing is downloaded:
--   • marked papers — `paper_marking_runs` whose paper match is trusted, each result tied to a
--     bank row by the paper key ("gce 2023 em p1") + question number; marks per part and the
--     marker's `error_kind` per part that lost marks;
--   • maths practice — `student_attempts` (portal / portal-fix, a bank question_id).
-- One row per student per question (their earliest). Internal: nothing a student sees says how
-- this is worked out (Adrian, 4 Nov 2026). The rule that turns the counts into a label lives in
-- lib/question-traps.ts (pure, tested); the nightly /api/cron/math-practice-difficulty fills
-- `question_traps`.

create table if not exists public.question_traps (
  question_id     uuid primary key references public.questions(id) on delete cascade,
  students        integer not null,
  lost            integer not null,
  kind            text,
  kind_students   integer not null default 0,
  part_label      text,
  from_papers     integer not null default 0,
  from_practice   integer not null default 0,
  is_trap         boolean not null default false,
  updated_at      timestamptz not null default now()
);
create index if not exists question_traps_is_trap on public.question_traps (is_trap) where is_trap;
alter table public.question_traps enable row level security;
grant select, insert, update, delete on table public.question_traps to service_role;

create or replace function public.question_trap_stats(p_exclude text[] default '{}')
returns table(question_id uuid, students integer, lost integer, kind text, kind_students integer,
              part_label text, from_papers integer, from_practice integer)
language sql stable security definer
set search_path to 'public'
as $function$
with res as materialized (   -- the trusted papers' results, read once
  select r.student_id::text as s, r.created_at as at, r.result_json->'paper_match'->>'key' as k,
         e->>'question_number' as qn, e->'marking_output'->'parts' as parts
  from public.paper_marking_runs r
  cross join lateral jsonb_array_elements(case when jsonb_typeof(r.result_json->'results') = 'array' then r.result_json->'results' else '[]'::jsonb end) e
  where r.superseded_by is null and r.student_id is not null
    and coalesce(r.student_name, '') !~* '^\s*adrian\s+fong\s*$'   -- his own test hand-ins (lib/stuck-store isOwnAccount)
    and coalesce((r.result_json->'paper_match'->>'trusted')::boolean, false)
    and jsonb_typeof(e->'marking_output'->'parts') = 'array'
),
bank as materialized (       -- only the bank rows of papers that were marked
  select q.id,
         lower(q.school) || ' ' || q.year || ' ' ||
           (case when q.level in ('JC1', 'JC2') then 'h2' else lower(q.level) end) || ' p' || q.paper as k,
         q.question_number as qn
  from public.questions q
  where q.deleted_at is null and q.paper is not null and q.question_number is not null
    and q.year::text = any(array(select distinct substring(k from '(20[0-9][0-9])') from res))
),
bank_one as materialized ( -- a paper number that points at two bank rows is ambiguous: skipped
  select k, qn, (array_agg(id))[1] as id from bank group by k, qn having count(*) = 1
),
paper_res as materialized (
  select res.s, b.id as qid, res.at, res.parts
  from res join bank_one b on b.k = res.k and b.qn = res.qn
),
paper_rows as (
  select pr.s, pr.qid, pr.at, 'paper'::text as src,
         sum((p->>'max')::numeric) as mx,
         sum(coalesce(nullif(p->>'awarded', '')::numeric, 0)) as aw,
         array_remove(array_agg(case when coalesce(nullif(p->>'awarded', '')::numeric, 0) < (p->>'max')::numeric
                                     then coalesce(p->>'error_kind', '') || '|' || coalesce(p->>'label', '') end), null) as kinds
  from paper_res pr
  cross join lateral jsonb_array_elements(pr.parts) p
  where jsonb_typeof(p) = 'object' and (p->>'max') ~ '^[0-9.]+$' and coalesce(nullif(p->>'awarded', ''), '0') ~ '^[0-9.]+$'
  group by 1, 2, 3
),
practice_rows as (
  select coalesce(a.user_id::text, a.airtable_student_id) as s, a.question_id as qid, a.attempted_at as at, 'practice'::text as src,
         nullif(a.marking_json->>'outOf', '')::numeric as mx,
         case when a.marking_json->>'score' ~ '^[0-9.]+$' then (a.marking_json->>'score')::numeric end as aw,
         coalesce((select array_agg(coalesce(p->>'error_kind', '') || '|' || coalesce(p->>'label', ''))
                   from jsonb_array_elements(case when jsonb_typeof(a.marking_json->'parts') = 'array' then a.marking_json->'parts' else '[]'::jsonb end) p
                   where p ? 'error_kind'), '{}') as kinds,
         a.marking_verdict as verdict
  from public.student_attempts a
  where a.attempted_via in ('portal', 'portal-fix') and a.question_id is not null and a.marking_json->'science' is null
),
all_rows as (
  select s, qid, at, src, (mx > 0 and aw < mx) as lost, kinds from paper_rows where mx > 0
  union all
  select s, qid, at, src, case when mx > 0 and aw is not null then aw < mx else coalesce(verdict, '') <> 'correct' end, kinds from practice_rows
),
firsts as (
  select distinct on (s, qid) s, qid, src, lost, kinds
  from all_rows
  where s is not null and not (s = any(p_exclude))
  order by s, qid, at
),
per_q as (
  select qid, count(*)::int as students, count(*) filter (where lost)::int as lost,
         count(*) filter (where src = 'paper')::int as from_papers,
         count(*) filter (where src = 'practice')::int as from_practice
  from firsts group by qid
),
kind_rows as (   -- one vote per student per kind (a student losing two parts to "sign" counts once)
  select distinct f.qid, f.s, split_part(k, '|', 1) as kind, split_part(k, '|', 2) as label
  from firsts f cross join lateral unnest(f.kinds) k
  where f.lost and split_part(k, '|', 1) <> ''
),
kind_votes as (
  select qid, kind, count(distinct s)::int as n, mode() within group (order by label) as label
  from kind_rows group by qid, kind
),
top_kind as (
  select distinct on (qid) qid, kind, n, label from kind_votes order by qid, n desc, kind
)
select p.qid, p.students, p.lost, t.kind, coalesce(t.n, 0), nullif(t.label, ''), p.from_papers, p.from_practice
from per_q p left join top_kind t on t.qid = p.qid;
$function$;

revoke all on function public.question_trap_stats(text[]) from public, anon, authenticated;
grant execute on function public.question_trap_stats(text[]) to service_role;
