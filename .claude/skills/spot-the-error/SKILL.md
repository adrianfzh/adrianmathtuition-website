---
name: spot-the-error
description: Turn REAL mistakes from marked papers into 🔍 "spot the mistake" cards (autopsy learning units) — harvest anonymous briefs, RE-WRITE each one with new numbers and a new setting but the SAME mistake, have a fresh agent re-check the maths, and save them as WAITING cards for Adrian to approve on /admin/spot-error. Also takes a hand-made "wrong maths in the real world" card. Trigger on "spot the error cards", "make more spot-the-mistake cards", "harvest mistakes", "spot the error from real mistakes", "add a real-world spot the error". Plan-billed: the session writes the cards itself, no paid API.
---

# Spot the error — from real marked mistakes

Read [`SPEC-SPOT-ERROR.md`](../../../SPEC-SPOT-ERROR.md) first. Privacy is the design: these are
other students' mistakes.

## Red lines
- Never open the page photos, and never read `student_id`, `student_name`, `student_label`,
  `student_note` or a line's `student_note`. The harvester already drops them — do not add them back.
- Never copy. Every card is **re-written**: new numbers, new names/setting, new wording; only the
  *mistake* is kept. `insert-drafts.mts` refuses a copied line, a reused distinctive number or seven
  copied words in a row — if it refuses, re-write more, never loosen the check to get one through.
- Never approve. Cards are saved as `pending`; Adrian approves each on `/admin/spot-error`.
- No person in the text ("a student wrote", "your classmate") and never "Adrian". Say "this working".
- Briefs hold re-typed working: keep them in the scratchpad, never in the repo.

## Steps
1. **Harvest** (most common mistake kinds first, spread across topics; keys already used are skipped):
   `npx tsx scripts/spot-error/harvest.mts --out <scratchpad>/briefs.json --limit 12 [--kind sign]`
2. **Pick** the briefs that make a clean card: one clear wrong line, a question that reads without a
   diagram, a level that is in `topic_spine` (S1, S2, EM, AM — JC has no spine yet, skip JC).
3. **Re-write** each (Opus — this session or Opus subagents) into a `SpotDraft` (`src/lib/spot-error.ts`):
   `{subject, topic, title, payload:{origin:'spot-error', source:'marked', error_kind, key:<brief key>,
   problem_md, working[], wrong_line, why_md, fix_md}}`. `topic` must be a `topic_spine` topic.
   House readability: one step a line; `why_md` says what went wrong in short plain words first;
   `fix_md` ends with a bold **Answer:**. Later lines may follow from the wrong one only if `why_md`
   says so ("Lines 4 and 5 only follow from that slip").
4. **Compute** every number in python before writing it.
5. **Blind check** — a fresh Opus agent gets only the drafts file and re-solves each question, confirms
   the marked line is the first and only real error and the fix is right (FANOUT §9a: never a small
   model for this). Fix or drop anything it fails.
6. **Dry run, then save**:
   `npx tsx scripts/spot-error/insert-drafts.mts --drafts <drafts.json> --briefs <briefs.json>` then
   add `--apply`.
7. Tell Adrian how many are waiting and where: **/admin/spot-error** (his admin login).

## Real-world cards
Same shape with `source:'real-world'`, `key:'rw-<slug>'`, topic `EM / Math In Real World Context`
(or the matching topic), and no brief. Describe the source plainly ("A video says: …"); no channel,
person or brand names.
