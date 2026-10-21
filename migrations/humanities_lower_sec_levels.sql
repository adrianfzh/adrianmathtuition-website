-- Lower-sec History and Geography levels (21 Oct 2026, Adrian: "yes — set up Sec 1–2 levels for
-- Geography, History and English, then queue the 78 files").
--   * S1_HIST / S2_HIST / S1_GEOG / S2_GEOG — one level per school year, like S1_EL / S2_EL (English
--     already had them) and the maths S1 / S2. G2 / G3 / Express papers share the year's level.
--   * humanities_topics gets `bands` ('upper' = Sec 3–4 / O-Level, 'lower' = Sec 1–2): a Sec 1–2
--     paper is tagged only from the lower-sec list, an upper-sec paper only from the upper list.
--     Fieldwork, map skills and weather/climate are in both.
--   * The insert function accepts the new levels; the row check reads the band from the level.
-- Nothing here is served: the tables keep RLS on with no policies (service key only). No new table.
-- Applied to the main project (nempslbewxtlikfzachi) on 21 Oct 2026.

alter table public.humanities_questions drop constraint if exists humanities_questions_level_check;
alter table public.humanities_questions add constraint humanities_questions_level_check
  check (level = any (array['HIST','HIST_E','GEOG','GEOG_E','SS','SS_NA','S1_HIST','S2_HIST','S1_GEOG','S2_GEOG']));
alter table public.humanities_source_sets drop constraint if exists humanities_source_sets_level_check;
alter table public.humanities_source_sets add constraint humanities_source_sets_level_check
  check (level = any (array['HIST','HIST_E','GEOG','GEOG_E','SS','SS_NA','S1_HIST','S2_HIST','S1_GEOG','S2_GEOG']));

alter table public.humanities_topics add column if not exists bands text[] not null default array['upper'];
alter table public.humanities_topics drop constraint if exists humanities_topics_bands_check;
alter table public.humanities_topics add constraint humanities_topics_bands_check
  check (cardinality(bands) > 0 and bands <@ array['upper','lower']);
update public.humanities_topics set bands = array['upper','lower']
 where subject = 'geography' and topic in ('Geographical Investigations', 'Geographical skills', 'Weather and Climate');

-- The MOE lower-secondary syllabuses (History: Singapore from the 14th century to after independence;
-- Geography: Water, Forests, Housing, Transport), checked against the 78 school papers of 21 Oct 2026.
insert into public.humanities_topics (subject, topic, syllabus, note, bands) values
  ('history', 'Singapore before 1819', 'Lower sec', 'Temasek and Singapura, 14th–19th century; regional ports and trade; the decline of Temasek', array['lower']),
  ('history', 'The founding of modern Singapore', 'Lower sec', 'Raffles, Farquhar and the 1819 treaty; why the British wanted a trading post', array['lower']),
  ('history', 'Colonial Singapore as a port city (1819–1942)', 'Lower sec', 'the free port, the Suez Canal, steamships, tin and rubber, the Great Depression, port facilities', array['lower']),
  ('history', 'Immigrants and life in colonial Singapore', 'Lower sec', 'push and pull factors, communities, contributions; law and order, piracy, secret societies; health, housing and education under British rule', array['lower']),
  ('history', 'The fall of Singapore and the Japanese Occupation', 'Lower sec', '1942–1945: why Singapore fell, life during the Occupation', array['lower']),
  ('history', 'Post-war Singapore and the road to self-government', 'Lower sec', '1945–1959: the British return, strikes, riots and trade unions, elections and self-government', array['lower']),
  ('history', 'Merger with Malaysia and separation', 'Lower sec', '1961–1965: why merger, the problems, why separation', array['lower']),
  ('history', 'Safeguarding independence and nation-building', 'Lower sec', 'after 1965: British withdrawal, National Service, Konfrontasi, defence and diplomacy; housing, education and the economy', array['lower']),
  ('history', 'Historical enquiry and source skills', 'Lower sec', 'only when the part tests a source skill and has no content of its own', array['lower']),
  ('geography', 'Water: the water cycle and water budget', 'Lower sec (Sec 1)', 'the hydrological cycle, water budget, catchments', array['lower']),
  ('geography', 'Water: supply, demand and management', 'Lower sec (Sec 1)', 'sources of water, NEWater, desalination, importing, conservation, water use', array['lower']),
  ('geography', 'Water: floods, droughts and water quality', 'Lower sec (Sec 1)', 'too much / too little water, pollution and water quality', array['lower']),
  ('geography', 'Forests: tropical rainforests and mangroves', 'Lower sec (Sec 1)', 'distribution, structure, plant adaptations', array['lower']),
  ('geography', 'Forests: uses, deforestation and conservation', 'Lower sec (Sec 1)', 'functions and human uses of forests, deforestation and its effects, the greenhouse effect, sustainable management', array['lower']),
  ('geography', 'Natural resources and energy', 'Lower sec', 'renewable and non-renewable resources, energy', array['lower']),
  ('geography', 'Housing: demand, provision and slums', 'Lower sec (Sec 2)', 'urbanisation, formal and informal housing, slums, public housing', array['lower']),
  ('geography', 'Housing: planning and sustainable housing', 'Lower sec (Sec 2)', 'land-use planning and zoning, inclusive and sustainable housing, smart features', array['lower']),
  ('geography', 'Transport: modes, systems and accessibility', 'Lower sec (Sec 2)', 'transport modes, nodes and networks, infrastructure quality, mobility, inclusive transport', array['lower']),
  ('geography', 'Transport: impacts, congestion and management', 'Lower sec (Sec 2)', 'effects on people, health and the environment, traffic congestion, road pricing / ERP', array['lower'])
on conflict (subject, topic) do update set syllabus = excluded.syllabus, note = excluded.note, bands = excluded.bands;

-- The row check: a topic must be on the list for the subject AND the paper's band. bank_insert passes
-- the level inside each row; a row without a level (an old caller) is checked against the upper list.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.humanities_row_problems(text,jsonb)'::regprocedure);
  if position('h.subject = p_subject and h.topic = t)' in d) = 0 then raise exception 'humanities_row_problems: anchor not found'; end if;
  d := replace(d, 'h.subject = p_subject and h.topic = t)',
    'h.subject = p_subject and h.topic = t and (case when coalesce(p_row->>''level'', '''') ~ ''^S[12]_'' then ''lower'' else ''upper'' end) = any(h.bands))');
  d := replace(d, '''%s: topic "%s" is not in humanities_topics for %s'', w, t, p_subject',
    '''%s: topic "%s" is not in humanities_topics for %s (%s)'', w, t, p_subject, case when coalesce(p_row->>''level'', '''') ~ ''^S[12]_'' then ''Sec 1–2 list'' else ''upper-sec list'' end');
  execute d;

  d := pg_get_functiondef('public.bank_insert_humanities_paper(jsonb,text)'::regprocedure);
  if position('(d_subject = ''history'' and d_level in (''HIST'', ''HIST_E''))' in d) = 0 then raise exception 'bank_insert_humanities_paper: level anchor not found'; end if;
  d := replace(d, '(d_subject = ''history'' and d_level in (''HIST'', ''HIST_E''))', '(d_subject = ''history'' and d_level in (''HIST'', ''HIST_E'', ''S1_HIST'', ''S2_HIST''))');
  d := replace(d, '(d_subject = ''geography'' and d_level in (''GEOG'', ''GEOG_E''))', '(d_subject = ''geography'' and d_level in (''GEOG'', ''GEOG_E'', ''S1_GEOG'', ''S2_GEOG''))');
  if position('q || jsonb_build_object(''paper'', coalesce(q->>''paper'', d_paper))' in d) = 0 then raise exception 'bank_insert_humanities_paper: row-check anchor not found'; end if;
  d := replace(d, 'q || jsonb_build_object(''paper'', coalesce(q->>''paper'', d_paper))', 'q || jsonb_build_object(''paper'', coalesce(q->>''paper'', d_paper), ''level'', d_level)');
  execute d;
end $$;

revoke all on function public.bank_insert_humanities_paper(jsonb, text) from public, anon, authenticated;
grant execute on function public.bank_insert_humanities_paper(jsonb, text) to service_role;
