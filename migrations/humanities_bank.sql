-- The humanities bank (5 Oct 2026, Adrian: "why don't bank the questions? we can bank them
-- and still use it for background material for the marker … build this").
--
-- The O-Level History, Geography and Social Studies Ten-Year-Series papers, banked one row
-- per question with their sources and the printed answer scheme. NATIONAL papers
-- (school 'GCE') are GROUNDING ONLY (docs/CONTENT-POLICY.md): nothing here is served to a
-- student. RLS on with no policies — the service key only. Written by the extraction lane
-- through bank_insert_humanities_paper(); checked by verify_humanities_paper().
-- Applied to the main project (nempslbewxtlikfzachi) as migration `humanities_bank`.

-- ── The closed topic list per subject (from the SEAB syllabus content headings) ──────────
create table if not exists public.humanities_topics (
  subject   text not null check (subject in ('history', 'geography', 'social_studies')),
  topic     text not null,
  syllabus  text,          -- which syllabus heading it comes from
  note      text,          -- what belongs under it
  primary key (subject, topic)
);
alter table public.humanities_topics enable row level security;

insert into public.humanities_topics (subject, topic, syllabus, note) values
  -- Social Studies (2260–2265 /01): the three Issues of the current syllabus …
  ('social_studies', 'Exploring Citizenship and Governance', 'Issue 1', 'citizenship, governance, decision-making, the public good, civic participation, misinformation'),
  ('social_studies', 'Living in a Diverse Society', 'Issue 2', 'race, religion, immigration, socio-economic and other diversity, managing diversity'),
  ('social_studies', 'Being Part of a Globalised World', 'Issue 3', 'economic, cultural and security effects of globalisation, responses to it'),
  -- … and the themes of the syllabus before it (the 2016 paper)
  ('social_studies', 'Governance in Singapore (pre-2017 syllabus)', 'old Theme', 'principles and practice of governance in Singapore'),
  ('social_studies', 'Conflict and Harmony in Multi-ethnic Societies (pre-2017 syllabus)', 'old Theme', 'Sri Lanka, Northern Ireland, Singapore''s approach to harmony'),
  ('social_studies', 'Managing International Relations (pre-2017 syllabus)', 'old Theme', 'diplomacy, deterrence, regional and international cooperation, conflicts such as the Gulf War'),
  ('social_studies', 'Sustaining Economic Development (pre-2017 syllabus)', 'old Theme', 'economic development and its challenges'),
  ('social_studies', 'Facing Challenges and Change (pre-2017 syllabus)', 'old Theme', 'globalisation and its challenges'),
  -- History (2174 pure; the electives 2204 / 2267 / 2273 / 2261 P2) — both syllabuses:
  -- P1 "European Dominance and Challenges (1870s–1945)" / "Extension of European control in
  -- Southeast Asia and challenges to European dominance, 1870s–1942"; P2 "The Bi-Polar World
  -- Order (1945–1991)" / "The Cold War and decolonisation in Southeast Asia, 1940s–1991";
  -- the elective "The Making of the Contemporary World Order (1900s–1991)" / "The Making of
  -- the 20th Century Modern World, 1910s–1991".
  ('history', 'Extension of European control in Southeast Asia', 'P1', 'colonial expansion: the Straits Settlements, the Malay States (FMS), Vietnam, Indonesia; reasons and methods'),
  ('history', 'Impact of colonial rule in Southeast Asia', 'P1', 'colonial economies (tin, rubber, rice), society, administration'),
  ('history', 'Challenges to European dominance in Southeast Asia', 'P1', 'nationalism and anti-colonial movements to 1942'),
  ('history', 'World War I and the Paris Peace Settlement', 'P1 / elective', 'Treaty of Versailles and its effects'),
  ('history', 'The League of Nations', 'P1 / elective', 'aims, successes in the 1920s, failures in the 1930s (Manchuria, Abyssinia, Corfu)'),
  ('history', 'Stalin''s Soviet Union', 'P1 / elective', ''),
  ('history', 'Nazi Germany', 'P1 / elective', 'Hitler''s rise and rule, foreign policy to 1939'),
  ('history', 'Militarist Japan', 'P1 / elective', ''),
  ('history', 'Outbreak of World War II in Europe', 'P1 / elective', 'appeasement, the road to war 1936–39'),
  ('history', 'World War II in the Asia-Pacific', 'P1 / elective', 'the Pacific War, the Japanese Occupation of Southeast Asia'),
  ('history', 'End of World War II', 'P1 / elective', 'reasons for the defeat of Germany and Japan'),
  ('history', 'Origins of the Cold War', 'P2 / elective', 'the division of Europe and Germany, Berlin'),
  ('history', 'The Korean War', 'P2 / elective', ''),
  ('history', 'The Cuban Missile Crisis', 'P2 / elective', ''),
  ('history', 'The Vietnam War', 'P2 / elective', ''),
  ('history', 'End of the Cold War', 'P2 / elective', ''),
  ('history', 'Decolonisation in Southeast Asia', 'P2', 'the Malayan Emergency, independence of Malaya, Indonesia, Vietnam; nation-building'),
  -- Geography (2236 to 2023, 2279 from 2024; the electives 2204 / 2272 / 2260 P2)
  ('geography', 'Geography in Everyday Life', '2279 Cluster 1', 'thinking geographically, housing, transport, neighbourhoods, sustainable development'),
  ('geography', 'Geographical Investigations', 'fieldwork, both syllabuses', 'hypothesis, method, data collection and presentation, conclusions, evaluation'),
  ('geography', 'Tourism', '2279 Cluster 2 / 2236 Global Tourism', ''),
  ('geography', 'Weather and Climate', '2279 Cluster 3 / 2236 Variable Weather and Changing Climate', 'weather elements, climate types, climate change'),
  ('geography', 'Tectonics', '2279 Cluster 4 / 2236 Living with Tectonic Hazards', 'plate tectonics, earthquakes, volcanoes, living with the hazards'),
  ('geography', 'Singapore', '2279 Cluster 5', ''),
  ('geography', 'Coasts', '2236', 'coastal processes, landforms, management'),
  ('geography', 'Food Resources', '2236', ''),
  ('geography', 'Health and Disease', '2236', ''),
  ('geography', 'Geographical skills', 'skills, both syllabuses', 'reading a map, graph, table or photograph when the question tests the skill and no content area')
on conflict (subject, topic) do update set syllabus = excluded.syllabus, note = excluded.note;

-- ── Shared material: a case study's background + sources, or a paper's Insert figures ───
create table if not exists public.humanities_source_sets (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null check (subject in ('history', 'geography', 'social_studies')),
  level        text not null check (level in ('HIST', 'HIST_E', 'GEOG', 'GEOG_E', 'SS')),
  school       text not null default 'GCE',
  exam_type    text not null default 'GCE',
  year         integer not null,
  paper        text not null,
  set_key      text not null,        -- 'Section A', 'Q1', 'Insert' — as the paper groups them
  title        text,                 -- the case study's issue / question, as printed
  background   text,                 -- the Background Information, transcribed
  sources      jsonb not null default '[]'::jsonb,  -- [{label, kind, text, image, provenance}]
  source_file  text,
  national     boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index if not exists humanities_source_sets_key
  on public.humanities_source_sets (school, year, level, exam_type, paper, set_key) where deleted_at is null;
alter table public.humanities_source_sets enable row level security;

-- ── One row per question ──────────────────────────────────────────────────────────────
create table if not exists public.humanities_questions (
  id               uuid primary key default gen_random_uuid(),
  subject          text not null check (subject in ('history', 'geography', 'social_studies')),
  level            text not null check (level in ('HIST', 'HIST_E', 'GEOG', 'GEOG_E', 'SS')),
  school           text not null default 'GCE',
  exam_type        text not null default 'GCE',
  year             integer not null,
  paper            text not null,
  question_number  text not null,                 -- '1', '3' — never '3(a)'
  section          text,                          -- 'Section A: Source-Based Case Study', 'Section B: Essays'
  choice_group     text,                          -- either/or: 'Section B — answer two of Q2–Q4'
  source_set_id    uuid references public.humanities_source_sets(id),
  skill            text,                          -- for a question without parts; parts carry their own
  topics           text[] not null default '{}',  -- humanities_topics only
  question_text    text not null,                 -- the stem / the question ('' when only parts)
  sources          jsonb not null default '[]'::jsonb,  -- material belonging to THIS question only
  parts            jsonb,                         -- [{label, text, marks, skill, scheme, subparts?}]
  total_marks      integer not null,
  scheme           jsonb,                         -- for a question without parts
  has_image        boolean not null default false,
  solution_source  text not null check (solution_source in ('publisher_tys', 'mark_scheme', 'expanded_from_answer')),
  source_file      text,
  scheme_file      text,
  national         boolean not null default true, -- a national paper: grounding only, never served
  not_in_syllabus  boolean not null default false,
  notes            text,
  extracted_by     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index if not exists humanities_questions_key
  on public.humanities_questions (school, year, level, exam_type, paper, question_number) where deleted_at is null;
create index if not exists humanities_questions_subject on public.humanities_questions (subject, level, year);
create index if not exists humanities_questions_topics on public.humanities_questions using gin (topics);
alter table public.humanities_questions enable row level security;

revoke all on public.humanities_topics, public.humanities_source_sets, public.humanities_questions from anon, authenticated;

-- ── The private bucket for source images (maps, cartoons, photographs, figures) ─────────
insert into storage.buckets (id, name, public) values ('humanities_images', 'humanities_images', false)
on conflict (id) do nothing;

-- ── The checks one leaf must pass (a part, a subpart, or a question without parts) ──────
create or replace function public.humanities_leaf_problems(p_where text, p_leaf jsonb)
returns text[] language plpgsql immutable as $$
declare
  probs text[] := array[]::text[];
  sc jsonb := p_leaf->'scheme';
  skills text[] := array['message','inference','comparison','reliability','usefulness','purpose','surprise','proof','how_far',
                         'sr_explain','sr_weigh','essay_explain','essay_evaluate',
                         'describe','explain','suggest','compare','calculate','fieldwork','evaluate'];
begin
  if p_leaf->>'skill' is null or not (p_leaf->>'skill' = any(skills)) then
    probs := probs || format('%s: skill %s is not one of %s', p_where, coalesce(p_leaf->>'skill', '(none)'), array_to_string(skills, ', '));
  end if;
  if sc is null or jsonb_typeof(sc) <> 'object' then
    return probs || format('%s: no scheme', p_where);
  end if;
  if coalesce(sc->>'marking', '') not in ('levels', 'points') then
    probs := probs || format('%s: scheme.marking must be levels or points', p_where);
  end if;
  if coalesce(sc->>'model_answer', '') = ''
     and coalesce(jsonb_array_length(case when jsonb_typeof(sc->'points') = 'array' then sc->'points' end), 0) = 0
     and coalesce(jsonb_array_length(case when jsonb_typeof(sc->'levels') = 'array' then sc->'levels' end), 0) = 0 then
    probs := probs || format('%s: scheme has no model_answer, points or levels', p_where);
  end if;
  if sc->>'marking' = 'points' and coalesce(jsonb_array_length(case when jsonb_typeof(sc->'points') = 'array' then sc->'points' end), 0) = 0 then
    probs := probs || format('%s: a point-marked scheme needs its points list', p_where);
  end if;
  return probs;
end $$;

-- ── Everything wrong with one question row (used by insert AND verify) ──────────────────
create or replace function public.humanities_row_problems(p_subject text, p_row jsonb)
returns text[] language plpgsql stable as $$
declare
  probs text[] := array[]::text[];
  qn text := coalesce(p_row->>'question_number', '?');
  w text := 'P' || coalesce(p_row->>'paper', '?') || ' Q' || qn;
  part jsonb; sub jsonb; s jsonb; t text;
  psum integer; ssum integer; pm integer;
begin
  if p_row->>'question_number' is null or p_row->>'question_number' ~ '\(' then probs := probs || (w || ': question_number missing or not a bare number'); end if;
  if p_row->>'question_text' is null then probs := probs || (w || ': question_text missing (send "" for a parts-only question)'); end if;
  if coalesce((p_row->>'total_marks')::integer, 0) <= 0 then probs := probs || (w || ': total_marks must be a positive integer'); end if;
  if jsonb_typeof(p_row->'topics') <> 'array' or jsonb_array_length(p_row->'topics') = 0 then
    probs := probs || (w || ': topics empty');
  else
    for t in select jsonb_array_elements_text(p_row->'topics') loop
      if not exists (select 1 from public.humanities_topics h where h.subject = p_subject and h.topic = t) then
        probs := probs || format('%s: topic "%s" is not in humanities_topics for %s', w, t, p_subject);
      end if;
    end loop;
  end if;
  for s in select * from jsonb_array_elements(case when jsonb_typeof(p_row->'sources') = 'array' then p_row->'sources' else '[]'::jsonb end) loop
    if coalesce(s->>'label', '') = '' or (coalesce(s->>'text', '') = '' and coalesce(s->>'image', '') = '') then
      probs := probs || (w || ': a source needs a label and its text or an image');
    end if;
  end loop;
  if jsonb_typeof(p_row->'parts') = 'array' and jsonb_array_length(p_row->'parts') > 0 then
    if p_row->'scheme' is not null and jsonb_typeof(p_row->'scheme') = 'object' then
      probs := probs || (w || ': a question with parts keeps its schemes on the parts, never on the row');
    end if;
    psum := 0;
    for part in select * from jsonb_array_elements(p_row->'parts') loop
      pm := coalesce((part->>'marks')::integer, 0);
      psum := psum + pm;
      if coalesce(part->>'label', '') = '' or part->>'text' is null then probs := probs || (w || ': a part needs label and text'); end if;
      if jsonb_typeof(part->'subparts') = 'array' and jsonb_array_length(part->'subparts') > 0 then
        ssum := 0;
        for sub in select * from jsonb_array_elements(part->'subparts') loop
          ssum := ssum + coalesce((sub->>'marks')::integer, 0);
          probs := probs || public.humanities_leaf_problems(w || '(' || coalesce(part->>'label', '?') || ')(' || coalesce(sub->>'label', '?') || ')', sub);
        end loop;
        if ssum <> pm then probs := probs || format('%s(%s): subparts add to %s, the part says %s', w, part->>'label', ssum, pm); end if;
      else
        probs := probs || public.humanities_leaf_problems(w || '(' || coalesce(part->>'label', '?') || ')', part);
      end if;
    end loop;
    if psum <> coalesce((p_row->>'total_marks')::integer, 0) then
      probs := probs || format('%s: parts add to %s, total_marks says %s', w, psum, p_row->>'total_marks');
    end if;
  else
    probs := probs || public.humanities_leaf_problems(w, p_row);
  end if;
  return probs;
end $$;

-- ── Insert one paper in one transaction ─────────────────────────────────────────────────
-- payload: {subject, level, school, year, exam_type, paper, source_file, scheme_file,
--           solution_source, extracted_by,
--           source_sets: [{set_key, title, background, sources:[…]}],
--           rows: [{question_number, section, choice_group, source_set, skill, topics,
--                   question_text, sources, parts | scheme, total_marks, has_image,
--                   not_in_syllabus, notes}]}
-- Validates EVERYTHING first and inserts nothing when any check fails.
create or replace function public.bank_insert_humanities_paper(payload jsonb, on_conflict text default 'nothing')
returns jsonb language plpgsql as $$
declare
  d_subject text := payload->>'subject'; d_level text := payload->>'level';
  d_school text := coalesce(payload->>'school', 'GCE'); d_exam text := coalesce(payload->>'exam_type', 'GCE');
  d_year integer := (payload->>'year')::integer; d_paper text := payload->>'paper';
  d_src text := coalesce(payload->>'solution_source', 'publisher_tys');
  probs text[] := array[]::text[];
  q jsonb; ss jsonb; sid uuid; rid uuid; was_ins boolean; v_paper text;
  set_ids jsonb := '{}'::jsonb;
  n_ins integer := 0; n_upd integer := 0; n_skip integer := 0; rows_out jsonb := '[]'::jsonb;
begin
  if on_conflict not in ('nothing', 'update') then raise exception 'on_conflict must be nothing or update'; end if;
  if d_subject not in ('history', 'geography', 'social_studies') then raise exception 'subject must be history, geography or social_studies'; end if;
  if not ((d_subject = 'history' and d_level in ('HIST', 'HIST_E')) or (d_subject = 'geography' and d_level in ('GEOG', 'GEOG_E'))
          or (d_subject = 'social_studies' and d_level = 'SS')) then
    raise exception 'level % does not belong to subject %', d_level, d_subject;
  end if;
  if d_year is null or d_paper is null then raise exception 'payload needs year and paper'; end if;
  if d_src not in ('publisher_tys', 'mark_scheme', 'expanded_from_answer') then raise exception 'solution_source must be publisher_tys, mark_scheme or expanded_from_answer'; end if;
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
        source_file, scheme_file, not_in_syllabus, notes, extracted_by)
    values (d_subject, d_level, d_school, d_exam, d_year, v_paper, q->>'question_number', q->>'section', q->>'choice_group',
        case when q->>'source_set' is not null then (set_ids->>(q->>'source_set'))::uuid end,
        q->>'skill', array(select jsonb_array_elements_text(q->'topics')), q->>'question_text',
        coalesce(case when jsonb_typeof(q->'sources') = 'array' then q->'sources' end, '[]'::jsonb),
        case when jsonb_typeof(q->'parts') = 'array' and jsonb_array_length(q->'parts') > 0 then q->'parts' end,
        (q->>'total_marks')::integer,
        case when jsonb_typeof(q->'scheme') = 'object' then q->'scheme' end,
        coalesce((q->>'has_image')::boolean, false), coalesce(q->>'solution_source', d_src),
        coalesce(q->>'source_file', payload->>'source_file'), coalesce(q->>'scheme_file', payload->>'scheme_file'),
        coalesce((q->>'not_in_syllabus')::boolean, false), q->>'notes', payload->>'extracted_by')
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
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip, 'source_sets', set_ids, 'rows', rows_out);
end $$;

-- ── Verify one paper key: counts, marks per paper and per either/or group, every problem,
--    and the image filenames to HEAD in the bucket ──────────────────────────────────────
create or replace function public.verify_humanities_paper(p_school text, p_year integer, p_level text, p_exam_type text default 'GCE')
returns jsonb language plpgsql stable as $$
declare
  o jsonb; fails text[] := array[]::text[]; r record; v jsonb; imgs jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('paper', paper, 'questions', c, 'marks_all_rows', m, 'with_images', i) order by paper), '[]'::jsonb)
    into v
    from (select paper, count(*) c, sum(total_marks) m, count(*) filter (where has_image) i
            from public.humanities_questions
           where school = p_school and year = p_year and level = p_level and exam_type = p_exam_type and deleted_at is null
           group by paper) s;
  o := jsonb_build_object('key', jsonb_build_object('school', p_school, 'year', p_year, 'level', p_level, 'exam_type', p_exam_type), 'papers', v);
  if jsonb_array_length(v) = 0 then fails := fails || 'no rows for this paper key'::text; end if;

  select coalesce(jsonb_agg(jsonb_build_object('paper', paper, 'choice_group', choice_group, 'questions', qs, 'marks_each', ms)), '[]'::jsonb)
    into v
    from (select paper, choice_group, jsonb_agg(question_number order by question_number) qs, jsonb_agg(total_marks order by question_number) ms
            from public.humanities_questions
           where school = p_school and year = p_year and level = p_level and exam_type = p_exam_type and deleted_at is null and choice_group is not null
           group by paper, choice_group) s;
  o := o || jsonb_build_object('choice_groups', v);

  for r in select subject, paper, question_number, to_jsonb(h) as j from public.humanities_questions h
            where school = p_school and year = p_year and level = p_level and exam_type = p_exam_type and deleted_at is null loop
    fails := fails || public.humanities_row_problems(r.subject, r.j);
  end loop;

  select coalesce(jsonb_agg(distinct f), '[]'::jsonb) into imgs from (
    select s->>'image' f from public.humanities_questions h, jsonb_array_elements(h.sources) s
     where h.school = p_school and h.year = p_year and h.level = p_level and h.exam_type = p_exam_type and h.deleted_at is null and coalesce(s->>'image', '') <> ''
    union all
    select s->>'image' from public.humanities_source_sets ss, jsonb_array_elements(ss.sources) s
     where ss.school = p_school and ss.year = p_year and ss.level = p_level and ss.exam_type = p_exam_type and ss.deleted_at is null and coalesce(s->>'image', '') <> ''
  ) x;
  o := o || jsonb_build_object('image_files', imgs,
          'source_sets', (select coalesce(jsonb_agg(jsonb_build_object('paper', paper, 'set_key', set_key, 'sources', jsonb_array_length(sources)) order by paper, set_key), '[]'::jsonb)
                            from public.humanities_source_sets where school = p_school and year = p_year and level = p_level and exam_type = p_exam_type and deleted_at is null),
          'unknown_solution_source', (select count(*) from public.humanities_questions where school = p_school and year = p_year and level = p_level
                                       and exam_type = p_exam_type and deleted_at is null and solution_source not in ('publisher_tys', 'mark_scheme', 'expanded_from_answer')));
  return o || jsonb_build_object('failures', to_jsonb(fails), 'pass', cardinality(fails) = 0);
end $$;

revoke all on function public.humanities_leaf_problems(text, jsonb) from public, anon, authenticated;
revoke all on function public.humanities_row_problems(text, jsonb) from public, anon, authenticated;
revoke all on function public.bank_insert_humanities_paper(jsonb, text) from public, anon, authenticated;
revoke all on function public.verify_humanities_paper(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.bank_insert_humanities_paper(jsonb, text) to service_role;
grant execute on function public.verify_humanities_paper(text, integer, text, text) to service_role;
grant execute on function public.humanities_row_problems(text, jsonb) to service_role;
grant execute on function public.humanities_leaf_problems(text, jsonb) to service_role;
