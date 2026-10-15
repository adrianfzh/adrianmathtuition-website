-- Science levels read the science teaching tips (Adrian, 15 Oct 2026: "yes").
-- Until now teaching_subject_for_level sent every science level to null so 'CHEM'
-- could not read as E Math. Science levels now map to the subjects the science rows
-- carry: CHEM, CS_CHEM, CS_CHEM_NA, S3_CHEM → CHEM; PHYS / PHY / CS_PHYS… → PHYS;
-- BIO / CS_BIO… → BIO. The science checks run BEFORE the EM rule.
-- Lower-secondary Science shares the bare levels S1 / S2 with maths, so a science
-- caller must pass its science level (CHEM / PHYS / BIO), never S1 / S2 — and SCI…
-- stays null. TS mirror: src/lib/teaching-knowledge.ts knowledgeSubjectForLevel;
-- bot mirror: lib/teaching-knowledge.js.
create or replace function public.teaching_subject_for_level(p_level text)
returns text language sql immutable as $function$
  select case
    when l = '' then null
    when l ~ '^SCI' then null
    when l ~ '(^|_)CHEM' then 'CHEM'
    when l ~ '(^|_)PHY' then 'PHYS'
    when l ~ '(^|_)BIO' then 'BIO'
    when l = 'S1' then 'S1'
    when l = 'S2' then 'S2'
    when l like 'JC%' then 'JC'
    when l like '%AM%' then 'AM'
    when l like '%EM%' then 'EM'
    else null end
  from (select upper(btrim(coalesce(p_level, ''))) as l) x;
$function$;
