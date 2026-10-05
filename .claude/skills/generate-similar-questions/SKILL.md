---
name: generate-similar-questions
description: >
  Generate new math questions similar to a given source question, with a controllable
  similarity level and fully verified answers. Use whenever Adrian asks to "generate
  similar questions", "make a clone of this question", "create variations", "make a
  harder version", or pastes/screenshots a question and asks for more like it. The
  source can be a bank question (by school/year/Qn or id), a pasted question, or a
  screenshot. Never presents a generated question whose answer has not been
  independently verified. Can optionally insert verified questions into the
  AdrianMath question bank with ai_generated=true.
---

# Generate Similar Questions

Given ONE source question, produce N new questions at a chosen similarity level,
each with a verified answer (and worked solution if asked).

## Similarity ladder — ask Adrian for the level if not stated (default: re-skin)

| Level | Name | What changes | What stays |
|---|---|---|---|
| 1 | **clone** | numbers, specific sets/values | context, structure, part layout, difficulty |
| 2 | **re-skin** | context/story + values | skeleton: same parts, same skills, same difficulty |
| 3 | **same-skills** | structure and phrasing | the archetype/skills being tested; one new twist allowed |
| 4 | **harder** | difficulty: reverse direction, combine skills, remove scaffolding | the archetype |

Adrian may also say things like "80% similar" — map: ≥90% → clone, ~70–80% →
re-skin, ~50% → same-skills, "harder/stretch" → harder.

## Pipeline

1. **Get the source.** If a bank reference is given, fetch the full row
   (`question_text`, `parts`, `answer`, solutions, `topics`, `level`, images) via
   `execute_sql` (project `nempslbewxtlikfzachi`). If pasted/screenshotted, read it
   fully — including any diagram — and solve it yourself first to make sure you
   understand the archetype.
2. **Read the rule files** (living curriculum constraints):
   - `docs/teaching-style/STYLE.md` and `FEEDBACK.md` (this repo) — every entry is binding.
     Notably: Sec-level = no De Morgan's Laws by name, no algebraic factorising of
     set expressions, no source citations; answer placement rules.
   - `canonical_topics.json` in the bot repo's `extraction/` (`~/dev/adrianmath-telegram-math-bot/extraction/`) — the level's topic list; a generated
     question must not smuggle in concepts beyond the source's level (check the
     level subsets: S3/JC1 have reduced syllabi).
3. **Identify the archetype** in one sentence (e.g. "translate everyday statements
   into set notation: subset / disjoint / non-empty intersection") and list the
   distinct skills the source tests. At levels 1–2 the generated questions must test
   EXACTLY these skills; level 3 may restructure; level 4 may extend.
4. **Generate candidates.** Write each question completely: stem, parts with marks
   (mirror the source's mark allocation at levels 1–2), and an INTENDED answer +
   worked solution. Vary contexts sensibly (Singapore school-appropriate). If the
   question needs a diagram, draw it with `teaching_style/diagram_helpers.py` per
   DIAGRAMS.md and view it before use.
5. **VERIFY — the gate that cannot be skipped.** For each candidate:
   a. Re-solve the question from scratch in a fresh pass, deliberately NOT looking
      at the intended answer. For anything numeric/enumerable, recompute in Python
      (list the sets, count the regions, solve the equations programmatically).
   b. Compare with the intended answer. Mismatch → fix or regenerate that candidate
      ONCE; if it fails again, discard it and say so rather than shipping it.
   c. Sanity checks: marks sum correctly; every part is answerable from the given
      information; no ambiguity ("underline the correct statement" has exactly the
      advertised number of correct options); difficulty matches the requested level;
      no banned methods needed (rule files).
6. **Present** per the requested output:
   - chat: question + orange-style answer line
   - docx: house style via the create-teaching-notes conventions (auto-numbered,
     marks right-tab, `[Ans: …]` right-aligned orange directly below each question,
     no citations at Sec level)
   - worked examples: annotated boxed solutions per STYLE.md
7. **Optional bank insertion** — ONLY when Adrian explicitly asks. Insert via base64
   DO blocks (execute_sql collapses backslashes) with:
   - `ai_generated = true`, `source_question_id = <source uuid>` (if source is in bank)
   - `school = 'AI Generated'`, `year =` current year, `level` and `topics` copied
     from the source (topics from canonical list only), `difficulty` judged per the
     question-processing skill's calibration
   - solutions in the correct slots (parts → per-part; stem-only → top-level; never both)
   - generated diagrams uploaded via the `upload-image` edge function
     (`x-upload-secret` from `extraction/.upload_secret` in the bot checkout, gitignored) before linking image_url
   - verify the insert with a SELECT afterwards

## Founding example (2026-07-05)

Source: the "grapes" set-language question (B/G/S/L, statements → notation).
At re-skin level this produced: chess/badminton/track (direct clone of skills),
numbers (M ⊂ E, P ∩ E = {2}, M ∩ P = ∅), pets (D/C/H/L with an interpret part),
and polygons as the harder variant (S ⊂ R ∩ Q, Q ∩ R′ ≠ ∅). All answers were
re-derived independently before presenting. Use that document
(`Sets_Set_Language_Practice_EM.docx`) as the quality bar.

## Hard rules

- NEVER present or insert a question whose answer failed independent verification.
- Respect every rule in `teaching_style/FEEDBACK.md` — those are Adrian's corrections.
- Generated questions must be solvable with only the level's syllabus (check
  canonical_topics.json for the level's subset).
- At Sec level: no source citations, no De Morgan by name, no set-algebra
  factorising in solutions; region-by-region methods only.
- Do not insert into the bank unless explicitly asked; report `ai_generated` rows
  distinctly so they are never mistaken for real prelim questions.
