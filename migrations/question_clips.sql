-- Question clips (SPEC-CLIP-PIPELINE.md §9, step 2 — 15 Oct 2026): a one-minute
-- solution clip for ONE bank question, made once by scripts/clips/question-clip.mjs
-- and kept, so the next student who opens the same question gets it at once.
--
-- One row per question. status:
--   queued   asked for (practice page / marked paper / admin), waiting for the worker
--   making   claimed by a worker (claimed_by, started_at)
--   ready    every check passed; `script` is the lesson script the player plays,
--            its voice clips in the public `lesson-audio` bucket under question-clips/<id>/
--   refused  the question cannot be checked line by line (graph, proof, words, figure…);
--            refuse_reason says which — recorded, never retried by the worker
--   failed   a check failed after the retries; fail_reason says which (re-queue by hand)
-- Students see a clip only when status = 'ready' AND QUESTION_CLIPS_OPEN_TO_STUDENTS
-- (lib/portal-beta) is on; until then, and for the first 20, Adrian watches each one
-- (watched_at, verdict, note).
create table if not exists public.question_clips (
  question_id   uuid primary key references public.questions(id) on delete cascade,
  status        text not null default 'queued' check (status in ('queued','making','ready','refused','failed')),
  requested_from text,            -- practice | paper | admin | batch
  requested_at  timestamptz not null default now(),
  claimed_by    text,
  started_at    timestamptz,
  finished_at   timestamptz,
  seconds       integer,          -- wall time of the run that finished it
  attempts      integer not null default 0,
  slug          text,
  topic         text,
  bible         text,             -- data/clip-bibles/<file> the run used
  script        jsonb,            -- the lesson script (src/lib/lesson-script.ts), audio as https URLs
  plan          jsonb,            -- the maths-checked board plan
  gate          jsonb,            -- every check, per step (rules, maths, answer, board, read, voice, look, pictures)
  cost          jsonb,            -- { voice_chars, voice_usd, agents: [{step, model, tokens, usd_notional, seconds}] }
  refuse_reason text,
  fail_reason   text,
  watched_at    timestamptz,
  verdict       text check (verdict in ('good','not_good')),
  note          text,
  updated_at    timestamptz not null default now()
);
create index if not exists question_clips_status on public.question_clips (status, requested_at);
alter table public.question_clips enable row level security;  -- service key only
