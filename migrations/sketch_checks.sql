-- The graph-sketch checker (SPEC-SKETCH-CHECK.md, 5 Oct 2026; Adrian: "build … the graph
-- sketch checker"). One row per photographed sketch: the function it was checked against,
-- the photo, the red-pen result image, and the checklist. Practice only — no mark is stored.
-- RLS on with no policies — the service key only; a student reads their own rows through
-- /api/portal/sketch-check, scoped by the portal identity.
-- Applied to the main project (nempslbewxtlikfzachi) as migration `sketch_checks`.
create table if not exists public.sketch_checks (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  airtable_student_id  text not null,           -- the portal identity
  student_name         text,
  question_ref         text,                    -- data/sketch-check/questions.json id, null for a typed function
  question_id          uuid,                    -- the bank row behind it, when there is one
  expr                 text,                    -- the function, in the function-graph grammar
  domain               jsonb,                   -- [lo|null, hi|null] or null
  shown                text,                    -- the function as the student sees it
  exact                boolean not null default false,  -- the question asks for exact values
  photo_url            text not null,
  question_photo_url   text,
  result_url           text,                    -- the red-pen PNG
  status               text not null default 'queued' check (status in ('queued', 'checking', 'checked', 'failed')),
  report               jsonb,                   -- { items, summary, deductions, groups, features, refused }
  read_json            jsonb,                   -- the model's blind read, kept for forensics
  right_count          int,
  item_count           int,
  cost_usd             numeric,
  ms                   int,
  error                text,                    -- the line the student sees
  error_detail         text,
  checked_at           timestamptz
);
create index if not exists sketch_checks_student_idx on public.sketch_checks (airtable_student_id, created_at desc);
alter table public.sketch_checks enable row level security;
