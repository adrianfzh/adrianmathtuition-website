-- The Next lesson card + the lesson log that fills itself (5 Oct 2026,
-- /admin/students/<id>/next, lib/next-lesson-store.ts). Service-role only.
--
-- lesson_packs: one row per Airtable lesson the night-before job prepared for —
-- the suggestion (what's next and why, or the exam it is preparing for), and the
-- auto log of that lesson (what was printed / handed in, the end-of-lesson
-- Telegram line, Adrian's ✓ or reply).
create table if not exists public.lesson_packs (
  id uuid primary key default gen_random_uuid(),
  airtable_student_id text not null,
  student_name text,
  level text,
  lesson_id text not null unique,          -- Airtable Lessons rec id
  lesson_date date not null,
  lesson_end text,                          -- 'HH:MM' SGT, from the slot's Time
  mode text not null default 'teach',       -- 'teach' | 'exam'
  plan jsonb not null default '{}'::jsonb,  -- lib/next-lesson-store NextLessonPlan
  built_at timestamptz not null default now(),
  auto_log jsonb,                           -- lib/lesson-autolog AutoLog as last written
  log_written_at timestamptz,
  line_sent_at timestamptz,
  line_message_id bigint,                   -- the Telegram message, so a reply finds its lesson
  confirmed_at timestamptz,
  confirm_kind text,                        -- 'ok' | 'reply'
  reply_text text
);
create index if not exists lesson_packs_student_idx on public.lesson_packs (airtable_student_id, lesson_date desc);
create index if not exists lesson_packs_date_idx on public.lesson_packs (lesson_date);
create index if not exists lesson_packs_msg_idx on public.lesson_packs (line_message_id);
alter table public.lesson_packs enable row level security;
comment on table public.lesson_packs is 'Next lesson card: the night-before suggestion per Airtable lesson + its auto log (what was printed/handed in, the end-of-lesson line, Adrian''s confirmation).';

-- student_materials: everything made FOR one student — the night-before items,
-- what Adrian asked for in the worksheet box, stuck sheets — so the profile
-- lists it and the next suggestion knows what they already got.
create table if not exists public.student_materials (
  id uuid primary key default gen_random_uuid(),
  airtable_student_id text not null,
  title text not null,
  topic text,
  label text,                               -- the step's words ("Sine rule and cosine rule")
  level text,                               -- the worksheet level key (AM/EM/JC2/S1/S2)
  kind text not null,                       -- warmup | practice | set | practice-again | chat
  source text not null,                     -- auto | chat | stuck | exam
  file_url text,                            -- a stored PDF; null = rendered on demand (a Set paper)
  question_ids jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,  -- set number + paper, skills, the chat's parsed request
  status text not null default 'ready',     -- ready | failed
  request text,                             -- the worksheet box's words, as typed
  error text,
  pack_id uuid references public.lesson_packs(id) on delete set null,
  made_at timestamptz not null default now(),
  printed_at timestamptz,
  given_at timestamptz,
  removed_at timestamptz
);
create index if not exists student_materials_student_idx on public.student_materials (airtable_student_id, made_at desc);
create index if not exists student_materials_pack_idx on public.student_materials (pack_id);
alter table public.student_materials enable row level security;
comment on table public.student_materials is 'Everything made for one student (night-before items, worksheet box, stuck sheets) with printed/given stamps; the Next lesson suggestion and the auto log read it.';
