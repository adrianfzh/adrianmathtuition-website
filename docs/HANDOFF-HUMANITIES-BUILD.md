# Hand-over — the Humanities build (Adrian, 7 Oct 2026)

Adrian, 7 Oct 2026: *"do #1 to #5 / and let's do geography next / then history essays / and then
practice by skill"*. This note is for a FRESH session (one topic per session). Read
[`SPEC-HUMANITIES.md`](../SPEC-HUMANITIES.md) first — all of it — then `docs/CONTENT-POLICY.md`.

Talk to Adrian in plain, short words. No jargon.

## Where it stands (checked 7 Oct 2026)

- Built, switch closed (`HUMANITIES_OPEN_TO_STUDENTS = false`; Adrian's cookie + the demo student):
  `/app/humanities` — Social Studies source questions (10 own sets, 30 questions), Social Studies
  structured response (5 sets, 10 questions), History source questions (5 sets, 15 questions).
  Typed answers only. A level range and the one lift — never a mark.
- The bank (grounding only, never served): `humanities_questions` 1,149 rows — Social Studies 429
  (21 of them N(A)), History 353, Geography 367 — with `humanities_source_sets`.
- The bench passed for all three built parts (SPEC §4). Its limits are written there.
- Geography, History essays, Literature: nothing built.

## The order Adrian asked for

### A. Social Studies — five steps

1. **More source sets, as full case studies.** From 10 sets to about 40. Each set is a real
   case study: Background Information, Sources A–E/F, five linked questions ending with the
   10-mark "how far" question — so a student can do the whole 35-mark run, or one question.
   - Our OWN sources and questions. The banked rows are the guide for shape, skill mix, source
     kinds and difficulty — never copied, never number-swapped (`docs/CONTENT-POLICY.md`).
   - No invented quotation in a real named person's mouth (the History rule, SPEC H2).
   - Every new set carries seeded answers at each level, and the bench must pass on the new
     sets before they are listed (`npx tsx scripts/humanities-bench/run.ts`).
   - Spread the three issues evenly (citizenship and governance · living in a diverse society ·
     being part of a globalised world).
2. **A skill picture per student.** From `humanities_runs`: for each skill, how many answered
   and the usual level. One card on Humanities Home ("Inference: steady at Level 3 · Reliability:
   Level 1–2, practise this"). No new marking.
3. **An example bank for structured response.** Short, checked examples per issue that a student
   can learn and use in "Explain two ways" / "Do you agree?". Our own wording. A page under
   `/app/humanities`.
4. **A timed paper.** 1 h 45, exam shape: one case study (35) + one structured-response set (15).
   Needs step 1 done. Still a level per question, never a mark out of 50 (SPEC §5) — unless
   Adrian says otherwise; ask him once, when it is built.
5. **Photo hand-in.** Handwritten answers. Rides on the handwriting reader (see "Other work
   running" below) and the essay marker's photo path. Last.

### B. Geography

Point-marked, so closer to science marking than to the level reader (SPEC §3, H3).
- A points scheme per question; the 9-mark question uses SEAB's published level table.
- Figures: maps, graphs, photographs — check the figure library before hand-writing SVG.
- Geography can give a real mark, because it is point-marked. Confirm with Adrian before the
  page shows one.
- Own questions; the 367 banked rows are the guide.
- Its own bench (seeded answers by points; consistency; truth-free), like `SPEC-SCIENCE-BENCH.md`.

### C. History essays

On the essay marker (`ai/essay-marker.js`, `src/lib/essay-submit.ts`). Needs the History level
tables as our own rubric (`data/rubrics/`), own essay questions on the starred topics, and a bench.

### D. Practice by skill

"Give me five reliability questions." The skills are tagged already (`skills.ts`); it needs the
bigger set from A1. A picker on Humanities Home that serves questions of one skill across sets,
weakest skill first (from A2).

## Rules that bind every step

- Switch stays closed. Do not open `HUMANITIES_OPEN_TO_STUDENTS`. Adrian wants to read the hedge
  lines on the page first (SPEC §"Open before Humanities opens").
- No school or national question is served to a student. Ever.
- The app never names Adrian or a model; no disclaimers; readability rule (CLAUDE.md).
- Bulk writing (30 new sets + seeded answers) is a batch: `docs/FANOUT.md`. Agents report once.
  The plan's weekly meter was at 70% on 7 Oct — say what a batch will cost before starting it.
- Each new student-facing surface: a `timed()` check in `/api/health-check`, a row in
  `docs/APP-MAP.md`, and tests beside any pure function.
- Commit + push `dev` at the end of each turn that changed code. Promote only on Adrian's word.

## Still needed from Adrian

- Real marked scripts (Social Studies first), if he can get any — the bench so far is our own
  seeded answers only.
- The four decisions in `docs/humanities/social-studies-level-schemes.md` are still his to answer.

## Other work running (do not touch from this session)

- The handwriting reader is being trained on a rented machine (7 Oct 2026). Step A5 waits on it.
- The Fly worker runs twins on 3 lanes. Nothing in this build needs the worker.
