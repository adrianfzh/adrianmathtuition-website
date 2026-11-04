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
(Number Patterns, quadratics in context, Coordinate Geometry). Waiting for Adrian's review.

## After approval — how real results check the label
The nightly `/api/cron/math-practice-difficulty` (SPEC-TWINS §12) moves **Standard ↔ Advanced**
from students' first tries, so an approved **Advanced** pilot question gets confirmed or demoted
by itself. It **never touches a Challenging row** — so nothing yet demotes a Challenge question
that students find easy. That is a gap, not built (Adrian's call).
