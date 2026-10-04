# Marking calibration — one method for every subject and every teacher

**Status:** written 17 Sep 2026 from Adrian's decision the same day, consolidating what
was spread over `SPEC-TUTOR-TOOLS.md` §2.1, `SPEC-ESSAY-MARKING.md` §Calibration,
`SPEC-SCIENCE-MARKING.md` §Calibration protocol and `docs/MARKING.md` §/admin/calibration.
Those places now point here. Plain words first; the code word follows in brackets.

## 1. What calibration is, in one paragraph

Calibration is how we know the computer's marking can be trusted. A human marks a set of
papers; the computer marks the same papers without seeing the human's marks; we compare,
question by question. Adrian's own marking is the standard for his students and stays the
default for everyone. A tutor who buys the marking gets **their own** calibration, kept
apart from Adrian's — his standard is never mixed with a third party's (Adrian, 17 Sep
2026). The record of every comparison is one row per script in Supabase
`calibration_results`, read by `/admin/calibration`.

## 2. Adrian's two phases (decided 17 Sep 2026)

> "Just have tutors send in his/her marked scripts (give a suitable number), then we
> calibrate according to that. For subsequent markings, allow tutors to annotate, then
> the marker calibrates by reading the annotations and what the tutor corrected from the
> marker's marking. That's all."

**Phase 1 — send in marked scripts (measure, and first learning).**
The tutor scans papers they have already marked by hand: **ten per subject** (the same
minimum Adrian uses for himself; fewer is a preview, not a gate). Nothing is typed.

1. **The computer reads the tutor's marks off the scan.** Teachers circle the mark they
   gave at the foot of each question, in red; the reader takes those circled numbers.
   Where a teacher writes one number per part, it takes each part. (Proved on 17 Sep
   2026 on CHIJ St Joseph AM prelim scripts: every circled total was legible.)
2. **The sum check.** The numbers must add up to the paper's total (the bank's
   allocation for a known paper, the cover total otherwise). A page corner, a smudge or
   a misread shows up as a wrong sum and is fixed before anything is treated as truth —
   three hidden marks on one script were recovered this way because the rest added to 81.
3. **Where the marks went inside a question.** A circled "5/7" does not say which part
   lost 2. The computer works it out: it has already read the student's working part by
   part and knows where the errors are, and it can also see the teacher's own ticks and
   crosses on the page. It allocates the lost marks to the parts its reading and the
   teacher's ink agree on. When they disagree, or the ink is ambiguous, the row keeps
   only the question total and flags the parts as "unallocated" — a measure, not a guess.
4. **The computer marks the same scripts blind** (`scripts/eval-mark-model.js --truth
   --save`), one `calibration_results` row per script, per question, with the
   `rules_version` stamp of the rules in force.
5. **The tab** (`/admin/calibration`, or the Calibration tab on a tutor's desk) shows
   agreement per question and per script, the gate, and where the computer is stricter
   or kinder than the tutor.

**Phase 2 — annotate from then on (learning the style).**
Once the computer marks for the tutor, the tutor corrects it the way they mark by hand:
on the computer's marked copy they cross out a tick, change a mark, write "no units,
−1" (Preview on an iPad, any PDF annotator, or the ✏️ Annotate overlay), and hand it
back — or Agree / Override on the desk. The pages are read WITH the original marking as
context, so only what changed is read: `{part, original mark, tutor's mark, what they
wrote}`. A one-screen summary ("you changed 7 of 33 parts") is confirmed by the tutor
before it becomes truth — the checkpoint. Each confirmed correction adds a
`calibration_results` row **and a reason**.

The reasons are the point. Recurring reasons ("no marks for a bare answer", "units
every time", "method mark even when the arithmetic slips") become candidate rules in
the tutor's **marking profile**, shown as a list the tutor approves — never applied
silently. The profile is read by the marker's prompt for that tutor's students only.
That is what turns "measured" into "marks like me". Today overrides are a record, not
a dial; the profile is the dial, and it is the one piece still to build.

**Status, 5 Oct 2026 — the loop started for Adrian (Adrian: "do learn from your corrections
loop").** Every mark, note and verdict he changes through the desk or ✏️ Annotate is now a row in
`marking_corrections` (before → after, his reason and kind, `corrected_by` + `org_id`), and the
bot's daily `/marking-learn` groups them and turns a cause that repeats on two papers into a
proposal he ships with one word (docs/MARKING.md §🎓). That is the "reasons → candidate rules →
the tutor approves" half, with the marker's shared rules as the dial for now. Still to build:
reading a hand-annotated copy (his ink without a record edit, an attached amended PDF), the
confirm screen, and a per-tutor profile the prompt reads for that tutor's students only — the
rows are already keyed for it.

**Decided 5 Oct 2026 — how this works once other tutors have accounts** (Adrian, after the
corrections loop was built: *"so we need to build tutor accounts? … each tutor's fixes kept as
their own marking rules, not changes to the shared marker; the messages going to the tutor
instead of you."*):
- **Tutor accounts and orgs come first.** Every `marking_corrections` row already carries
  `corrected_by` + `org_id` (today always Adrian and the tuition business).
- **A tutor's repeated corrections become rules in THAT tutor's marking profile**, read by the
  marker only for that tutor's students. They are never a code or prompt change to the shared
  marker. Adrian's own loop (`/marking-learn`) keeps proposing shared-marker fixes, and only he
  ships those.
- **The proposal messages and the Ship / Change / Drop go to the tutor, in the tutor app** — not
  to Adrian's Telegram.
- **Still missing for tutors:** reading a tutor's freehand ink and an attached hand-marked copy
  (phase 2 above), the confirm screen, and correction rows visible only inside their own org.
- **Why:** "the marking learns your way of marking" is the tutor product's selling point, and one
  tutor's habits must never change another tutor's (or Adrian's) marking. When building this,
  apply the company reminders (data belongs to the company from first sign-up, every row carries
  `org_id`; credits) — `SPEC-COMPANY.md` §14.5 and §7.1.

### When there are no circled marks (Adrian, 17 Sep 2026: "what if there are no circled marks?")

Teachers mark in different habits. The reader takes the richest thing on the page and
says which rung it used, so a weaker script counts for less, never for more:

1. **A number per part** ("(a) 2, (b) 3") — the best case; no allocation needed.
2. **A circled number per question** — the common case; parts allocated as above.
3. **Ticks and crosses only, no numbers** — the reader counts the ticks against the
   paper's marking allocation (the bank's, or the attached scheme): one tick on a line
   is the mark that line carries, a cross is zero for that part. This gives a mark per
   part directly. The sum check still applies: if the ticks add to more than the
   paper's total, the script is flagged for the tutor to look at.
4. **Only a score on the front page** — the row keeps the paper total and nothing per
   question. It counts towards the ±2 gate (which is per paper) but teaches nothing
   about parts.
5. **Nothing on the page** — the script is not a marked script; it is refused for
   Phase 1 with a one-line reason, and the tutor is pointed at Phase 2 (mark the
   computer's copy instead).

Every row records its rung, and the tab shows how many of the ten scripts were read at
rungs 1–3. A gate passed only on rung-4 scripts is shown as "paper totals only".

## 3. The gate — when the marking is switched on for a teacher

**The pass mark is the same for everyone: within ±2 marks of the teacher on 90 % of
papers, over at least ten papers**, and no confident award the teacher would not
forgive. Adrian's own gate, applied per teacher.

If a tutor keeps failing ±2, the tab shows two extra numbers before anyone concludes
the computer is wrong: **consistency** (the same script marked twice a day apart agrees
within 2) and **ranking** (the computer puts the tutor's papers in the same order, best
to worst, as the tutor did — rank correlation ≥ 0.7). A computer that is consistent and
ranks like the tutor but misses ±2 is calibrated to a tutor who marks inconsistently;
the profile can shift its leniency but no gate can beat the tutor's own noise. These
two are the essay marker's tests (`SPEC-ESSAY-MARKING.md`), where bands rather than
marks make ±2 meaningless; for marks they are the second look, not the first.

## 4. Two truths that never mix

- **Adrian's standard is the product's default.** Every student of his, and every tutor
  who has not calibrated yet, gets marking against his rows.
- **A tutor's rows are theirs.** Their `calibration_results`, their gate, their profile,
  their trend, keyed by their teacher id. Nothing a tutor sends in touches Adrian's rows,
  and nothing on Adrian's side reads a tutor's profile.

## 5. What exists and what is missing

| Piece | State |
|---|---|
| `calibration_results` rows, the ±2 gate and 10-paper minimum, the 8-week trend, per-question verdicts (`/admin/calibration`, `lib/calibration-stats.ts`) | built |
| The blind re-mark harness (`scripts/eval-mark-model.js --truth --save`), the `rules_version` stamp | built |
| Overrides as the truth channel after release (the desk), the science "Your teacher's mark" box, the essay harness (`scripts/essay-calibration/`) | built |
| Reading a marked copy the tutor annotated, with the original marking as context; the confirm screen | designed (§2.1 of the tutor spec), not built |
| **Reading circled marks off a hand-marked scan, with the sum check and the part allocation** (Phase 1 steps 1–3) | not built — the first thing to build when the tutor product starts |
| Every tutor correction (desk override, ✏️ Annotate marks + notes) recorded per tutor/org (`marking_corrections`), learned daily into proposals (`/marking-learn`) | **built 5 Oct 2026** for Adrian |
| The per-tutor **marking profile** read by the prompt (the dial) | not built |
| Per-tutor rows and gate on their own desk (the multi-tenant delta) | not built |

## 6. Build order when the tutor product starts

1. The circled-marks reader + sum check + part allocation, as a script beside the eval
   harness (`scripts/calibration/read-marked-scan.js`), tested on the CHIJ scripts.
2. The Calibration tab on a tutor's desk: upload ten marked scripts → rows → the gate.
3. The annotated-copy reader and its confirm screen (§2 Phase 2).
4. The marking profile: reasons → candidate rules → the tutor approves → the prompt reads
   them for that tutor's students.

## 7. What stays human

The teacher's marking is the truth; the computer only measures itself against it. A rule
enters a profile only when the tutor approves it. Adrian's standard is set and corrected
by Adrian alone.
