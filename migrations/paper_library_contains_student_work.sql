-- 5 Oct 2026 (Adrian: "do the safer middle way"): a hand-in's printed question pages
-- WITH the student's working on them may be a PRIVATE extraction source. Such a row is
-- flagged here; the extraction law transcribes only the print, never crops a figure from
-- it, and the extraction-inbox tick deletes the source object once the row is finished
-- (done / skipped / flagged), blanking storage_path. docs/EXTRACTION-QUEUE.md §1d.
alter table paper_library add column if not exists contains_student_work boolean not null default false;
create index if not exists paper_library_student_work_idx on paper_library (status) where contains_student_work;
