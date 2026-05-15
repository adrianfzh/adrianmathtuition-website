# Practice Cards — Implementation Brief

**Goal:** Add a third `content_kind` value `'practice'` to `content_snippets`, alongside `'refresher'` and `'worked_example'`. Practice cards store single questions (with answer + marks + optional solution) that Adrian curates in the Cards Editor. They become the source-of-truth for three downstream consumers:

1. **Revision Practice Worksheet PDF** — generated on demand from all practice cards for a (level, topic), with optional writing-space layout.
2. **Drill (one-at-a-time)** — uses practice cards as one-shot seeds for AI variant generation, with similar KB entries as few-shot examples.
3. **Teach Me follow-up** — "try a similar question" CTA in the swipe app routes to a related practice card.

This replaces the manual PDF-upload-to-Supabase-Storage approach for worksheets. PDFs become artifacts generated from editable card content, not standalone files.

---

## 1. Database

### 1a. content_snippets — new content_kind value

No schema migration. `content_snippets.content_kind` is already a TEXT column. Start writing `'practice'` from the editor.

Sanity SQL to verify after first inserts:
```sql
SELECT content_kind, COUNT(*) FROM content_snippets WHERE level='AM' GROUP BY content_kind;
-- Expected: worked_example, refresher, practice
```

### 1b. Practice card structure

A practice card uses the existing card fields but the `content` field is structured. Recommended convention for the markdown:

```markdown
**Question:** Simplify the expression $\dfrac{x^2 - 9}{3x^2 - 9x}$.

**Marks:** [2]

---

**Answer:** $\dfrac{x+3}{3x}$

---

**Solution:** *(optional, shown on demand)*

$\dfrac{x^2 - 9}{3x^2 - 9x} = \dfrac{(x-3)(x+3)}{3x(x-3)} = \dfrac{x+3}{3x}$
```

Use three `---` horizontal-rule sections so the swipe-app / PDF renderer can split on them. The renderer shows the Question + Marks first, hides Answer + Solution behind a tap.

Alternative if `---` parsing feels brittle: add three new columns to `content_snippets`:
- `practice_answer TEXT`
- `practice_marks INT`
- `practice_solution TEXT`

These are NULL for non-practice cards. Slightly heavier schema but cleaner data; either approach is fine. Recommend the column approach because it makes PDF generation and verification queries far simpler.

If going with columns:
```sql
ALTER TABLE content_snippets
  ADD COLUMN practice_answer TEXT,
  ADD COLUMN practice_marks INT,
  ADD COLUMN practice_solution TEXT;
NOTIFY pgrst, 'reload schema';
```

---

## 2. Cards Editor (`/admin/edit-cards`)

### 2a. Three-section view

Each sub-group now shows three stacked panels (extending the existing two):
- **🧠 Refresher**
- **💡 Worked Examples**
- **✏️ Practice** ← NEW

All three support `+ Section`, drag-reorder, cross-section drag (as already implemented).

### 2b. Practice card editor

The single-card editor at `/admin/edit-cards/[id]` adapts to `content_kind`:

For `practice` cards, show:
- The standard Markdown + LaTeX textarea (still primary)
- Plus three explicit input fields below it:
  - **Answer** (single line, LaTeX OK) — required
  - **Marks** (number input, 1–10) — required
  - **Solution** (optional textarea, Markdown + LaTeX) — optional

These are stored in the dedicated columns (recommended) or appended to the markdown content via the `---` convention if going schema-light.

The kind badge at the top: ✏️ Practice (already shown for the other two kinds).

### 2c. AI assist sidebar for practice

The existing `edit-cards-ai` SSE endpoint already passes `content_kind` (per the previous brief). For `practice` cards, the system prompt should adapt:
- "Make clearer" — clarify the question wording, don't change difficulty.
- "Shorten ~30%" — keep marks/answer unchanged.
- New action button: **"Generate answer + solution"** — given the Question only, AI fills in the Answer and Solution fields. Useful when Adrian types a question without working out the answer.
- New action button: **"Add 1-mark question"** / **"Add 3-mark question"** etc. — generates a similar question of specified difficulty as a new card.

---

## 3. API routes

Extend existing routes already supporting `kind` (per the Refresher brief):
- `GET /api/admin/cards/list?kind=practice` — list practice cards for a sub-group
- `POST /api/admin/cards/create` with `content_kind: 'practice'` — accept `practice_answer`, `practice_marks`, `practice_solution` in body
- `PATCH /api/admin/cards/[id]` — update those fields
- `POST /api/admin/cards/sections/move-card` and `move-section` — already handle cross-kind moves

Add one new route:
- **`POST /api/admin/cards/generate-answer`** — body `{ cardId, question }`. Calls Claude Sonnet to derive the answer and solution from the question. Returns `{ answer, solution }`. Client side sets them in the editor; Adrian reviews + saves.

---

## 4. Revision Practice Worksheet PDF generation

### 4a. New website route

`GET /api/practice-worksheet/{level}/{topic-slug}.pdf?spaced=true|false`

Fetches all practice cards for `(level, canonicalTopic)` sorted by `sections_meta → subgroup_id → order_index` (the same sort the swipe app now uses). Renders to PDF via Puppeteer using a new template `src/lib/practice-worksheet-template.html`.

### 4b. Two layouts

`?spaced=false` (compact): questions stacked tightly, no writing space. For students who solve digitally.

`?spaced=true` (writing space): three blank lines per mark below each question. Standard textbook practice format. The example PDF Adrian sent (Surds Practice) is this layout.

### 4c. Answer key

PDF includes a separate page or section at the end: **"Answers"** — list of `1. answer 2. answer …` keyed to question numbers. Pulled from `practice_answer` column.

Solutions are NOT included in the PDF by default. If Adrian wants a solutions-included variant later, add `?solutions=true`.

### 4d. PDF naming

Generated PDFs are streamed inline (Content-Disposition: inline). If we want caching, store them in Vercel Blob keyed by `(level, topic, content-hash-of-question-set, spaced)` — but for v1 just regenerate on demand.

---

## 5. Bot integration

### 5a. Revision Practice Worksheet button

Currently calls `practice_worksheets` table for a manually-uploaded PDF URL. Change to: build the URL `${WEBSITE_BASE_URL}/api/practice-worksheet/${level}/${topic-slug}.pdf?spaced=true` and send that link. No DB lookup needed.

Fallback: if `(level, topic)` has zero `content_kind='practice'` cards, send "No revision worksheet yet for {topic} — try Drill instead 🎯" (same as current empty-state).

### 5b. Drill (one-at-a-time) — practice cards as seeds

This is the bigger change. Current drill flow:
1. Query `practice_questions` table for an unseen verified question.
2. If empty, fall back to AI generation using a `questions` table entry as seed.
3. Today this fallback is failing → "Couldn't get a question right now".

New flow:
1. Pick a random `content_kind='practice'` card for the (level, topic, sub-group), prefer one the student hasn't seen.
2. Send the question (Question + Marks visible; Answer + Solution behind buttons), exactly as today's drill flow shows pool-based questions.
3. After student taps "Show answer" / "Show solution", record in `student_revise_state` so it's marked as seen.

**AI variant generation** becomes an opt-in upgrade rather than the default:
4. Add a button "🎲 Different version of this Q" — when tapped, calls a new edge function `practice_variant` with the practice card as one-shot, plus 2-3 similar KB entries (matched via `related_subgroup_ids` and embedding) as few-shot. Generates a fresh problem of the same skill+difficulty. This is where the existing Sonnet generation lives.

This change removes the "no seed found" failure mode entirely — as long as a sub-group has at least one practice card, drill works. AI variants become a sweetener, not a requirement.

### 5c. Teach Me follow-up — "try this"

In the swipe app, after the last worked example in a sub-group, add a CTA: **"✏️ Try a practice question"** → opens the first practice card for that sub-group, with Answer + Solution hidden behind tap-to-reveal.

---

## 6. Implementation order

Recommended phases:

**Phase 1 — Schema + Editor (lowest risk, highest leverage):**
1. Add `practice_answer`, `practice_marks`, `practice_solution` columns (or use markdown convention — decide first).
2. Cards Editor: third panel for Practice. Same UI patterns as Refresher.
3. Single-card editor: extra Answer + Marks + Solution fields when `content_kind='practice'`.
4. AI assist: "Generate answer + solution" button.

Adrian can now curate practice questions in the editor.

**Phase 2 — Worksheet PDF generation:**
1. New API route + Puppeteer template.
2. Bot's Revision Practice Worksheet button switches to generated URL.

Students can now download printable worksheets per topic.

**Phase 3 — Drill flow rewrite:**
1. Bot's Drill button reads from `content_snippets` (kind=practice) instead of `practice_questions`.
2. Record progress in `student_revise_state` (already supports this).
3. Add "🎲 Different version" variant button.

Drill stops failing for sub-groups that have practice cards.

**Phase 4 — Teach Me follow-up:**
1. "Try a practice question" CTA in swipe app.

---

## 7. Migration of existing practice_questions

The existing `practice_questions` table holds AI-generated drill content. After Phase 3 ships, two options:

**Migrate:** for each `practice_questions` row that's `verified=true` and `flagged_count<3`, insert a `content_snippets` row with `content_kind='practice'`. Adrian then reviews them in the editor and curates.

**Leave it:** keep `practice_questions` as a legacy fallback, but only consult it after `content_snippets` is empty. Then deprecate gradually.

Recommend "leave it" until Adrian has populated practice cards for the topics that matter, then revisit.

---

## 8. Acceptance criteria

After Phase 1:
1. Open Cards Editor → AM Surds → see three panels including ✏️ Practice (empty).
2. Click + New practice. Editor shows Markdown textarea PLUS three new fields: Answer, Marks, Solution.
3. Save a practice card. See it appear in the Practice panel.

After Phase 2:
4. Hit `https://adrianmathtuition.com/api/practice-worksheet/am/surds.pdf?spaced=true` in browser. Get a PDF with all AM Surds practice cards, formatted like the example worksheet Adrian sent (Surds Practice).
5. In Telegram bot, /revise → Surds → 📄 Revision Practice Worksheet → get a link to that generated PDF.

After Phase 3:
6. In Telegram, /revise → Surds → 🎯 Drill (one at a time). Get a question from `content_snippets` where `content_kind='practice'`. Tap Show Answer / Show Solution — both work.
7. Tap 🎲 Different version → get an AI-generated variant.

After Phase 4:
8. Open swipe app, swipe through last worked example in sg105 → see "✏️ Try a practice question" CTA at the bottom of the last card.

---

## 9. Open questions for Adrian

- **Schema-light (markdown convention) vs columns?** I recommend columns. Trade-off: 3 nullable columns vs. parsing markdown sections. Columns make PDF generation and answer-key extraction trivial.
- **Practice card vs `questions` table relationship?** A practice card might point to a `questions.id` so we know its provenance (from an exam paper). Add optional `source_question_id BIGINT REFERENCES questions(id)` column — useful for traceability + future "show exam source" feature. Recommend yes.
- **Allow images in practice cards?** Yes — same markdown image support as the other card kinds. The PDF renderer needs to embed them.

---

## File-level summary

**adrianmathtuition-website:**
- `migrations/XXXX_practice_cards.sql` — add columns to content_snippets
- `src/app/api/admin/cards/list/route.ts` — already supports kind filter; verify includes practice
- `src/app/api/admin/cards/create/route.ts` — accept practice fields
- `src/app/api/admin/cards/[id]/route.ts` — PATCH includes practice fields
- `src/app/api/admin/cards/generate-answer/route.ts` — NEW (Sonnet call to fill answer + solution)
- `src/app/admin/edit-cards/page.tsx` — third Practice panel
- `src/app/admin/edit-cards/[id]/page.tsx` — extra Answer/Marks/Solution fields when kind=practice
- `src/app/api/practice-worksheet/[level]/[slug]/route.ts` — NEW PDF generator
- `src/lib/practice-worksheet-template.html` — NEW Puppeteer template
- `src/app/api/edit-cards-ai/route.ts` — adapt system prompt for kind=practice

**adrianmath-telegram-math-bot:**
- `handlers/revise.js` — change Revision Practice Worksheet handler to use generated URL
- `handlers/revise.js` — rewrite Drill to pull from content_snippets (practice kind)
- New file: `ai/practice-variant.js` — AI variant generation using practice card + KB few-shot

---

## Don't do these in this brief

- Don't migrate the existing `practice_questions` table yet — that's Phase 5 once practice cards are populated.
- Don't change the AI generation prompts for the existing AM practice loop until Phase 3.
- Don't build the "Try a practice question" CTA in swipe app until Phase 4 (Phase 1–3 don't depend on it).
