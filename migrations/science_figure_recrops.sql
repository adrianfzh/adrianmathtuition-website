-- SCIENCE project (adrianscience). Applied 7 Oct 2026 as `figure_recrops_and_clean_log`.
-- figure_recrops = what the re-crop batch PREPARED for each flagged figure (a new picture
-- stored beside the original, never instead of it) and what Adrian then decided.
create table if not exists figure_recrops (
  path         text primary key,
  question_id  uuid not null,
  new_path     text,
  outcome      text not null,
  final        text not null,
  why          text,
  fitness      jsonb,
  plan         text,
  kept_share   numeric,
  furniture    text[],
  batch        text not null,
  judged_at    timestamptz not null default now(),
  decision     text check (decision in ('released', 'rejected')),
  decided_at   timestamptz
);
create index if not exists figure_recrops_open on figure_recrops (final) where decision is null;
alter table figure_recrops enable row level security;

-- The revert ledger, the maths project's shape: originals are never deleted from the
-- bucket, so pointing the field back at old_path undoes any re-crop.
create table if not exists figure_clean_log (
  id           bigint generated always as identity primary key,
  question_id  uuid not null,
  field        text not null,
  old_path     text not null,
  new_path     text not null,
  batch        text not null,
  applied_at   timestamptz not null default now()
);
create index if not exists figure_clean_log_q on figure_clean_log (question_id);
alter table figure_clean_log enable row level security;

-- 7 Oct 2026 — the cloud door (docs/CLOUD.md §Cloud re-crops): the judge's boxes are kept
-- between the cut and the submit, and a figure gets at most two cuts.
alter table figure_recrops add column if not exists judge jsonb;
alter table figure_recrops add column if not exists attempts int not null default 0;
