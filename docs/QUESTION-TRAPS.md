# 🪤 Common traps — the questions most students lose marks on (4 Nov 2026)

Adrian, 4 Nov 2026, after the nightly level check learnt to move Challenge questions: *"what about
for other difficulties? and it should also be able to classify a question that most students make
mistakes"*. Two answers, built the same night:

1. **Levels move both ways, every level** — `SPEC-TWINS.md` §12 (maths) and `lib/practice-difficulty.ts`
   (maths + science): one step at a time, a margin between the up and down lines, ≥ 20 first tries,
   at most one move per 28 days.
2. **A separate "common trap" label** — this doc.

## The label
- **A trap**: at least 5 students had a first go at the question, and MORE than half lost marks.
- **The named mistake**: the marker's error kind (`lib/error-kinds.ts`) shared by at least half of the
  students who lost marks, and the part where it happened. "incomplete" is never named (stopping
  short is not a trap in the maths). Otherwise it is a trap with no single mistake.
- **Separate from the level.** A Core question can be a trap; the label never moves a level.
- **Internal only** (Adrian: don't add public-facing text that reveals how the data is used). If a
  student surface ever uses it, it says something neutral ("Watch out in (b)") and never how it was found.

## Where the counts come from
`question_trap_stats(p_exclude)` (maths project, `migrations/question_traps.sql`) aggregates in SQL —
nothing is downloaded:
- **marked papers**: `paper_marking_runs` with a trusted paper match, each result tied to a bank row
  by the paper key (`gce 2023 em p1`; H2 papers map to JC levels) + question number. A key + number
  that points at two bank rows is skipped (two bank rows shared GCE 2023 EM P2 Q9). Superseded runs and
  Adrian's own test hand-ins are left out.
- **maths practice**: `student_attempts` (`portal` / `portal-fix`); lost = score under full marks.
- One row per student per question — their earliest.

`lib/question-traps.ts` (`classifyTrap`, pure/tested) turns the counts into the label; the nightly
`/api/cron/math-practice-difficulty` refills `question_traps` and stamps the count in its job line.

## First fill (4 Nov 2026, real data)
427 bank questions have student marks; **60 are common traps, 41 with the mistake named**
(concept 31, misread 3, sign 3, rounding 2, careless 1, arithmetic 1; 19 with no single mistake).
53 of the 60 are labelled **Core** — the label finds what the level misses. Examples:
GCE 2022 EM P2 Q9 Sets (7 of 7 lost marks, 5 the same way: concept, in (b)(i));
GCE 2024 AM P2 Q9 Trig identities (6 of 6, 5 concept in (c));
GCE 2022 EM P2 Q1 linear equations (6 of 7, 3 rounding in (c)).
Today the evidence is almost all marked papers (≤ 10 students a question); practice adds more as it is used.

## Where it could be used (suggestions, not built — Adrian decides)
- **Adrian's list** — BUILT: `/admin/traps` (filter by level; the line says how many lost marks and the shared mistake).
- **Stretch set** — pick traps first: they are what students actually get wrong.
- **Spot the error** — a trap with a named mistake is a ready brief for a card (the same mistake, new numbers).
- **A "watch out" note before the question** in practice — neutral wording, named part only.
- **Lesson planning** — the week's new traps beside "Where students are stuck".
