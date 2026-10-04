-- Learning loops (5 Oct 2026, Adrian: "do learn from your corrections loop" and "students'
-- flags on answers going straight into the bot review, with the fix proposed the same day").
--
-- LOOP 1 — marking_corrections: ONE row per change Adrian (later: any tutor) makes to a
-- marked paper — a part's mark, the marker's note, the verdict line — through the desk's
-- override or ✏️ Annotate Done (score chips + note edits). Written by the website
-- (lib/marking-corrections.ts diffs the run before/after the write; -store inserts).
-- APPEND-ONLY: an UPDATE is refused by trigger; DELETE stays possible so an account
-- deletion / retention sweep can remove a student's rows. Every row carries WHO corrected
-- it and org_id from day one (SPEC-COMPANY §14.5, SPEC-TUTOR-TOOLS: this loop will later
-- learn one profile per tutor — a tutor's rows never teach another tutor's marker).
--
-- marking_correction_patterns: the learner's own state (bot scripts/marking-learn-pull.js +
-- the /marking-learn skill on the Fly worker) — a repeated kind of correction, its
-- proposal slug and status. Kept apart so the corrections stay append-only.
--
-- LOOP 2 — answer_flags.reviewed_at / review_note: the same-day /flag-review stamps the
-- tickets it has read, so a wrong answer is looked at once, the same day.

create table if not exists public.marking_corrections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  corrected_at timestamptz not null,
  org_id text not null default 'tuition',
  corrected_by text not null default 'adrian',
  source text not null check (source in ('annotate', 'desk', 'backfill')),
  run_id uuid not null,
  student_id text,
  paper_name text,
  level text,
  subject text,
  question text not null,
  part text not null default '',
  field text not null check (field in ('marks', 'note', 'verdict')),
  marks_before numeric,
  marks_after numeric,
  marks_max numeric,
  note_before text,
  note_after text,
  marker_error_kind text,
  tutor_error_kind text,
  tutor_reason text,
  topic text,
  scheme text,
  photo_index int,
  context jsonb
);
create unique index if not exists marking_corrections_once
  on public.marking_corrections (run_id, question, part, field, corrected_at);
create index if not exists marking_corrections_org_time on public.marking_corrections (org_id, corrected_by, corrected_at desc);
create index if not exists marking_corrections_run on public.marking_corrections (run_id);
alter table public.marking_corrections enable row level security;
comment on table public.marking_corrections is
  'Loop 1 (5 Oct 2026): one row per change a tutor made to a marked paper (mark / note / verdict), before → after. Append-only (update refused). Per tutor + org from day one. Writers: website lib/marking-corrections-store.ts. Reader: bot scripts/marking-learn-pull.js.';

create or replace function public.marking_corrections_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'marking_corrections is append-only — add a new row instead';
end $$;
drop trigger if exists marking_corrections_no_update on public.marking_corrections;
create trigger marking_corrections_no_update before update on public.marking_corrections
  for each row execute function public.marking_corrections_append_only();

create table if not exists public.marking_correction_patterns (
  key text primary key,
  org_id text not null default 'tuition',
  corrected_by text not null default 'adrian',
  summary text,
  correction_ids uuid[] not null default '{}',
  status text not null default 'watching' check (status in ('watching', 'proposed', 'shipped', 'dropped', 'not-a-rule')),
  proposal_slug text,
  first_seen timestamptz,
  last_seen timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.marking_correction_patterns enable row level security;
comment on table public.marking_correction_patterns is
  'Loop 1: a repeated kind of correction the learner found, and what became of it (proposal slug, status). key = org|tutor|level|direction|kind|… (bot lib/correction-patterns.js patternKey).';

alter table public.answer_flags add column if not exists reviewed_at timestamptz;
alter table public.answer_flags add column if not exists review_note text;

-- Backfill: the desk overrides already on runs (results[].triage_override keeps the marker's
-- first mark as `previous`, Adrian's mark, his note and his error kind). The part is not
-- recoverable for a whole-question override, so part = '' (the whole question).
insert into public.marking_corrections
  (corrected_at, source, run_id, student_id, paper_name, level, subject, question, part, field,
   marks_before, marks_after, marks_max, tutor_reason, tutor_error_kind, topic, context)
select
  coalesce((q->'triage_override'->>'at')::timestamptz, r.created_at),
  'backfill', r.id, r.student_id, r.paper_name,
  case r.paper_subject when 'A Math' then 'AM' when 'E Math' then 'EM' when 'H2 Math' then 'JC'
    when 'Physics' then 'PHY' when 'Chemistry' then 'CHEM' when 'Biology' then 'BIO' end, r.subject,
  coalesce(q->>'question_number', '?'), '', 'marks',
  (q->'triage_override'->>'previous')::numeric,
  (q->'triage_override'->>'awarded')::numeric,
  (q->'marking'->>'total_max')::numeric,
  nullif(q->'triage_override'->>'note', ''),
  q->'triage_override'->>'error_kind',
  q->'marking_output'->'meta'->>'topic_detected',
  jsonb_build_object('backfill', 'triage_override', 'parts_after', q->'marking'->'parts')
from public.paper_marking_runs r,
     jsonb_array_elements(case when jsonb_typeof(r.result_json->'results') = 'array' then r.result_json->'results' else '[]'::jsonb end) q
where q ? 'triage_override'
  and (q->'triage_override'->>'previous') is distinct from (q->'triage_override'->>'awarded')
on conflict do nothing;
