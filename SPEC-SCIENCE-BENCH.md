# SPEC — The science marking bench (no marked scripts needed)

**Agreed 17 Sep 2026** (Adrian: "i don't have the scripts — that's why i am asking for
alternative ways … spec the seeded-script bench (1–6) and remind me"). Status: **spec only,
nothing built.** Companion to `SPEC-SCIENCE-MARKING.md` (the brains) and the doctrine's
revised "Standard" line in `CLAUDE.md` (17 Sep 2026): the ground truth for marking is the
scheme and examiner convention, and Adrian adjudicates disagreements rather than marking
papers to calibrate.

## The problem this solves

The science brains (physics, chemistry, biology) mark students' papers, and the only truth
that arrives is a whole-paper total the student types in a week later. There is no
teacher-marked script to compare against, and Adrian will not mark science papers himself.
The bench below measures marking quality anyway, six ways, none of which needs a human to
mark a script. Together they play the role the golden bench plays for math: a fixed set the
brains are re-run against whenever a science prompt or rule changes, and a stream of live
signals that tell Adrian which direction the marking drifts.

## What "good marking" means here

A part is marked well when the mark it gets is the mark the **scheme** gives for that answer,
applied the way an **examiner** applies it: a point mark is all or nothing; error carried
forward follows the scheme's own "ecf" marks; wording tolerance is the scheme's list of
accepted alternatives, not the marker's sympathy. This is the standard the whole bench
measures against. Nothing in it measures agreement with Adrian.

---

## 1. Seeded scripts — truth by construction (the core of the bench)

**Idea.** Take a paper whose scheme we hold. An author agent writes a student's answer to
every part with a **defect list chosen in advance**, so the correct mark is known before the
marker sees it. The marker's award is compared per part. This tests scheme application,
severity, wording tolerance and error carried forward directly, on unlimited scripts, at no
cost beyond the marking read.

**Inputs.**
- A paper with a scheme: any `paper_schemes` row with status ready (schemes students or
  Adrian attached), SEAB specimen papers with their published schemes, the Cambridge
  booklet papers already on file. Physics and chemistry first; biology once the scheme
  wording rules are in (SPEC-SCIENCE-MARKING §First numbers).
- A defect vocabulary, one code per kind, the same eight the red pen already names where
  they apply (`lib/error-kinds.ts`) plus the science-only ones:

  | code | the seeded defect | truth rule |
  |---|---|---|
  | `MISS_POINT` | an explain part hits scheme points 1, 3, 4 and not 2 | that point's mark withheld, others given |
  | `HALF_POINT` | a scheme point stated half-right ("energy is lost" for "kinetic energy is converted to heat") | 0 for that point, all or nothing |
  | `WRONG_WORD` | a near-synonym the scheme's accepted list does not include | 0 for that point |
  | `NO_UNIT` | final numerical answer without its unit | the scheme's unit rule (usually the A mark lost) |
  | `EARLY_ROUND` | rounding an intermediate to 2 s.f. so the final is off by more than the tolerance | A mark lost, M marks kept |
  | `SLIP_CARRY` | an arithmetic slip in (a) whose wrong value is used correctly in (b) | (a) loses its A mark; (b) full marks by ecf where the scheme allows |
  | `WRONG_FORMULA` | the wrong relation, worked correctly | M and A lost for that step |
  | `EXTRA_WRONG` | a correct answer followed by a contradicting statement | the scheme's "contradiction cancels" rule |
  | `BLANK` | part not attempted | 0, and the marker must say "not attempted", never guess |
  | `CLEAN` | fully correct | full marks |

- A **grade profile** per script so the bench covers the spread the booklets showed: A
  (mostly `CLEAN`, two or three defects), C (about a third of parts seeded), E (most parts
  seeded, several `BLANK`). The 10 Sep finding — weak scripts over-marked — lives at grade E.

**The author.** One agent per script, plan-billed in-session (the `gce-paper` method, never
the API for authoring), given the paper, the scheme and the defect plan. It writes the
answer text **and** a truth file in the harness's shape (`scripts/calibration-truth.example.json`)
with the expected mark per part and the defect code beside it. A second, blind agent (the
`qb-verifier` pattern) checks that each seeded answer actually carries its defect and nothing
else — an author who accidentally adds a second slip poisons the truth.

**Rendering.** The seeded answer is typeset onto the paper's own answer-space pages (the
`reproduce-exam-paper` page geometry), in a handwriting-style font, and rasterised. This is
NOT a vision test — the golden bench and the read step own that — so the pages are clean.
One variant per script may be rendered with the student's photo-taking habits (slight skew,
shadow) so a regression in the read step shows up as a bench-wide, not per-part, failure.

**Hand-in.** Each rendered script is an admin upload named
`BENCH · <subject> · <paper key> · <grade> · seed <n>`, tagged to the bench identity
(`portal-teste@example.com`'s account, never a real student), with the scheme attached when
the test is "scheme-grounded" and withheld when it is "rules-alone". Both modes are run for
physics and chemistry; biology runs scheme-grounded only.

**Scoring.** `scripts/eval-mark-model.js <runId> --truth <file> --save` on the bot, one
`calibration_results` row per script with `truth_source 'seeded'`, `truth_label 'seeded ·
<defect plan>'`, `per_question` carrying the defect code per part. The dashboard
(`/admin/calibration`) reads it like any row; a `?truth=seeded` filter keeps it apart from
the students' teacher totals.

**What the numbers mean.** Per defect code, across all scripts: the share of parts marked
exactly right. The two 10 Sep findings become two lines to watch — `HALF_POINT` (physics
gave a mark for eleven of them) and `WRONG_WORD` (biology accepted rejected wording). A rule
change to a brain is accepted when its target line improves and no other line worsens.

**Size.** Ten scripts per subject per grade profile (30 per subject) is a bench; it runs in
one evening on the Mac lane at roughly US$0.37 a script. Re-run in full after every science
prompt change; re-run the affected defect's scripts alone while iterating.

## 2. The scheme as its own judge (per-mark grounding)

**Idea.** Every mark the marker awards must name the scheme point it pays for. A second
pass — given the scheme and the student's answer but **not** the first marker's reasoning —
answers, per awarded mark: which scheme line is this? A mark it cannot ground is an
over-award candidate; a scheme line the student plainly hit that carries no mark is an
under-award candidate.

**Build.** The brains already emit per-part awards with a note; extend the science result
shape with `scheme_ref` per mark (the scheme line's id or text) when a scheme is present.
The judge is one Sonnet-class call per paper over the marker's awards + the scheme,
returning `{ungrounded:[…], missed:[…]}`. Runs on every scheme-grounded science marking,
stored in `result_json.scheme_audit`, and the count of ungrounded marks becomes a ⚠️
watch-out line in the release Telegram, the same channel as math's accuracy signals. Needs
no truth at all, and catches `HALF_POINT` by construction.

## 3. Blind double marking

**Idea.** Two independent reads of the same script, a different model for the second read so
the errors are less correlated, then a comparer lists the parts where the awards differ.
Disagreement is not truth; it is where truth is worth Adrian's minute.

**Build.** Behind `SCIENCE_DOUBLE_MARK=1` on Fly: after the primary marking (Mac lane), a
second marking of the same stored reads on the API lane with the other model family; the
comparer is pure (`lib/calibration.js`'s per-question diff already does this). Disagreeing
parts go to Adrian as one Telegram message per paper: question, both awards, both notes, and
two buttons — **A is right / B is right** — that write a `calibration_results` row with
`truth_source 'adjudicated'`. His answer is truth for that part and joins the bench. Cost:
one extra marking per science paper; the daily slot is the brake. Sample rather than every
paper once the disagreement rate is known (start at 100%, drop to one in three).

## 4. Truth-free consistency tests

Three checks that prove a marker wrong without knowing the right answer, run on the bench
scripts from §1 (so they cost nothing extra) and, sampled, on live papers:

- **Repeat.** Mark the same script twice. Any part whose award differs is an instability;
  the bench reports the share of unstable parts per brain. Target: under 3%.
- **Swap.** Take one part's answer text from script A and place it into script B (same
  paper, same part). Its mark must not change with its neighbours. A change is an anchoring
  fault (the marker is grading the student, not the answer).
- **Monotone degradation.** From one `CLEAN` script, remove one scheme point at a time and
  re-mark. The total must fall by exactly that point's mark each step and never rise. The
  first step where it does not is the rule to look at.

The grade-order check from the booklets (A > C > E) is the same test at paper scale and
comes free from §1's grade profiles.

## 5. Students' teacher totals (already built — the drift alarm)

`POST /api/portal/science-truth` → one `calibration_results` row per paper, whole-paper
|Δ|. Cannot name the question; over months it names the direction per subject. The bench
adds nothing here except a reading: when the live delta drifts while the seeded bench holds,
the gap is in the read step or in school-specific wording, not in the rules.

## 6. Scheme-later re-marks

When a student attaches a school scheme for a paper other students already handed in
rules-alone, the extraction-inbox tick already re-marks recent runs marked without that
paper. Extend it: **also** log the before/after per part as a `calibration_results` row with
`truth_source 'scheme-later'` (the scheme-grounded marking as the truth for the rules-alone
one). This is a free, real-handwriting measurement of how far rules-alone marking sits from
the school's own paper, per question type — the one number §1 cannot give because its
scripts are typeset.

---

## What Adrian does (and does not)

- Never marks a script for the bench.
- Answers the §3 adjudication buttons when they arrive: about a minute per paper, only on
  disagreeing parts.
- Reads the bench table after a prompt change (one screen on `/admin/calibration`).
- Notices when the scheme convention itself is wrong for Singapore (the doctrine's
  "Novelty" item) — the bench surfaces it as a defect line that will not close.

## How to run §1

The step-by-step runbook is the committed skill `.claude/skills/science-bench/SKILL.md`
(`/science-bench`): where every piece lives, the secrets needed, the exact API calls, the
author + blind-verifier agents, scoring, and the acceptance rule. It travels with the repo, so
a session on any account on a Mac with both repos can run it.

## Build order

1. **§1 for physics, rules-alone and scheme-grounded**, 30 scripts, truth files, the
   `truth_source 'seeded'` rows, the dashboard filter. Re-score the two 10 Sep rule fixes
   against it. One evening.
2. **§4 on those scripts** — repeat + monotone degradation are scripts over the harness;
   swap needs the author to emit parts separately (design §1's author for it from the start).
3. **§2** — `scheme_ref` per mark + the audit call + the watch-out line.
4. **§1 for chemistry**, then biology scheme-grounded once the wording rule lands.
5. **§3** behind the flag with the adjudication buttons.
6. **§6** — the logging extension on the existing re-mark path.

## Not this

- Not a vision bench: handwriting, skew, missing pages belong to the read step and the
  golden bench (`golden-capture.cjs` / `golden-pen.cjs`).
- Not a calibration against Adrian: no row in this bench carries his marks except the §3
  adjudications, which are per-part rulings on a disagreement.
- Not a student-facing feature: bench uploads never appear in any student's app (bench
  identity only) and never spend a real student's daily slot.
