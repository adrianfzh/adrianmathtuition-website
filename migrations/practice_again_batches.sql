-- Practice Again batches — ONE sheet for several marked papers of one subject.
-- Applied to the math project (nempslbewxtlikfzachi) on 10 Sep 2026 as migration
-- `practice_again_batches`.
--
-- Adrian, 10 Sep 2026, on Isabelle's five finished-but-unsent sheets: "instead of
-- releasing all 5 sheets … have just one practice again worksheet … the same
-- mistakes or the same topics may appear across all 5 worksheets, so can batch
-- and combine into one — more efficient and can save students' time. but still
-- must be effective and target the required gaps." For now a batch is made only
-- from the papers he ticks on the desk; the by-subject automation is later.
--
-- Shape: a sheet job and a Practice Again assignment each KEEP their primary run
-- (`run_id` / `source_run_id` = the newest paper in the batch), so every reader
-- that joins one-to-one keeps working, and GAIN the full list they cover. NULL
-- on both means a single-paper sheet, exactly as before.

alter table sheet_jobs add column if not exists run_ids uuid[];
alter table portal_assignments add column if not exists source_run_ids uuid[];
create index if not exists sheet_jobs_run_ids_gin on sheet_jobs using gin (run_ids);
create index if not exists portal_assignments_source_run_ids_gin on portal_assignments using gin (source_run_ids);
comment on column sheet_jobs.run_ids is 'Every marking run this sheet covers (a batch); run_id is the primary/newest. NULL = a single-paper sheet.';
comment on column portal_assignments.source_run_ids is 'Every marked paper a batch Practice Again sheet was written from; source_run_id is the primary/newest.';
