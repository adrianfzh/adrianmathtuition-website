-- 15 Oct 2026 (Adrian): a sub-skill for EVERY PART of a long question. SPEC-PART-SKILLS.md.
-- A SEPARATE table so question_subgroups (the one main sub-skill per question that serving,
-- twins, Find and the rest read) is untouched. Applied to BOTH projects (maths + science).
create table if not exists public.question_part_subgroups (
  question_id uuid   not null references public.questions(id) on delete cascade,
  part_path   text   not null,              -- 'a', 'b.ii' : the leaf part's label path in parts[]
  subgroup_id bigint not null references public.subgroups(id),
  marks       numeric,
  confidence  numeric,
  reason      text,
  source      text not null default 'cc_part_backfill',
  created_at  timestamptz not null default now(),
  primary key (question_id, part_path)
);
create index if not exists question_part_subgroups_sg_idx on public.question_part_subgroups (subgroup_id);
alter table public.question_part_subgroups enable row level security;  -- no policy: service role only
