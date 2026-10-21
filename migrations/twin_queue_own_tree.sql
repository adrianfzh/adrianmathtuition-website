-- twin_queue: a question's main sub-skill for twins comes from ITS OWN level's tree (21 Oct 2026).
-- Why: Adrian, 21 Oct 2026 — "for sec 2, they will also share sec 1 skill list" → a Sec 2 question under a
-- Sec 1-only topic may now be filed under a Sec 1 sub-skill (bot scripts/file-subgroups.js TREE_EXTRA_QLEVELS).
-- Without this, such a row would enter math_twin_units(['S2']) under a Sec 1 sub-skill and shift the Sec 2 twin
-- counts. A question with filings but none in its own tree is left out of the queue (as an unfiled one was before).
-- Only change from twin_queue_hidden_subgroups.sql: the `join questions qq` + tree condition in primary_sg.
create or replace view public.twin_queue as
 WITH drawn AS (
         SELECT student_attempts.question_id FROM student_attempts
          WHERE student_attempts.attempted_at > (now() - '90 days'::interval)
        UNION ALL
         SELECT portal_generation_log.question_id FROM portal_generation_log
          WHERE portal_generation_log.created_at > (now() - '90 days'::interval) AND portal_generation_log.question_id IS NOT NULL
        UNION ALL
         SELECT portal_assignments.question_id FROM portal_assignments
          WHERE portal_assignments.created_at > (now() - '90 days'::interval) AND portal_assignments.question_id IS NOT NULL
        UNION ALL
         SELECT unnest(sheet_sections.practice_question_ids) AS unnest FROM sheet_sections
          WHERE sheet_sections.created_at > (now() - '90 days'::interval)
        ), draws AS (
         SELECT drawn.question_id, count(*)::integer AS n FROM drawn GROUP BY drawn.question_id
        ), primary_sg AS (
         SELECT DISTINCT ON (qs.question_id) qs.question_id, s.id AS subgroup_id, s.name AS subgroup, s.topic
           FROM question_subgroups qs
             JOIN subgroups s ON s.id = qs.subgroup_id
             JOIN questions qq ON qq.id = qs.question_id
          WHERE COALESCE(s.visibility, 'all'::text) = ANY (ARRAY['all'::text, 'ip'::text])
            AND s.level = CASE WHEN qq.level IN ('EM', 'S3_EM') THEN 'EM' WHEN qq.level IN ('AM', 'S3_AM') THEN 'AM'
                               WHEN qq.level IN ('JC1', 'JC2') THEN 'JC' ELSE qq.level END
          ORDER BY qs.question_id, qs.is_primary DESC NULLS LAST, qs.confidence DESC NULLS LAST, s.id
        )
 SELECT q.id AS source_id, q.level, COALESCE(p.topic, q.topics[1]) AS topic, p.subgroup_id, p.subgroup,
    q.school, q.year, q.total_marks, q.difficulty, q.has_image,
    length(COALESCE(q.question_text, ''::text)) + length(COALESCE(q.parts::text, ''::text)) AS text_len,
    COALESCE(d.n, 0) AS draws_90d,
    (EXISTS ( SELECT 1 FROM questions t WHERE t.twin_of = q.id AND t.deleted_at IS NULL AND t.verified)) AS has_verified_twin,
    (EXISTS ( SELECT 1 FROM questions t WHERE t.twin_of = q.id AND t.deleted_at IS NULL)) AS has_any_twin
   FROM questions q
     LEFT JOIN draws d ON d.question_id = q.id
     LEFT JOIN primary_sg p ON p.question_id = q.id
  WHERE q.deleted_at IS NULL AND (q.school <> ALL (ARRAY['GCE'::text, 'AdrianMath'::text, 'AI Generated'::text]))
    AND NOT COALESCE(q."national", false) AND NOT COALESCE(q.legacy_syllabus, false) AND q.ai_generated IS NOT TRUE
    AND NOT parts_have_legacy(q.parts)
    AND (p.question_id IS NOT NULL OR NOT (EXISTS ( SELECT 1 FROM question_subgroups qs WHERE qs.question_id = q.id)));
