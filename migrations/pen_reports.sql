-- pen_reports — what ADRIAN himself said is wrong on a marked page (6 Oct 2026:
-- "yes do all 2-4" — his reports go to the top of the page fixer's list).
-- Any session he sends a marked page to files one row per point; the fixer
-- (bot .claude/skills/marking-fix) works status='new' rows BEFORE its own list.
-- Service-role only (RLS on, no policies) — the same posture as job_runs.
create table if not exists pen_reports (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  run_id      uuid,                 -- the marked paper, when known
  page        int,                  -- 1-based page of that paper, when known
  question    text,                 -- "Q5(c)"
  said        text not null,        -- Adrian's own words, verbatim
  what        text not null,        -- what the page shows, one plain sentence
  kind        text not null default 'bug' check (kind in ('bug', 'design')),
  status      text not null default 'new' check (status in ('new', 'taken', 'fixed', 'proposed', 'wont')),
  taken_by    text,                 -- 'marking-fix 2026-10-07' | 'session 6 Oct'
  outcome     text,                 -- sha / proposal slug / why not
  closed_at   timestamptz
);
create index if not exists pen_reports_open on pen_reports (created_at) where status in ('new', 'taken');
alter table pen_reports enable row level security;
