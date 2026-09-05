---
name: prelim-paper
description: Generate a complete S4 prelim exam paper (AM or EM, Paper 1 or 2) by assembling real past-prelim questions from the Supabase QB against the living blueprint (data/paper-blueprints.json), applying a setter-quality review pass, and rendering Adrian's house-style DOCX with answer key. Trigger on "prelim paper", "generate a test paper", "mock prelim", "full paper" — e.g. "prelim paper: AM P2, hard", "generate an EM P1 for Wei Jie", "test paper, em p2, stats-forward". Args (any order): level (AM|EM), paper (P1|P2), optional preset (standard | top-school-hard | calculus-forward-am-p2 | stats-forward-em-p2 | vintage-pre2023), optional student name (excludes their school's questions).
---

# Prelim paper generator

Assembles a real-questions prelim paper from the blueprint + QB. The blueprint
carries the empirical structure of 474 real papers; your job is faithful
assembly plus the judgment a human setter would add. DB access: Supabase MCP
`execute_sql`, project `nempslbewxtlikfzachi`. **Read-only** — never write.

## 1. Load the blueprint

Read `data/paper-blueprints.json` (repo root). Resolve the paper key
(`AM-P1` | `AM-P2` | `EM-P1` | `EM-P2`) and preset. A preset is an overlay:
multiply matching topics' pool weights by its multipliers, renormalize per
slot, and apply any mark-band shift. Default preset: `standard`.

## 1b. Excluded topics (Telegram /make, kind 5 — SPEC-WORKSHEET-MENU.md)

The request may carry `exclude: [canonical topics]` — schools that skip Sec 1
topics at a Sec 2 EOY, or a class that has not reached Vectors. Apply it to the
BUILDER, never as a filter at the end (a filter at the end leaves a short
paper): drop the excluded topics from every slot's `topic_pool` and
re-normalise the remaining weights per slot; drop them from `must_appear` too.
A slot whose pool empties falls back to the paper's overall pool (all
non-excluded topics, weighted by how often they appear across the blueprint)
— and you REPORT every such slot in the completion payload as `fallbacks`
(e.g. `["Q4", "Q11"]`), so Adrian's Telegram says which questions changed
shape. Total marks and question count still follow the blueprint.

## 2. Walk the slots

For each slot in order, sample a topic from its (overlaid) `topic_pool`
weights, subject to: every `must_appear` topic placed before pool choices
would exhaust its slots; `min_distinct_topics` respected; don't reuse a topic
unless the pool genuinely repeats it (AM-P1 legitimately repeats nothing;
check the blueprint, not intuition).

Fetch candidates per slot (adjust filters, then pick):

```sql
SELECT id, left(question_text,180) AS preview, total_marks, school, year,
       topics, parts, image_url, figure_url, question_image_url, images,
       answer, has_image
FROM questions
WHERE deleted_at IS NULL AND level = '<AM|EM>'
  AND exam_type ILIKE '%prelim%'
  AND topics && ARRAY['<topic>']
  AND total_marks BETWEEN <lo> AND <hi>
  AND (<no student> OR school <> '<student school>')
  AND id NOT IN (<already picked>)
ORDER BY year DESC
LIMIT 12;
```

Selection rules: prefer post-2023 questions; spread schools and years across
the paper (no school twice unless unavoidable); prefer `verified` rows when
present; avoid `ai_generated` unless the pool is thin. Near-duplicate guard:
if two picks smell alike, compare via the `embedding` column
(`SELECT 1 - (a.embedding <=> b.embedding)` for the pair) and swap one out
above ~0.9 similarity; if the operator errs, fall back to judgment on the
previews.

## 3. Land the total exactly

Slot mark ranges give slack. After the walk, adjust picks within their slot
ranges so the paper sums to the blueprint's `total_marks` exactly (swap a
5-mark for a 6-mark candidate, etc.). Never pad with off-blueprint questions.

## 4. The setter pass (your judgment — do not skip)

Review the assembled manifest as an experienced setter:
- **Ramp**: does difficulty build? (EM-P2's mark curve is flat by design —
  its ramp lives in sub-part depth and topic order instead.)
- **Closers**: AM papers should close on Integration (Area) / Tangents /
  Kinematics-family; **EM-P2 must end on Maths-in-Real-World-Context**
  (73/75 real papers do).
- **Skill duplication**: two questions secretly testing the same move → swap
  one (this is the #1 flaw of naive sampling).
- **Diagrams**: every geometry/graph question must have a usable image
  (check the image columns; `diagram_rate` in the blueprint is an upper
  bound, so verify per question, don't trust the rate).
- **Coverage feel**: read the topic list end to end — would Adrian believe a
  school set this?
Swap from the fetched alternates until it passes. Note each swap + reason.

## 5. Render

Hand the final ordered list to the **create-exam-paper** skill conventions:
mock-exam format — no topic labels on questions, working space sized by
marks, consolidated ANSWER KEY last page (from `answer` / `solution`),
images embedded from their URLs, house typography. Deliver the .docx (PDF on
request).

## 6. Report to Adrian

Always end with the manifest table: Qn · topic · marks · source school ·
year — plus the setter-pass swaps made and why. He audits by manifest.

## Maintenance

Blueprint stale after big QB growth? `node scripts/derive-paper-blueprints.mjs
--save-dump` (live env) or `--from-dump data/prelim-rows.json` (offline)
regenerates it. Presets and their rationale live inside the JSON.
