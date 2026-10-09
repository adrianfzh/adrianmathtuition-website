-- Part-level out-of-syllabus marks: keep them when `parts` is re-written.
-- SPEC-PART-SYLLABUS.md, 9 Oct 2026.   *** WRITTEN, NOT APPLIED. ***
-- Apply before the first part is marked on the live bank.
--
-- A mark lives on the part itself: questions.parts[..] carries
--   "legacy": true, "legacy_reason": "…"      and, on a dependent part,  "needs": ["b.ii"].
-- Most writers copy each part and change one field, so the keys survive. Two do not:
-- extraction's `bank_insert.py --update` and its MCP fallback upsert replace the whole
-- array from their own payload, which knows nothing of these keys.
--
-- This trigger is the net: when `parts` changes, each new part that does NOT mention a
-- key gets it back from the old part with the same label path. A writer that means to
-- clear a mark says so by WRITING the key — the admin control and the script write
-- "legacy": false / "needs": [] (lib/part-syllabus.ts applyPartMark), which this leaves alone.
--
-- Rollback:  drop trigger questions_keep_part_marks on public.questions;
--            drop function public.keep_part_marks(); drop function public.carry_part_marks(jsonb, jsonb);
--            drop function public.parts_have_legacy(jsonb);

begin;

/** True when any part, at any depth, is marked out of syllabus. */
create or replace function public.parts_have_legacy(p jsonb)
returns boolean language sql immutable as $$
  select coalesce(jsonb_path_exists(p, '$.**.legacy ? (@ == true)'), false);
$$;

/** New parts with the three mark keys carried over from the old part of the same label. */
create or replace function public.carry_part_marks(new_parts jsonb, old_parts jsonb)
returns jsonb language plpgsql immutable as $$
declare
  out jsonb := '[]'::jsonb;
  np jsonb; op jsonb; k text; lbl text;
begin
  if new_parts is null or jsonb_typeof(new_parts) <> 'array' then return new_parts; end if;
  if old_parts is null or jsonb_typeof(old_parts) <> 'array' then return new_parts; end if;
  for np in select * from jsonb_array_elements(new_parts) loop
    if jsonb_typeof(np) = 'object' then
      lbl := regexp_replace(lower(coalesce(np->>'label', '')), '[^a-z0-9]', '', 'g');
      select e into op from jsonb_array_elements(old_parts) e
        where jsonb_typeof(e) = 'object'
          and regexp_replace(lower(coalesce(e->>'label', '')), '[^a-z0-9]', '', 'g') = lbl
        limit 1;
      if lbl <> '' and op is not null then
        foreach k in array array['legacy', 'legacy_reason', 'needs', 'needs_cleared', 'checked'] loop
          if op ? k and not np ? k then np := np || jsonb_build_object(k, op->k); end if;
        end loop;
        if np ? 'subparts' and op ? 'subparts' then
          np := jsonb_set(np, '{subparts}', public.carry_part_marks(np->'subparts', op->'subparts'));
        end if;
      end if;
    end if;
    out := out || jsonb_build_array(np);
  end loop;
  return out;
end $$;

create or replace function public.keep_part_marks()
returns trigger language plpgsql as $$
begin
  if new.parts is distinct from old.parts and public.parts_have_legacy(old.parts) then
    new.parts := public.carry_part_marks(new.parts, old.parts);
  end if;
  return new;
end $$;

drop trigger if exists questions_keep_part_marks on public.questions;
create trigger questions_keep_part_marks
  before update of parts on public.questions
  for each row execute function public.keep_part_marks();

commit;

-- NOT in this file — two serving-side SQL reads that hand a bank question to a model as an
-- example to write a new one from. They return no `parts`, so the website cannot filter them:
--   public.practice_exemplars(...)   (lib/learn/generate-practice.ts)
--   public.twin_queue                (the twin scripts' seed list)
-- Add  `and not public.parts_have_legacy(q.parts)`  to each, against its LIVE definition
-- (twin_queue has an unapplied re-create in migrations/twin_queue_hidden_subgroups.sql —
-- fold it in there).
