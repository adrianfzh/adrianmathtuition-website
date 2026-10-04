-- library_bank_papers() — one row per PAPER the bank holds (5 Oct 2026, the
-- /admin/library index: "so we know what's extracted and what's not").
-- Applied to BOTH projects: the maths project (questions + humanities_questions)
-- and the science project (questions only; the humanities half is left out there).
-- Read-only, service key only. School questions only: AI-written rows, twins
-- (school 'AdrianMath') and deleted rows are not "extracted papers".
--
-- solution kinds, in plain words on the page:
--   scheme       — the answers came from the school's mark scheme / answer key
--   from_answers — the scheme gave the final answers, the working was written out
--   worked       — no scheme: the answers were worked out
--   none         — not recorded
create or replace function public.library_bank_papers()
returns table (
  subject text, level text, school text, year int, exam_type text, paper text,
  n int, n_scheme int, n_from_answers int, n_worked int, n_none int,
  figures_missing int, last_added timestamptz
)
language sql stable security definer set search_path = public as $$
  select 'maths'::text, q.level, q.school, q.year, q.exam_type, q.paper,
    count(*)::int,
    count(*) filter (where q.solution_source ~* '(mark.?scheme|official_ms|answer_key|qb_docx)')::int,
    count(*) filter (where q.solution_source = 'expanded_from_answer')::int,
    count(*) filter (where q.solution_source ~* '(ai_|opus|derived)')::int,
    count(*) filter (where q.solution_source is null or q.solution_source = 'pending_ms')::int,
    count(*) filter (where q.has_image and q.image_url is null and (q.images is null or jsonb_array_length(q.images) = 0))::int,
    max(q.created_at)
  from questions q
  where q.deleted_at is null and coalesce(q.ai_generated, false) = false
    and coalesce(q.school, '') <> 'AdrianMath' and q.level is not null
  group by q.level, q.school, q.year, q.exam_type, q.paper
  union all
  select h.subject, h.level, h.school, h.year, h.exam_type, h.paper,
    count(*)::int,
    count(*) filter (where h.solution_source ~* '(scheme|official|answer_key)' or h.scheme_file is not null)::int,
    0, count(*) filter (where h.solution_source ~* '(ai_|opus|derived)')::int,
    count(*) filter (where h.solution_source is null and h.scheme_file is null)::int,
    0, max(h.created_at)
  from humanities_questions h
  where h.deleted_at is null
  group by h.subject, h.level, h.school, h.year, h.exam_type, h.paper
$$;
revoke all on function public.library_bank_papers() from public, anon, authenticated;
grant execute on function public.library_bank_papers() to service_role;

-- Science project version (no deleted_at / humanities there; quarantined rows are
-- still extracted papers, so they count):
-- create or replace function public.library_bank_papers() returns table (...same...)
-- language sql stable security definer set search_path = public as $$
--   select q.subject, q.level, q.school, q.year, q.exam_type, q.paper, count(*)::int, ...
--   from questions q where coalesce(q.ai_generated,false) = false and q.level is not null
--   group by q.subject, q.level, q.school, q.year, q.exam_type, q.paper $$;
