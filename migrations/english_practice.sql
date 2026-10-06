-- English practice from the language bank (SPEC-ENGLISH-PRACTICE.md, 6 Oct 2026).
-- One row per check a student makes: an editing passage, a short answer, a summary.
-- Service key only (RLS on, no policies) — read and written by lib/english-practice-store.ts.
create table if not exists public.english_practice_attempts (
  id bigserial primary key,
  identity text not null,
  item_id uuid not null,
  unit text not null,                      -- "<item id>" or "<item id>:<part label>"; "editing" rows use the item id
  kind text not null check (kind in ('editing','short','choice','summary')),
  answer text,
  awarded numeric,
  max_marks numeric,
  used_model boolean not null default false,
  result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists english_practice_attempts_identity_day on public.english_practice_attempts(identity, created_at desc);
create index if not exists english_practice_attempts_item on public.english_practice_attempts(item_id);
alter table public.english_practice_attempts enable row level security;
