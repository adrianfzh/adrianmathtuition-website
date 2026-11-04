# 🔥 Challenge pilot — AI-written Advanced / Challenge maths questions (4 Nov 2026)

**Why.** Adrian, 4 Nov 2026, said "yes" to "Start a pilot of 20 AI-made Challenge questions?".
The bank had 12 Challenging A Math rows (7 from school papers) and 1 E Math row (a twin), so
the student 🔥 Challenge button (`src/app/app/practice/practice-flow.tsx`) had almost nothing behind it.

**The risks we guard against:** a wrong answer; an off-syllabus method; a question that is hard
for the wrong reason (ugly numbers, long algebra); a wrong difficulty label.

## How a pilot question is made
1. **Seed shape, not numbers.** Each question takes the SHAPE of a real hard question in the
   bank (the gate moves in the bot's `extraction/DIFFICULTY_SHAPES.md` §2–3), never its numbers.
2. **Made harder one allowed way, named per question** (`gen_meta.harder_by`): `combine` two
   topics · `unscaffold` (drop the hint part / "show that") · `reverse` the direction ·
   `unfamiliar` setting. Ugly numbers, long algebra, off-syllabus methods are forbidden.
3. **Gates before Adrian sees it:**
   - two blind solves by separate Opus agents that see only the question → both must match the
     key exactly (`gen_meta.gates.blind_1/blind_2`);
   - syllabus check: every method listed (`gen_meta.methods`), 4049 / 4052 only (no discriminant
     or calculus in E Math, no sum/product of roots in A Math);
   - the unsignposted key step in one sentence (`gen_meta.key_step`) — no sentence, not Challenge;
   - full solution in house style, a real-paper mark split, a proposed label.
4. **Saved hidden**: `ai_generated=true`, `verified=false` (the serve gate refuses it),
   `school='AdrianMath'`, `exam_type='Challenge'`, `gen_meta.kind='challenge-pilot'`,
   `gen_meta.note='pilot:challenge-2026-11'`, filed under the right sub-skills with
   `question_subgroups.source='challenge-pilot'`. Script: `scripts/challenge-pilot/insert.mjs`
   (idempotent on `gen_meta.pilot_item`). Plan-billed agents only, no API key.
5. **Adrian approves each one** on `/admin/generated` → 🔥 Challenge pilot tab
   (`?tab=pilot`): **Approve as Challenge** / **Approve as Advanced** sets `verified=true` and the
   tier; **Retire** throws it away.

## Round 1 (4 Nov 2026)
26 written (13 A Math, 13 E Math), 26/26 passed both blind solves, 6 dropped by the session as
not hard enough or repeating another, **20 saved hidden**: A Math 9 Challenge + 1 Advanced
(Nature of Roots / Quadratic Functions, Max–Min, Logarithms); E Math 5 Challenge + 5 Advanced
(Number Patterns, quadratics in context, Coordinate Geometry).
**All 20 APPROVED 4 Nov 2026** at the proposed labels — Adrian: *"approve all as you recommend"*
(18 set by the session, EM-12 and EM-13 by his own Approve taps a few minutes earlier;
`gen_meta.approved_at/approved_by/approved_label`). All 20 are in `practice_pool` for AM / EM
students: 14 behind 🔥 Challenge, 6 behind 🔥 Advanced. One fix after review: EM-12's solution
now opens with "Let D = (0, q)".

## Round 2 — fill every topic to 3 Challenge questions (4 Nov 2026)
Adrian, 4 Nov 2026, after round 1: *"Yes, next 20"* → *"just keep going until there are 3 questions for
each topics."* Read as: every AM / EM practice topic (≥ 20 questions served) gets at least 3
**Challenge** questions, counting ones waiting for his approval.
- Left out: **Geometrical Constructions** and **Algebra (Graph on Graph Paper)** (need drawing on paper) and
  EM **Matrices** — the session wrongly said Matrices is not in 4052 (from memory, unchecked). Adrian
  queried it the same evening; the repo treats it as current Sec 3 E Math (`docs/LOWER-SEC-SYLLABUS-SPLIT.md`),
  so Matrices still needed its 3 Challenge questions. Lesson: check a syllabus claim against the repo first.
  **Done the same evening** (Adrian: *"Yes, do Matrices"*): batches 20–21 → 4 saved hidden (B20-01, B20-06,
  B21-01 Challenge; B20-05 Advanced), **approved 4 Nov 2026** (Adrian: *"Approve all 4"*).
  Totals: 233 pilot questions, all approved and serving (round 1 20 + round 2 209 + Matrices 4). E Math matrices = build/interpret/multiply,
  no determinants, inverses or Aⁿ patterns.
- How: 19 batches (14 main + 5 top-up), each = one Opus writer (need + 1 drafts, top-ups need + 2/3) →
  two blind Opus solves → one Opus moderator per pair of batches (key agrees with both blinds, 4049/4052
  only, a genuine unsignposted gate, one reading, picks the best per topic). Briefs and every draft,
  blind answer and verdict: the session's scratchpad `pilot/` folder (`brief-r2.md`, `brief-mod.md`,
  `drafts-B*.json`, `review-B*.json`, `final-B*.json`).
- Result: **209 saved** (hidden, then **all approved 4 Nov 2026**, Adrian: *"Approve all 209"* — every
  pilot row is now verified and in `practice_pool`) (`gen_meta.pilot_item` `pilot-challenge-2026-11-B<n>-<k>`): 170 Challenge,
  39 Advanced (main-round moderators filled short topics with good Advanced ones; the top-ups took
  Challenge only). With these approved, every included topic has ≥ 3 Challenge.
- What the gates caught (none reached the saved set): wrong keys in a last part (both blinds caught
  them), keys that hang on an unstated boundary ("does k = −1 count?"), off-syllabus steps (∫ln x,
  integration by parts, the converse of angles in the same segment, remainder arguments in EM), two
  readings (degrees vs radians, chords on the same side?, a map distance not said to be horizontal),
  stems that never ask anything, and repeats of a saved key step.
- Writer glitches the save step repairs (`scripts/challenge-pilot/insert.mjs`): a part with no letter
  folds into the stem; a literal backslash-n becomes a line break; `\"` becomes `"`. Money is `\$`.
- Review copy for Adrian: `Challenge questions - 209 to check.pdf` (grouped by subject → topic; key step,
  answer, worked solution, mark scheme per question).

## After approval — how real results check the label
The nightly `/api/cron/math-practice-difficulty` (SPEC-TWINS §12) moves **Standard ↔ Advanced**
from students' first tries, so an approved **Advanced** pilot question gets confirmed or demoted
by itself. It **never touches a Challenging row** — so nothing yet demotes a Challenge question
that students find easy. That is a gap, not built (Adrian's call).
