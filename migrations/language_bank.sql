-- The language bank (6 Oct 2026, Adrian: "copy the secondary humanities and languages and yes
-- queue humanities and languages — priority social studies and english").
-- English first. One row per question / task of a school or national English paper, the
-- passages and visual texts they share in language_texts, pictures in the private bucket
-- language_images. The printed text exact; the answer only from the paper's OWN scheme
-- (answer_source 'mark_scheme'), never written by us — no scheme → answer null, 'none'.
-- Grounding / background only: RLS on, no policies, service key only. Nothing is served.
-- Written only through bank_insert_language_paper(payload); checked by verify_language_paper.

create table if not exists public.language_texts (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (subject in ('english','chinese','higher_chinese','malay','tamil')),
  level text not null,
  school text not null,
  exam_type text not null,
  year integer not null,
  paper text not null,
  set_key text not null,                       -- "Text 1", "Section B Text 2", "Visual Text"
  kind text not null check (kind in ('passage','visual_text','poem','extract','letter','article','transcript','other')),
  title text,
  text text not null default '',               -- every word, as printed, paragraph per line
  image text,                                  -- bare filename in language_images
  provenance text,
  source_file text,
  national boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists language_texts_key
  on public.language_texts (school, year, level, exam_type, paper, set_key) where deleted_at is null;
alter table public.language_texts enable row level security;

create table if not exists public.language_items (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (subject in ('english','chinese','higher_chinese','malay','tamil')),
  level text not null,                         -- english: EL (O-Level 1184/1128) · EL_NA (1190) · EL_NT (1195) · S1_EL · S2_EL · S3_EL · S3_EL_NA
  school text not null,
  exam_type text not null,
  year integer not null,
  paper text not null,
  section text,                                -- as printed: "Section A", "Section B: Comprehension"
  section_kind text not null check (section_kind in
    ('composition','situational_writing','editing','language_use','visual_text','comprehension','summary','vocabulary','oral','listening')),
  question_number text not null,               -- as printed, bare: "1", "12", "Task"; compositions "Q1".."Q4"
  choice_group text,                           -- "Section C — answer one of Q1–Q4"
  text_id uuid references public.language_texts(id),
  question_text text not null,                 -- the question / task / instructions as printed
  options jsonb,                               -- MCQ options, as printed, [{label, text}]
  parts jsonb,                                 -- [{label, text, marks, answer}] when the question has parts
  total_marks integer not null check (total_marks >= 0),
  answer jsonb,                                -- {answer, accept[], reject[], marks_note} from the paper's own scheme, exact
  answer_source text not null check (answer_source in ('mark_scheme','none')),
  has_image boolean not null default false,
  source_file text,
  scheme_file text,
  national boolean not null default false,
  notes text,
  extracted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists language_items_key
  on public.language_items (school, year, level, exam_type, paper, question_number) where deleted_at is null;
create index if not exists language_items_kind on public.language_items (subject, level, section_kind) where deleted_at is null;
alter table public.language_items enable row level security;

insert into storage.buckets (id, name, public) values ('language_images', 'language_images', false)
  on conflict (id) do nothing;

-- ── One row's problems (empty array = fine) ──────────────────────────────────────────────
create or replace function public.language_item_problems(p_row jsonb, p_has_scheme boolean)
returns text[] language plpgsql immutable as $$
declare
  probs text[] := array[]::text[];
  w text := 'Q' || coalesce(p_row->>'question_number', '?');
  k text := p_row->>'section_kind';
  part jsonb; s integer := 0;
begin
  if coalesce(p_row->>'question_number', '') = '' then probs := probs || 'a row needs question_number'::text; end if;
  if k is null or k not in ('composition','situational_writing','editing','language_use','visual_text','comprehension','summary','vocabulary','oral','listening') then
    probs := probs || format('%s: section_kind %s is not one of composition, situational_writing, editing, language_use, visual_text, comprehension, summary, vocabulary, oral, listening', w, coalesce(k, 'null'));
  end if;
  if coalesce(p_row->>'question_text', '') = '' and not (jsonb_typeof(p_row->'parts') = 'array' and jsonb_array_length(p_row->'parts') > 0) then
    probs := probs || format('%s: question_text is empty and there are no parts', w);
  end if;
  if (p_row->>'total_marks') is null then probs := probs || format('%s: total_marks missing', w); end if;
  if jsonb_typeof(p_row->'parts') = 'array' and jsonb_array_length(p_row->'parts') > 0 then
    for part in select * from jsonb_array_elements(p_row->'parts') loop
      if coalesce(part->>'label', '') = '' then probs := probs || format('%s: a part needs a label', w); end if;
      s := s + coalesce((part->>'marks')::integer, 0);
      if part ? 'answer' and part->'answer' <> 'null'::jsonb and not p_has_scheme then
        probs := probs || format('%s(%s): an answer with no scheme file — answers come only from the paper''s own scheme', w, part->>'label');
      end if;
    end loop;
    if (p_row->>'total_marks') is not null and s <> (p_row->>'total_marks')::integer then
      probs := probs || format('%s: parts add to %s, total_marks is %s', w, s, p_row->>'total_marks');
    end if;
  end if;
  if p_row ? 'answer' and p_row->'answer' <> 'null'::jsonb and not p_has_scheme then
    probs := probs || format('%s: an answer with no scheme file — answers come only from the paper''s own scheme', w);
  end if;
  if k in ('composition','situational_writing') and coalesce(p_row->>'question_text', '') = '' then
    probs := probs || format('%s: a writing task needs its full task text', w);
  end if;
  return probs;
end $$;

-- ── The one door ─────────────────────────────────────────────────────────────────────────
create or replace function public.bank_insert_language_paper(payload jsonb, on_conflict text default 'nothing')
returns jsonb language plpgsql as $$
declare
  d_subject text := payload->>'subject'; d_level text := payload->>'level';
  d_school text := payload->>'school'; d_exam text := payload->>'exam_type';
  d_year integer := (payload->>'year')::integer; d_paper text := payload->>'paper';
  d_scheme boolean := coalesce(payload->>'scheme_file', '') <> '';
  d_national boolean := coalesce((payload->>'national')::boolean, coalesce(payload->>'school', '') = 'GCE');
  probs text[] := array[]::text[];
  q jsonb; t jsonb; tid uuid; rid uuid; was_ins boolean; v_paper text;
  text_ids jsonb := '{}'::jsonb;
  n_ins integer := 0; n_upd integer := 0; n_skip integer := 0; rows_out jsonb := '[]'::jsonb;
begin
  if on_conflict not in ('nothing', 'update') then raise exception 'on_conflict must be nothing or update'; end if;
  if d_subject is distinct from 'english' then raise exception 'only english has extraction rules yet (subject %)', d_subject; end if;
  if d_level not in ('EL','EL_NA','EL_NT','S1_EL','S2_EL','S3_EL','S3_EL_NA') then
    raise exception 'level % is not an English level (EL, EL_NA, EL_NT, S1_EL, S2_EL, S3_EL, S3_EL_NA)', d_level;
  end if;
  if coalesce(d_school, '') = '' or coalesce(d_exam, '') = '' or d_year is null or coalesce(d_paper, '') = '' then
    raise exception 'payload needs school, exam_type, year and paper';
  end if;
  if jsonb_typeof(payload->'rows') <> 'array' or jsonb_array_length(payload->'rows') = 0 then raise exception 'payload.rows must be a non-empty array'; end if;

  for t in select * from jsonb_array_elements(case when jsonb_typeof(payload->'texts') = 'array' then payload->'texts' else '[]'::jsonb end) loop
    if coalesce(t->>'set_key', '') = '' then probs := probs || 'a text needs set_key'::text; end if;
    if coalesce(t->>'text', '') = '' and coalesce(t->>'image', '') = '' then
      probs := probs || format('text %s: needs its words or an image', t->>'set_key');
    end if;
    if coalesce(t->>'kind', '') not in ('passage','visual_text','poem','extract','letter','article','transcript','other') then
      probs := probs || format('text %s: kind %s is not passage, visual_text, poem, extract, letter, article, transcript or other', t->>'set_key', coalesce(t->>'kind', 'null'));
    end if;
  end loop;
  for q in select * from jsonb_array_elements(payload->'rows') loop
    probs := probs || public.language_item_problems(q, d_scheme);
    if q->>'text' is not null and not exists (
         select 1 from jsonb_array_elements(case when jsonb_typeof(payload->'texts') = 'array' then payload->'texts' else '[]'::jsonb end) s
         where s->>'set_key' = q->>'text') then
      probs := probs || format('Q%s: text "%s" is not in payload.texts', q->>'question_number', q->>'text');
    end if;
  end loop;
  if cardinality(probs) > 0 then raise exception 'language payload refused, nothing written: %', array_to_string(probs, ' | '); end if;

  for t in select * from jsonb_array_elements(case when jsonb_typeof(payload->'texts') = 'array' then payload->'texts' else '[]'::jsonb end) loop
    tid := null;
    select id into tid from public.language_texts
     where school = d_school and year = d_year and level = d_level and exam_type = d_exam
       and paper = coalesce(t->>'paper', d_paper) and set_key = t->>'set_key' and deleted_at is null;
    if tid is null then
      insert into public.language_texts (subject, level, school, exam_type, year, paper, set_key, kind, title, text, image, provenance, source_file, national)
      values (d_subject, d_level, d_school, d_exam, d_year, coalesce(t->>'paper', d_paper), t->>'set_key', t->>'kind', t->>'title',
              coalesce(t->>'text', ''), nullif(t->>'image', ''), t->>'provenance', payload->>'source_file', d_national)
      returning id into tid;
    elsif on_conflict = 'update' then
      update public.language_texts set kind = t->>'kind', title = t->>'title', text = coalesce(t->>'text', ''), image = nullif(t->>'image', ''),
             provenance = t->>'provenance', source_file = payload->>'source_file', updated_at = now() where id = tid;
    end if;
    text_ids := text_ids || jsonb_build_object(t->>'set_key', tid);
  end loop;

  for q in select * from jsonb_array_elements(payload->'rows') loop
    v_paper := coalesce(q->>'paper', d_paper);
    rid := null; was_ins := null;
    insert into public.language_items (subject, level, school, exam_type, year, paper, section, section_kind, question_number, choice_group,
        text_id, question_text, options, parts, total_marks, answer, answer_source, has_image, source_file, scheme_file, national, notes, extracted_by)
    values (d_subject, d_level, d_school, d_exam, d_year, v_paper, q->>'section', q->>'section_kind', q->>'question_number', q->>'choice_group',
        case when q->>'text' is not null then (text_ids->>(q->>'text'))::uuid end,
        coalesce(q->>'question_text', ''),
        case when jsonb_typeof(q->'options') = 'array' then q->'options' end,
        case when jsonb_typeof(q->'parts') = 'array' and jsonb_array_length(q->'parts') > 0 then q->'parts' end,
        (q->>'total_marks')::integer,
        case when jsonb_typeof(q->'answer') = 'object' then q->'answer' end,
        case when d_scheme then 'mark_scheme' else 'none' end,
        coalesce((q->>'has_image')::boolean, false), payload->>'source_file', payload->>'scheme_file', d_national, q->>'notes', payload->>'extracted_by')
    on conflict (school, year, level, exam_type, paper, question_number) where deleted_at is null
    do nothing
    returning id into rid;
    if rid is not null then
      n_ins := n_ins + 1; was_ins := true;
    elsif on_conflict = 'update' then
      update public.language_items h set section = q->>'section', section_kind = q->>'section_kind', choice_group = q->>'choice_group',
          text_id = case when q->>'text' is not null then (text_ids->>(q->>'text'))::uuid end,
          question_text = coalesce(q->>'question_text', ''), options = case when jsonb_typeof(q->'options') = 'array' then q->'options' end,
          parts = case when jsonb_typeof(q->'parts') = 'array' and jsonb_array_length(q->'parts') > 0 then q->'parts' end,
          total_marks = (q->>'total_marks')::integer, answer = case when jsonb_typeof(q->'answer') = 'object' then q->'answer' end,
          answer_source = case when d_scheme then 'mark_scheme' else 'none' end, has_image = coalesce((q->>'has_image')::boolean, false),
          source_file = payload->>'source_file', scheme_file = payload->>'scheme_file', national = d_national, notes = q->>'notes',
          extracted_by = payload->>'extracted_by', updated_at = now()
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
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip, 'texts', text_ids, 'rows', rows_out);
end $$;

-- ── Verify one paper key ─────────────────────────────────────────────────────────────────
create or replace function public.verify_language_paper(p_school text, p_year integer, p_level text, p_exam_type text)
returns jsonb language plpgsql stable as $$
declare o jsonb; fails text[] := array[]::text[]; r record; v jsonb; imgs jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('paper', paper, 'items', c, 'marks_all_rows', m, 'kinds', k, 'with_answer', a) order by paper), '[]'::jsonb) into v
    from (select paper, count(*) c, sum(total_marks) m, jsonb_agg(distinct section_kind) k,
                 count(*) filter (where answer is not null or exists (select 1 from jsonb_array_elements(coalesce(parts, '[]'::jsonb)) p where p ? 'answer' and p->'answer' <> 'null'::jsonb)) a
            from public.language_items where school = p_school and year = p_year and level = p_level and exam_type = p_exam_type and deleted_at is null
           group by paper) s;
  o := jsonb_build_object('key', jsonb_build_object('school', p_school, 'year', p_year, 'level', p_level, 'exam_type', p_exam_type), 'papers', v);
  if jsonb_array_length(v) = 0 then fails := fails || 'no rows for this paper key'::text; end if;
  for r in select to_jsonb(h) j, (scheme_file is not null and scheme_file <> '') sch from public.language_items h
            where school = p_school and year = p_year and level = p_level and exam_type = p_exam_type and deleted_at is null loop
    fails := fails || public.language_item_problems(r.j, r.sch);
  end loop;
  select coalesce(jsonb_agg(distinct image), '[]'::jsonb) into imgs from public.language_texts
   where school = p_school and year = p_year and level = p_level and exam_type = p_exam_type and deleted_at is null and coalesce(image, '') <> '';
  o := o || jsonb_build_object('image_files', imgs,
        'texts', (select coalesce(jsonb_agg(jsonb_build_object('paper', paper, 'set_key', set_key, 'kind', kind, 'words', coalesce(array_length(regexp_split_to_array(trim(text), '\s+'), 1), 0)) order by paper, set_key), '[]'::jsonb)
                    from public.language_texts where school = p_school and year = p_year and level = p_level and exam_type = p_exam_type and deleted_at is null),
        'orphan_texts', (select count(*) from public.language_texts t where school = p_school and year = p_year and level = p_level and exam_type = p_exam_type
                           and deleted_at is null and not exists (select 1 from public.language_items i where i.text_id = t.id and i.deleted_at is null)));
  return o || jsonb_build_object('failures', to_jsonb(fails), 'pass', cardinality(fails) = 0);
end $$;

revoke all on function public.language_item_problems(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.bank_insert_language_paper(jsonb, text) from public, anon, authenticated;
revoke all on function public.verify_language_paper(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.language_item_problems(jsonb, boolean) to service_role;
grant execute on function public.bank_insert_language_paper(jsonb, text) to service_role;
grant execute on function public.verify_language_paper(text, integer, text, text) to service_role;
