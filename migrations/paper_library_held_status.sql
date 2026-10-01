-- 2 Oct 2026 (Adrian: "we should prioritise recent years first - 2023 to 2025 for A Math E Math
-- JC H1 and the sciences / the rest put on hold first"). APPLIED to the maths project the same day.
-- 'held' = a source paper parked on purpose: claim_extraction_paper only takes 'queued', so a
-- held row waits untouched (233 stayed queued, 561 were held).
-- Release some or all:  update paper_library set status='queued' where kind='source' and status='held' [and ...];
alter table public.paper_library drop constraint paper_library_status_check;
alter table public.paper_library add constraint paper_library_status_check
  check (status = any (array['library','queued','claimed','done','skipped','flagged','failed','held']));

update public.paper_library
   set status = 'held',
       notes = coalesce(nullif(notes, '') || ' | ', '') || 'ON HOLD 2 Oct 2026: outside the priority set (2023-2025 A Math, E Math, JC H1, sciences)'
 where kind = 'source' and status = 'queued'
   and not (year in (2023, 2024, 2025)
            and level in ('AM','EM','JC2_H1','PHYS','CHEM','BIO','CS_PHYS','CS_CHEM','CS_BIO','CS_PHYS_NA','CS_CHEM_NA','CS_BIO_NA'));
