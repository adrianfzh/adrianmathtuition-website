-- Humanities school papers (6 Oct 2026, Adrian: "copy the secondary humanities and languages
-- and yes queue humanities and languages — priority social studies and english").
-- The school prelims / EOY papers join the TYS papers in humanities_questions:
--   * SS_NA = N(A) Social Studies (Combined Humanities 2125 / 2126 Paper 1), subject social_studies;
--   * national = true ONLY for school 'GCE' (the column defaulted to true for every row);
--   * a school paper's scheme is its own mark scheme (solution_source mark_scheme), never publisher_tys.
-- Nothing here is served: the tables keep RLS on with no policies (service key only).
alter table public.humanities_questions drop constraint if exists humanities_questions_level_check;
alter table public.humanities_questions add constraint humanities_questions_level_check
  check (level = any (array['HIST','HIST_E','GEOG','GEOG_E','SS','SS_NA']));
alter table public.humanities_source_sets drop constraint if exists humanities_source_sets_level_check;
alter table public.humanities_source_sets add constraint humanities_source_sets_level_check
  check (level = any (array['HIST','HIST_E','GEOG','GEOG_E','SS','SS_NA']));
alter table public.humanities_questions alter column national set default false;
update public.humanities_questions set national = (school = 'GCE') where national <> (school = 'GCE');

create or replace function public.bank_insert_humanities_paper(payload jsonb, on_conflict text default 'nothing')
returns jsonb language plpgsql as $$
declare
  d_subject text := payload->>'subject'; d_level text := payload->>'level';
  d_school text := coalesce(payload->>'school', 'GCE'); d_exam text := coalesce(payload->>'exam_type', 'GCE');
  d_year integer := (payload->>'year')::integer; d_paper text := payload->>'paper';
  d_src text := coalesce(payload->>'solution_source', case when coalesce(payload->>'school', 'GCE') = 'GCE' then 'publisher_tys' else 'mark_scheme' end);
  -- A school paper is never national (6 Oct 2026): national = the GCE papers only, unless the payload says.
  d_national boolean := coalesce((payload->>'national')::boolean, coalesce(payload->>'school', 'GCE') = 'GCE');
  probs text[] := array[]::text[];
  q jsonb; ss jsonb; sid uuid; rid uuid; was_ins boolean; v_paper text;
  set_ids jsonb := '{}'::jsonb;
  n_ins integer := 0; n_upd integer := 0; n_skip integer := 0; rows_out jsonb := '[]'::jsonb;
begin
  if on_conflict not in ('nothing', 'update') then raise exception 'on_conflict must be nothing or update'; end if;
  if d_subject not in ('history', 'geography', 'social_studies') then raise exception 'subject must be history, geography or social_studies'; end if;
  if not ((d_subject = 'history' and d_level in ('HIST', 'HIST_E')) or (d_subject = 'geography' and d_level in ('GEOG', 'GEOG_E'))
          or (d_subject = 'social_studies' and d_level in ('SS', 'SS_NA'))) then
    raise exception 'level % does not belong to subject %', d_level, d_subject;
  end if;
  if d_year is null or d_paper is null then raise exception 'payload needs year and paper'; end if;
  if d_src not in ('publisher_tys', 'mark_scheme', 'expanded_from_answer') then raise exception 'solution_source must be publisher_tys, mark_scheme or expanded_from_answer'; end if;
  if d_school <> 'GCE' and d_src = 'publisher_tys' then raise exception 'a school paper''s scheme is its own mark scheme: solution_source mark_scheme, never publisher_tys'; end if;
  if jsonb_typeof(payload->'rows') <> 'array' or jsonb_array_length(payload->'rows') = 0 then raise exception 'payload.rows must be a non-empty array'; end if;

  for ss in select * from jsonb_array_elements(case when jsonb_typeof(payload->'source_sets') = 'array' then payload->'source_sets' else '[]'::jsonb end) loop
    if coalesce(ss->>'set_key', '') = '' then probs := probs || 'a source set needs set_key'::text; end if;
    if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(ss->'sources') = 'array' then ss->'sources' else '[]'::jsonb end) s
               where coalesce(s->>'label', '') = '' or (coalesce(s->>'text', '') = '' and coalesce(s->>'image', '') = '')) then
      probs := probs || format('source set %s: every source needs a label and its text or an image', ss->>'set_key');
    end if;
  end loop;
  for q in select * from jsonb_array_elements(payload->'rows') loop
    probs := probs || public.humanities_row_problems(d_subject, q || jsonb_build_object('paper', coalesce(q->>'paper', d_paper)));
    if q->>'source_set' is not null and not exists (
         select 1 from jsonb_array_elements(case when jsonb_typeof(payload->'source_sets') = 'array' then payload->'source_sets' else '[]'::jsonb end) s
         where s->>'set_key' = q->>'source_set') then
      probs := probs || format('Q%s: source_set "%s" is not in payload.source_sets', q->>'question_number', q->>'source_set');
    end if;
  end loop;
  if cardinality(probs) > 0 then raise exception 'humanities payload refused, nothing written: %', array_to_string(probs, ' | '); end if;

  for ss in select * from jsonb_array_elements(case when jsonb_typeof(payload->'source_sets') = 'array' then payload->'source_sets' else '[]'::jsonb end) loop
    sid := null;
    select id into sid from public.humanities_source_sets
     where school = d_school and year = d_year and level = d_level and exam_type = d_exam
       and paper = coalesce(ss->>'paper', d_paper) and set_key = ss->>'set_key' and deleted_at is null;
    if sid is null then
      insert into public.humanities_source_sets (subject, level, school, exam_type, year, paper, set_key, title, background, sources, source_file)
      values (d_subject, d_level, d_school, d_exam, d_year, coalesce(ss->>'paper', d_paper), ss->>'set_key', ss->>'title', ss->>'background',
              coalesce(ss->'sources', '[]'::jsonb), payload->>'source_file')
      returning id into sid;
    elsif on_conflict = 'update' then
      update public.humanities_source_sets set title = ss->>'title', background = ss->>'background', sources = coalesce(ss->'sources', '[]'::jsonb),
             source_file = payload->>'source_file', updated_at = now() where id = sid;
    end if;
    set_ids := set_ids || jsonb_build_object(ss->>'set_key', sid);
  end loop;

  for q in select * from jsonb_array_elements(payload->'rows') loop
    v_paper := coalesce(q->>'paper', d_paper);
    rid := null; was_ins := null;
    insert into public.humanities_questions (subject, level, school, exam_type, year, paper, question_number, section, choice_group,
        source_set_id, skill, topics, question_text, sources, parts, total_marks, scheme, has_image, solution_source,
        source_file, scheme_file, not_in_syllabus, notes, extracted_by, national)
    values (d_subject, d_level, d_school, d_exam, d_year, v_paper, q->>'question_number', q->>'section', q->>'choice_group',
        case when q->>'source_set' is not null then (set_ids->>(q->>'source_set'))::uuid end,
        q->>'skill', array(select jsonb_array_elements_text(q->'topics')), q->>'question_text',
        coalesce(case when jsonb_typeof(q->'sources') = 'array' then q->'sources' end, '[]'::jsonb),
        case when jsonb_typeof(q->'parts') = 'array' and jsonb_array_length(q->'parts') > 0 then q->'parts' end,
        (q->>'total_marks')::integer,
        case when jsonb_typeof(q->'scheme') = 'object' then q->'scheme' end,
        coalesce((q->>'has_image')::boolean, false), coalesce(q->>'solution_source', d_src),
        coalesce(q->>'source_file', payload->>'source_file'), coalesce(q->>'scheme_file', payload->>'scheme_file'),
        coalesce((q->>'not_in_syllabus')::boolean, false), q->>'notes', payload->>'extracted_by', d_national)
    on conflict (school, year, level, exam_type, paper, question_number) where deleted_at is null
    do nothing
    returning id into rid;
    if rid is not null then
      n_ins := n_ins + 1; was_ins := true;
    elsif on_conflict = 'update' then
      update public.humanities_questions h set section = q->>'section', choice_group = q->>'choice_group',
          source_set_id = case when q->>'source_set' is not null then (set_ids->>(q->>'source_set'))::uuid end,
          skill = q->>'skill', topics = array(select jsonb_array_elements_text(q->'topics')), question_text = q->>'question_text',
          sources = coalesce(case when jsonb_typeof(q->'sources') = 'array' then q->'sources' end, '[]'::jsonb),
          parts = case when jsonb_typeof(q->'parts') = 'array' and jsonb_array_length(q->'parts') > 0 then q->'parts' end,
          total_marks = (q->>'total_marks')::integer, scheme = case when jsonb_typeof(q->'scheme') = 'object' then q->'scheme' end,
          has_image = coalesce((q->>'has_image')::boolean, false), solution_source = coalesce(q->>'solution_source', d_src),
          source_file = coalesce(q->>'source_file', payload->>'source_file'), scheme_file = coalesce(q->>'scheme_file', payload->>'scheme_file'),
          not_in_syllabus = coalesce((q->>'not_in_syllabus')::boolean, false), notes = q->>'notes',
          extracted_by = payload->>'extracted_by', national = d_national, updated_at = now()
       where h.school = d_school and h.year = d_year and h.level = d_level and h.exam_type = d_exam and h.paper = v_paper
         and h.question_number = q->>'question_number' and h.deleted_at is null
      returning h.id into rid;
      n_upd := n_upd + 1; was_ins := false;
    else
      n_skip := n_skip + 1;
    end if;
    rows_out := rows_out || jsonb_build_object('paper', v_paper, 'q', q->>'question_number', 'id', rid,
                  'status', case when rid is null then 'skipped' when was_ins then 'inserted' else 'updated' end);
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip, 'source_sets', set_ids, 'rows', rows_out);
end $$;

revoke all on function public.bank_insert_humanities_paper(jsonb, text) from public, anon, authenticated;
grant execute on function public.bank_insert_humanities_paper(jsonb, text) to service_role;
