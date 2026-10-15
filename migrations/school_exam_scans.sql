-- 📝 School exam tracker (SPEC-EXAM-TRACKER.md, 15 Oct 2026). One row per scanned
-- school exam paper (already marked by the school). Admin-only: no RLS policy grants
-- anyone but the service role.
create table if not exists public.school_exam_scans (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,                 -- Airtable Students record id
  airtable_exam_id text,                    -- Airtable Exams record id, when the row exists
  exam_type text not null,                  -- WA1 / WA2 / WA3 / EOY / …
  subject text,                             -- E Math / A Math / H2 Math / …
  exam_date date,
  files text[] not null default '{}',       -- student-files URLs (uploads/ root, admin-only)
  status text not null default 'reading' check (status in ('reading', 'check', 'done', 'failed')),
  error text,
  read jsonb,                               -- { parts: [...], written_total: {got,max} } (lib/school-exam)
  total_got numeric,
  total_max numeric,
  report jsonb,                             -- { loss_by_topic, comparison, prev_id, next_steps, parent_note }
  created_at timestamptz not null default now(),
  checked_at timestamptz
);
create index if not exists school_exam_scans_student on public.school_exam_scans (student_id, exam_date desc);
alter table public.school_exam_scans enable row level security;
