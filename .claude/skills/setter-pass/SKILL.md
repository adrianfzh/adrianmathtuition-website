---
name: setter-pass
description: >
  Run the human-setter judgment pass on a saved prelim-builder draft. Trigger
  when Adrian says "run the setter pass on draft <id-prefix>" (the /admin/
  prelim-builder page tells him this phrase after saving). Reads the draft from
  Supabase paper_drafts, reviews it like an experienced paper-setter (ramp,
  closers, skill duplication, diagrams, coverage), swaps questions where needed,
  and writes the improved slots back to the same draft.
---

# Setter pass on a prelim-builder draft

The deterministic layer (/admin/prelim-builder) assembles blueprint-faithful
papers with no AI. This skill is the judgment layer it deliberately defers.
DB: Supabase MCP `execute_sql`, project `nempslbewxtlikfzachi`.

## 1. Load the draft

Adrian gives an 8-char id prefix. Fetch:

```sql
SELECT id, title, level, paper, preset, difficulty, slots, total_marks
FROM paper_drafts WHERE id::text LIKE '<prefix>%';
```

`slots` is a jsonb array of {pos, topic, target, pick, alternates, pinned}.
Each pick/alternate carries {id, total_marks, school, year, preview, …} —
fetch the FULL question rows (question_text, parts, answer, solution,
image fields) for every picked id before judging. **Respect pinned slots:
never swap a slot with `pinned: true`.**

## 2. The setter checklist (from the /prelim-paper skill — apply all)

- **Ramp**: difficulty should build; mark curve monotone-ish (EM-P2's curve
  is flat by design — its ramp lives in sub-part depth).
- **Closers**: AM papers close on Integration (Area) / Tangents / Kinematics
  family; **EM-P2 must end on Maths-in-Real-World-Context** (73/75 papers).
- **Skill duplication** (the #1 flaw of sampling): two questions secretly
  testing the same move → swap one. Check full texts, not previews. If a pair
  smells alike, compare embeddings:
  `SELECT 1 - (a.embedding <=> b.embedding) FROM questions a, questions b
   WHERE a.id='…' AND b.id='…'` — swap above ~0.9.
- **Diagrams**: every geometry/graph question needs a usable image
  (image_url/figure_url present, watermark clean). Verify per question.
- **Answer-key completeness**: every pick should have answer or solution;
  swap picks that have neither.
- **Coverage feel**: read the topic list end to end — would a school set this?
- **Total**: after swaps the paper must still sum to the blueprint total
  (swap within each slot's alternates first — they're mark-compatible).

## 3. Swaps

Prefer a slot's stored `alternates`. If none fits, query fresh candidates with
the same filters the builder used (level, prelim, topic overlap, slot mark
band, school-spread, exclude already-picked ids) and build a replacement pick
object with the same shape. Keep the displaced pick at the head of alternates.

## 4. Write back + report

Update the SAME draft (content only — builder owns everything else):

```sql
UPDATE paper_drafts
SET slots = $s$<new slots json>$s$::jsonb,
    total_marks = <new sum>, notes = concat(coalesce(notes,''), '
[setter-pass <date>] <one-line summary of swaps>'), updated_at = now()
WHERE id = '<full uuid>';
```

End with the manifest table (Qn · topic · marks · school · year), each swap
made and why, and anything Adrian should eyeball. He reloads the draft in
/admin/prelim-builder to see the result.
