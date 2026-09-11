# Picking questions by skill — the one rule for kinds 2, 3 and 4

> Agreed 12 Sep 2026 (Adrian: "i want kinds 2 and 4 to cover skills the way
> kind 1 does, can kind 3 do that as well?"). Kind 1 (the worked-examples sheet)
> already covers a topic skill by skill; this is the same backbone for the
> one-tap kinds, written once and implemented twice — `src/lib/skill-pick.ts`
> (kind 3, the instant sheet) and
> `.claude/skills/copy-revision-worksheet-with-different-practice/skill_pick.py`
> (kinds 2 and 4, built on the Mac). Both must pass the SAME cases in
> `src/lib/skill-pick.fixtures.json`; a change to the rule is a change to that
> file first.

## Inputs

- **skills** — the topic's skills in syllabus order: the bank's `subgroups`
  rows for that level and topic (`order_index`). Sec 3 questions use the AM /
  EM lists, JC1/JC2 use the JC list.
- **pool** — the servable questions for the topic (the caller's own gates:
  not deleted, not legacy, not national, figure stored, answer on file, AI only
  when verified). Each row carries: `marks`, the skill ids it is filed under
  (`question_subgroups`, primary or not), and optionally `tier` (0 verified
  human · 1 human · 2 verified AI · 3 AI), `pref` (0 the requested level, 1 a
  top-up level), `parts`, `school`.
- **count**, a **seed** (kind 3: the kiosk's daily seed; kinds 2/4: `--seed`),
  and optional **weights** per skill for the second round.

## The rule

1. **Round 1 — one per skill, in syllabus order.** For each skill, from the
   rows filed under it and not yet used, take the PLAINEST: a human solution
   before an AI one (`tier` 0/1 before 2/3), then the requested level before a
   top-up (`pref`), then FEWEST MARKS, then fewest parts, then a verified
   solution before an unverified one, then a school not yet on the sheet, then
   the seed hash. Marks decide plainness; verification only breaks ties — a
   verified 9-marker must not beat a plain 3-marker (Circles dry run, 12 Sep). A skill with no rows is reported
   `empty`, never filled from another skill. If `count` is below the number of
   skills, only the first `count` skills are visited and the rest are reported
   `skipped` — the card says which.
2. **Round 2 and on — the twist.** While there is room: skills ordered by
   weight (desc) then syllabus order; from each, the row that adds most — human
   before AI, requested level first, then MOST marks, most parts, verified
   first, a new school, the hash.
   Rounds repeat until the count is met or nothing is left.
3. **A question is used once.** A two-skill question goes to the first skill
   that reaches it.
4. **Sheet order** — by skill in syllabus order, then marks ascending.
5. **Unfiled pool** — if no row carries any of the topic's skills, the rule
   picks nothing and says `unfiled`; the caller falls back to its old draw.
   Rows without a tag are otherwise never picked (the nightly filing task is
   what closes that gap; filing is 96–99 % at AM/EM, 60–87 % elsewhere).

The tie-break hash is FNV-1a (32-bit) over `seed|id`, the same bytes in both
languages, so the two implementations agree row for row.

## What the rule does NOT do

No difficulty label, no marks bands (retired 12 Sep 2026), no per-student
freshness yet. `weights` is the hook for "second questions go to the skills
students lose marks on" — nothing feeds it today.
