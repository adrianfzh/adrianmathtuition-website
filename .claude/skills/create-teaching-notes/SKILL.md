---
name: create-teaching-notes
description: >
  Generate teaching-ready math materials from the AdrianMath question bank with
  annotated worked solutions in Adrian's signature style. Use whenever Adrian asks to
  create teaching notes, revision notes, annotated worked examples, a topical set,
  a revision set, or a tailored practice worksheet for a student — e.g. "make teaching
  notes for EM Sets", "revision set for JC binomial", "practice for a student weak in
  indices, ~40 marks". Produces .docx files students can learn from by just reading.
  This is different from create-worksheet (bare questions only): this skill writes
  pedagogically sequenced content WITH annotated solutions, notes boxes, and memory aids.
---

# Create Teaching Notes Skill

Generates three material types from the Supabase question bank (project `nempslbewxtlikfzachi`):

| Mode | Trigger phrases | Structure |
|---|---|---|
| **Topical teaching notes** | "teaching notes", "notes for <topic>" | Concept sections → notes → worked examples (boxed, annotated) → practice with answers |
| **Revision set** | "revision set", "rev for <topic>" | Formula/summary boxes → real-paper worked examples with source citations → annotated solutions |
| **Tailored practice** | "practice for a student weak in…" | Selected + ordered questions → marks budget → answer key (optionally full solutions) |

## Living style files — read these FIRST, from `docs/teaching-style/` in this repo (not this skill)

The style definition lives in `docs/teaching-style/` (moved from the retired AdrianMath
folder on 30 Sep 2026) so it can evolve without editing this skill. Before writing ANY content, read:

- `docs/teaching-style/STYLE.md` — annotation conventions, tone, docx house style
- (`DIAGRAMS.md` and `samples/` did not survive the move — use the figure library)
- `docs/teaching-style/FEEDBACK.md` — corrections from past reviews; treat every entry
  as a binding rule

(The STYLE.md in this skill folder is only a pointer to `docs/teaching-style/STYLE.md`.) The output must read like Adrian wrote it,
not like a textbook.

## Feedback loop (how the output converges on Adrian's style)

When Adrian returns corrections (tracked changes, a marked-up scan, or verbal
feedback): diff his version against the generated one, extract the generalizable
rules, append an entry to `docs/teaching-style/FEEDBACK.md`, and update STYLE.md. Then regenerate if asked. Never let the same correction happen twice.

## Pipeline (all modes)

1. **Clarify only if needed** (level, topic, length, answer format). Defaults:
   8–12 practice questions, answers-only key, topical mode.
2. **Pull candidates from the bank** via `execute_sql`. Filter `deleted_at IS NULL`.
   Useful signals for sequencing:
   - `topics` TEXT[] (canonical topics), `subgroups`/`question_subgroups` (1,125
     fine-grained skill groups — THE skeleton for pedagogical ordering)
   - `technique_tags`/`question_technique_tags` for method-based grouping
   - `difficulty`, `total_marks`, `year` (prefer recent), `has_image`
   - Question content lives in `question_text` + `parts` jsonb (labels a/b/c with
     subparts i/ii/iii); solutions in `parts[i].solution` or top-level `solution`.
3. **Sequence for learning**: one new idea per step, easy→hard within each section.
   Order sections by concept dependency (e.g. notation → listing → complement/
   intersection/union → Venn shading → set language → counting/probability link).
   Use subgroup names as section candidates.
4. **Verify every answer yourself** — recompute each question from scratch; never
   trust the stored solution blindly (stored answers are occasionally wrong; flag
   any mismatch to Adrian at the end instead of silently propagating).
4b. **Pull Adrian's own traps for the topic, and use only the ones that fit.**

   ```sql
   SELECT wrong_move, why_wrong, corrective_cue, source
   FROM pitfalls
   WHERE status = 'approved'          -- Adrian's sign-off; NEVER drop this filter
     AND subject = '<AM|EM|JC|S1|S2>' AND topic = ANY(ARRAY['<canonical topic>']);
   ```

   `status='approved'` is the gate. Rows default to `'pending'` and most have
   never been reviewed — an unreviewed trap can be plain wrong (a `marking` row
   claimed a bare "(rej)" loses a mark; Adrian's ruling, 1 Sep 2026, is that at
   Sec level a rejection needs no reason). Never widen the filter to see more.

   `subject` is the coarse level: fold `S3_AM`→`AM`, `S3_EM`/`EM_NA`→`EM`, any
   `JC*`→`JC`. These are Adrian's written-up traps (985 rows, tagged `notes`,
   `mined`, `inferred`, `jc-notes` or `marking`); `marking` ones came from his
   own students' papers, so prefer those when several fit.

   **Only if really relevant** — the point is one or two traps a student would
   actually hit on THESE questions, placed where the reader is about to hit them
   (a Take Note / Watch Out box next to the worked example that provokes it).
   A broad topic can hold 15; do NOT dump the list, do NOT invent a box for a
   trap none of your chosen questions exercise, and do NOT reword a trap into
   something vaguer. If none fit, add none — that is a normal outcome.
   Use `corrective_cue` as the phrasing; it is already written in his voice.
5. **Write annotated solutions** per STYLE.md: ← step annotations, strategy openers,
   Common Error blocks, calculator syntax where relevant.
5b. **Purpose-drawn teaching diagrams**: wherever a concept is easier to SEE than
   read (Venn regions, quadrant triangles, endpoint traps, curve sketches), generate
   a diagram from the figure library (bot `lib/figures/`). One idea per
   diagram. ALWAYS view the rendered PNG before embedding — fix overlapping labels
   or misplaced leaders first.
6. **Render docx** with docx-js per STYLE.md house-style parameters. Boxed solutions
   use single-cell tables. Validate:
   `python <docx-skill-path>/scripts/office/validate.py out.docx`
7. **Visual check**: convert to PDF → images → actually LOOK at every page before
   presenting (spacing, arrows aligned, answers right-aligned orange, boxes intact).
8. **Cite sources** for bank questions: `[<year>/<level>/<exam_type>/<school>/Q<n>]`
   (e.g. `[2025/EM/Prelim/Maris Stella/Q16]`). Mark adapted questions "modified".
9. Save final docx to the AdrianMath folder root; present with a one-line summary.

## Images from the bank

If a chosen question has `has_image = true`, download from
`https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/<file>`
(image refs live in `image_url` — formats vary: full URL, JSON array of paths, or
array of `{url,pos}` objects — and per-part `image_url`/`image_url_after` keys in
`parts`). VIEW each image to confirm it matches before embedding. Skip questions
whose images are missing from storage.

## Optional write-back to lesson_cards

If Adrian asks to save the material as a lesson: insert into `lessons` (name, level,
topics) + `lesson_cards` (content_kind: 'refresher' | 'worked_example' | 'practice',
section_name, card_title, content, marks, order_index, source_question_id). Use
base64 DO blocks for any content containing LaTeX (execute_sql collapses `\\`).

## Quality bar / self-check before presenting

- Every answer independently verified; discrepancies vs bank listed for Adrian
- Every solution step has a reason a student can follow without a tutor present
- No orphan sections (notes with no example, or practice with no preceding concept)
- Difficulty ramps within each section; no concept used before it is introduced
- Answers key complete, orange, and matches the questions' order/labels
