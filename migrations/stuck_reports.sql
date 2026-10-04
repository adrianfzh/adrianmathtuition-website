-- The weekly "where students are stuck" report (5 Oct 2026, /api/cron/stuck-weekly,
-- lib/stuck-picture.ts). One row per run: the picture, the material prepared for the
-- top gaps (sheet PDFs, recipients, and who it was sent to once Adrian said so), the
-- message, and the bank sub-skills the twins lane should write first (twin_focus,
-- read by scripts/twins/twin.mjs queue). Service-role only.
create table if not exists public.stuck_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  week_from timestamptz not null,
  week_to timestamptz not null,
  dry boolean not null default false,
  picture jsonb not null,
  materials jsonb not null default '[]'::jsonb,
  twin_focus jsonb not null default '[]'::jsonb,
  message text,
  telegram_sent boolean not null default false
);
create index if not exists stuck_reports_created_idx on public.stuck_reports (created_at desc);
alter table public.stuck_reports enable row level security;
comment on table public.stuck_reports is 'Weekly stuck picture (asks to the bot + marks lost) and the material prepared for Adrian; nothing here reaches a student until he sends it from /admin/stuck or Telegram.';
