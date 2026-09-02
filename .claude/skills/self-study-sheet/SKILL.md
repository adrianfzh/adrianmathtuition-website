---
name: self-study-sheet
description: Turn a student's MARKED PAPER into a self-study sheet they can learn from — diagnose what they actually got wrong, propose one wave of skills for Adrian's approval, author the DOCX in his house style with verified worked examples, and file it into Dropbox for him to vet and edit. Trigger on "self-study sheet for <student>", "teaching round for <student>", "notes from <student>'s marked paper", "what should <student> work on", or after a paper is marked and Adrian asks what to send them. NOT for topic-driven notes with no marked paper behind them — that is create-teaching-notes.
---

# Self-study sheet — from one marked paper to work in their hands

You are running steps 3–6 of the teaching round
([`SPEC-TEACHING-CYCLE.md`](../../../SPEC-TEACHING-CYCLE.md) — read it): the
marking is already vetted, and your job is **diagnose → propose the wave →
author the sheet → file it for Adrian to amend**. Adrian releases the marked
copy and the sheet together afterwards; you never send anything to a student.

## Read first (binding, in this order)

1. `~/Desktop/AdrianMath/teaching_style/FEEDBACK.md` — every entry is a rule
   Adrian already corrected once. The 30 Aug entries decide the whole layout:
   teaching lives inside the annotated example, equation steps align at the
   `=`, one idea per line.
2. `~/Desktop/AdrianMath/.claude/skills/create-teaching-notes/STYLE.md` — the
   house DOCX style (fonts, boxes, colour semantics, orange answers).
3. The `create-teaching-notes` skill itself — it owns the rendering pipeline
   (python-docx / pandoc, figures, verification harness). Invoke it; this skill
   supplies the brief, that one supplies the machinery.

## Step 1 — find the paper

Airtable `Students` (field `Student Name`) → the `rec…` id. Then the latest
marked run in Supabase (math project `nempslbewxtlikfzachi`):

```sql
select id, paper_name, total_awarded, total_max, created_at, released_at
from paper_marking_runs
where student_id = '<rec…>' and result_json->'results' is not null
order by created_at desc limit 5;
```

The newest run is the sheet's SUBJECT — the paper Adrian releases alongside it,
and the one whose questions the student will recognise. If several re-marks of the
same paper exist, use the **best/newest**; earlier ones are superseded.

That run is the ONLY evidence the sheet diagnoses from (Adrian, 2 Sep 2026:
*"diagnosis should be single-paper"* — see Step 2). Do not pull the student's
other marked papers into the diagnosis.

## Step 2 — extract the evidence (never topic labels)

The grounding rule exists because it was broken twice on the first run: the
marker's `topic_detected` said "Exponentials and logarithms" for a
change-of-base log equation, and "Circle theorems" for an A-Math plane-geometry
**proof**. Build from the QUESTION PROMPTS and the student's own working:

```sql
select r->>'question_number' as q,
       r->'marking_output'->'question'->>'prompt'   as prompt,
       r->'marking'->>'total_awarded' as awarded,
       r->'marking'->>'total_max'     as max,
       (select jsonb_agg(jsonb_build_object(
          'label', p->>'label', 'aw', p->'awarded', 'mx', p->'max',
          'na', p->'not_attempted', 'err', p->>'error_summary',
          'note', p->>'study_note'))
        from jsonb_array_elements(r->'marking'->'parts') p) as parts
from paper_marking_runs, jsonb_array_elements(result_json->'results') r
where id = '<run-id>'
  and (r->'marking'->>'total_awarded')::numeric < (r->'marking'->>'total_max')::numeric
order by (regexp_match(r->>'question_number','\d+'))[1]::int;
```

Classify each loss: **blank** (nothing written / abandoned at the setup —
needs first-move teaching), **procedure** (a named rule misapplied), **concept**
(wrong method or strategy), **discipline** (units, signs, conclusions,
rounding, "show that" endpoints). The mix decides what the sheet teaches: a
paper losing 29 marks to blanks and 12 to procedure is a first-moves sheet,
not a rules sheet.

### One paper — the one in their hand (Adrian, 2 Sep 2026 — binding)

**Diagnose from THIS run only.** Adrian, 2 Sep 2026: *"diagnosis should be
single-paper."* This reverses the 1 Sep rule that pulled every marked paper the
student had and let the newest one veto. That rule came from Eva's five papers,
where blanks and "explain" answers were invisible on her newest script alone; it
was retired the next day because the sheet is a response to the paper the student
just got back, and dragging older papers in produced sheets that talked about
"three of your four papers" and taught things the script in their hand did not
show. Progress ACROSS papers is the portal's job — tracked over time, weighted
towards the latest work — not the sheet's. (The all-papers SQL lives in git
history, commit 3243f89a, if Adrian ever asks for the history.)

Within the one paper, the ranking rules still hold:

- **Rank by damage.** Marks lost to the skill, across every question it touched.
- **Recurrence outranks size — within the paper.** The same slip in Q9 and Q16
  is a hole they carry into the exam; a single 6-mark loss may be one hard
  question. When you catch yourself putting something in Optional, check how
  many QUESTIONS on this paper show it before you do.
- **Behaviours count as skills.** Two things that are not topics at all:
  - **Leaving parts blank.** If a student abandons parts, that is the biggest
    thing you can teach them, whatever the topic — a first-move sheet ("what do
    you write when you don't know how to finish") beats another rules sheet.
  - **Answering "explain" by restating the claim.** Reaching the right
    conclusion without earning it. Cheap to fix, and it costs marks in every
    paper they will ever sit.

**COUNT THE SLIPS AND THE TRANSFER ERRORS TOO** (Adrian, 1 Sep 2026). An
arithmetic slip is not a skill, so it earns no practice (triage ② — show, don't
drill). But it still costs marks, and a student who drops six marks to slips has
a real, teachable problem that no topic list will ever name. So COUNT them and
report the total, even though none of them becomes a section:

- **arithmetic slips** — a sign lost, a term dropped, $-48 \div 8$ written as $+6$
- **transfer errors** — the working says one thing and the answer line another;
  a value copied wrongly from one part into the next; a correct value rounded
  away at the end. The cheapest category of mark there is to win back.

Report them as a line in the wave — *"and 7 marks to slips and answer-line
transfers"* — so Adrian can see the size of it and decide whether it deserves a
habit sheet of its own.

Say in the wave WHICH QUESTIONS each skill came from and how many marks — Adrian
is choosing what to teach, and "Q11 and Q20, 5 marks" is the fact that decides it.

**On the SHEET itself, never name another paper** (Adrian, 2 Sep 2026: *"no need
to mention exactly which paper she made the mistakes"*). No "Q23(b) at Zhonghua",
no "in three of your four papers". The student's sheet talks about the paper in
their hand — "Q14" and "on this paper" are fine.

### What earns practice — Adrian's triage (31 Aug 2026, binding)

**Practice is for what the student cannot yet do, not for what they got wrong.**
The first sheets got this backwards: Sophie's opened with *"Every skill on this
sheet comes from a question where your method was already right — the marks went
in the last line"*, and then set practice on all of it. A student whose method
was already right does not need to do it again. They need to be shown the line
and left alone.

Sort every loss into one of three, and the sort decides the sheet:

**① Teach and practise — conceptual and method gaps.** The student could not
have got there. Full Example → Practice treatment, and these come FIRST.
*Sophie's shoelace area: the wrong idea of how an area is obtained. Her weather
balloon: a differentiation-technique gap.*

**② Show, do not drill — arithmetic and careless slips.** The method was sound
and one line went wrong. Point at the line, say what happened in a sentence, and
move on. **No practice question.** A slip is not a skill.
*Dividing (−56 + 14√2) by −14 and flipping only the first sign. Dividing by an
extra 60 when the rate was already per second. −48 ÷ 8 written as +6.*

**③ Optional practice — borderline, worth awareness.** Real but slight; the
student should know it exists and may drill it if they have time. Put these in a
clearly marked **Optional** section at the END, never mixed into the core.
*The trigonometry slips on this paper.*

Two consequences worth stating out loud:

- **Target the missing SKILL, not the question's topic.** The weather balloon
  sits in a rate-of-change question, but the marks went on differentiating
  `2.4V⁻¹` — carrying a constant multiplier through a derivative. So the practice
  is differentiation technique, not more rates. Ask "what could they not do?",
  never "what chapter was this in?".
- **Rank by damage, not by order in the paper.** A major conceptual error
  outranks a topic that only produced slips: the area question comes before the
  trigonometry, every time.

**Their time is the constraint.** A sheet that drills everything they got wrong
is a sheet that does not get done. **Four skills in ① is the target** — Adrian
cut a six-section sheet to four plus an optional one, losing a third of the
paragraphs, and that is the shape he sends. The rest is ② in one line each,
③ at the back, or shelved.

Four more rules from that edit (full account in `teaching_style/FEEDBACK.md`):

- **An optional TOPIC is optional whole.** Told the trigonometry could be
  optional, the sheet made one trig ITEM optional and kept two trig sections as
  core. He moved the identity to Optional and cut the other. If a topic is
  optional, none of it is core.
- **Merge skills that share one lesson.** Two of his four sections are joins —
  rate-of-change with the constant-factor rule; squaring-two-cases with the
  shoelace method. One worked example can carry two skills; not every diagnosed
  skill earns its own Example/Practice pair.
- **"Already taught last wave" is not a reason to shelve.** The sheet shelved
  integration coefficients because the previous wave covered them; he restored
  them as section 1. Still wrong means still taught.
- **Individual practice ITEMS can be marked "(Optional)"**, not only whole
  sections — his Practice 4 marks item 3 alone.

Section headings are **unnumbered Title Case skill labels** (Adrian, 2 Sep 2026
— the number went on all four sheets he amended): "Master Finding Area Using
Integration", "Finding Coefficient of A Specific Term In An Expansion". Not the
teasing one-liner, not a filing label with a "—" explainer. An Example may carry
the skill in its own heading, followed by ONE blue key-move line ("Always Form
Chain Rule") echoed in blue as the `←` where it fires.

## Step 3 — propose ONE wave, and STOP

Cluster into 6–8 teachable skills for a single sheet. Everything else is
**deferred with its evidence** (question, part scores, the annotated page URL).

Show Adrian the proposed wave and the shelf list, and **wait for his approval**.
Picking the wave is teaching judgment — the checkpoint is his.

Once he approves the split, record each deferred topic on the 🧺 **student
shelf** (built 2026-09-02 — this replaced the interim `/admin/my-todos` lines):
one `POST /api/admin/shelf` per topic with
`{ fromRun: { runId, questionNumber: "6(b)" }, topic }` — the API grabs the
prompt, part scores and annotated page from the run's own `result_json`, and
answers 409 if that question is already shelved. **Headless runs (the
sheet-worker) skip this step** and only report `shelved` in the completion
payload — no auto-shelving without Adrian's approval; he shelves in one tap
from `/admin/mark/triage` or `/admin/papers`.

**The completion payload also carries the diagnosis** (headless and in-session
alike — Adrian, 2 Sep 2026: *"the sheet's diagnosis should drive the cover, not
the cover the sheet"*). `result.diagnosis` is one entry per section of the sheet
you actually wrote, **in the sheet's order**, each
`{ title, marks, questions, why, tier }` — `title` the section heading verbatim,
`marks` lost to it on this paper, `questions` like `["Q11(a)","Q20"]`, `why` one
checkable sentence (TeX ok), `tier` = `teach` | `show` | `optional` (① ② ③ above).
The site stores it on the run (`result_json.diagnosis`) and rebuilds both marked
PDFs so page 1 follows your ranking instead of the keyword classifier's; the
exact curl is in `scripts/sheet-worker/WORKER_PROMPT.md` step 5.

## Step 4 — author the sheet

### Adrian's own trap for the skill — check, then usually move on

The diagnosis in Step 2 comes from the student's real script, which beats any
generic list — do NOT let a stored trap displace what she actually did. But the
teaching line under a heading states the GENERAL rule, and Adrian has often
already written that rule down:

```sql
-- The teaching-knowledge layer (2026-09-03): ONE accessor over pitfalls +
-- method_templates for every surface. Approved-only on both tables, strict
-- canonical-topic match, ranked by overlap with the context you pass.
SELECT teaching_knowledge(
  '<the student's level, e.g. S3_AM / EM_NA / JC2>',   -- folded to AM/EM/JC/S1/S2 inside
  ARRAY['<canonical topic>', '<canonical topic>'],
  '<the question text she got wrong — drives the ranking>',
  3,   -- methods: Adrian's method for the question type (the sheet's "Method recap" box)
  4,   -- pitfalls: his traps
  0    -- formulae
);
-- → jsonb { subject, methods:[{question_type, method, watch_out}], pitfalls:[{wrong_move, why_wrong, corrective_cue}], formulae:[] }
```

(Service-key callers only. Never query the two tables directly for a sheet —
the function is where the approved gate lives.)

Use one ONLY when it is the same slip the script shows, and then only for the
wording — `corrective_cue` is already in his voice, which is the whole reason to
look. A trap that does not match this student's error does not go on her sheet:
the sheet is about what she got wrong, not what students generally get wrong.
Expect to use none on most sheets.

### The reference sheet

`/Students/Khoo Ke Er Klaire/2026-08-30 klaire am tys 2021 p1/Practice Again.docx` (his amended copy; the worker's draft sits beside it as `Practice Again (worker original).docx`)
is the sheet Adrian says is closest to what he wants (31 Aug 2026, comparing it
against Kiara's and Sophie's from the same evening). Read it before authoring.
What makes it the reference — all of it reproducible, none of it accidental:

- **Headings are Title Case skill labels** — this bullet used to say the
  opposite and cite "Always Increasing / Always Positive Leading To The
  Discriminant Condition" as the label to avoid. On 2 Sep 2026 Adrian wrote
  that exact heading himself, and replaced "Make it ONE base before you do
  anything else" with "Solving Exponential Equations Using Logarithms". The
  teaching goes in the one blue key-move line under the heading, not in the
  heading.
- **Two examples where the skill has two faces.** Example 1a took `12ˣ = 7×4ˣ⁺¹`
  (same base by logs), 1b took `log₂x + log₄(x+3) = 3` (same base by change of
  base) — one skill, both faces, then one practice set covering both. Kiara got
  one example per skill throughout.
- **Two zones, not three** (revised 2 Sep 2026 — he deleted the "Read these
  once" zone from all four sheets he amended, because every line in it narrated
  the student's own slip). The skills with Example + Practice, then either a
  bold `(Optional)` line above the last section or a closing `Practice N –
  Miscellaneous Practice`. ② slips are NOT listed on the sheet: they are
  reported in the wave for Adrian, and at most one becomes an ordinary
  practice item.
- **Diagrams in the Example AND in the Practice.** Klaire's area section carried
  three figures — one in the worked example and one on each practice item.
  Kiara's sheet had none at all.
- **Density.** 107 fractions and 50 display equations in Klaire's, against 29
  and 34 in Kiara's, on comparable page counts. The difference is not padding:
  it is that Kiara's Example 1 solution is four paragraphs of bare algebra with
  no opening line in plain English, and Klaire's boxes all open with one
  ("You are given dV/dt and asked for dr/dt. Build the chain first, substitute
  second.") and close with a red danger line and a blue ✓ check.
- **One instruction paragraph** (revised 2 Sep 2026 — he cut the three lines to
  "Read through each **Example**. Then do the **Practice** under it on your
  own, before you look at the answers."), and the name as a faded-blue
  `For <Full Name>` subtitle, tight under the title.

### Adrian's own explanations — the captured style (2 Sep 2026, binding)

He rewrote two of Sophie's worked examples by hand and asked for the difference
to be followed on every surface. The full diff is in
`~/Desktop/AdrianMath/teaching_style/FEEDBACK.md` § "How Adrian explains";
the shape, in one breath:

- **Box opens with 2–3 grey italic principle lines** (general rule → the trick →
  applied to this question), then a blank line, then the working as
  **auto-numbered steps** that each say what you are doing.
- **The general rule sits inside the step in green bold square brackets**:
  `y = [the expression on the other side of the equal sign] is the graph you
  need to draw`.
- **Every algebraic move carries a grey `←` that names its TARGET**: `← divide by
  −2 to obtain x³ − 3x²`, `← add 2 to obtain x³ − 3x² + 2 (which is the graph
  drawn)`.
- **Colour = meaning, same in the principle line and the working**: blue
  `0432FF` the expression being matched; red `EE0000` the piece added/changed;
  green `00B050` the rule and the result it produces; bold+underline the BASE
  in a percentages chain; black bold `←` for a plain instruction.
- **Percentages**: conversion facts with the reason in brackets first, the unit
  declared in bold ("Let … in 2019 be 100 units"), one block per base opened
  with an underlined "From 2019 to 2020 → 2019 is the base (100%)", full-word
  equation lines ("exports in year 2020 = 100 × 1.12 = 112"), the formula in
  words before the numbers.
- **Headings name the skill as an action, in Title Case** — "Find the Required
  Line To Draw To Solve An Equation Graphically", "Mastering Percentages –
  Whether To Multiply or Add/Subtract". He replaced the one-line teasers.
- **Gone from the box**: the punchy italic opener, the red "on your paper you…"
  lines, and the Check line on those two examples. ONE red Common Error warning
  per box, not two.

**Four more sheets the same evening — Kiara, Klaire, Rainie, Chloe Zhang**
(diffed against the worker originals, 2 Sep 2026; full account in FEEDBACK.md
§ "Four sheets amended in one evening"). The four agree with each other; where
they contradict an older rule here, they win:

- **The Example IS the exam question**: quote its stem and constraints (a
  paraphrase that changes the domain is a bug), print `[n]` per part, bold the
  operative word (`**magnitude**`), the exam's own numbers at the exam's
  difficulty, the curve's equation written on the diagram.
- **Two skills that are (a)/(b) of one exam question are ONE Example (a)/(b)
  and ONE Practice (a)/(b).**
- **A routine procedure gets a BARE box** — complete equation per line, `←`
  annotations, no prose between steps, no Common Error, no Check. Prose only
  where the idea is non-obvious.
- **A "you stopped here" red line becomes the missing line of working**
  (`For increasing function, dy/dx > 0`); a show-that ends `(shown)`.
- **Common Error only when it names the wrong TOOL in one sentence**
  (`b²−4ac counts the roots of an equation. It says nothing about the y-value
  of a point.`). No "Test it: with m = 1.5…" disproofs, no picture arguments.
- **Checks only where a real check exists**, in exact form, green.
- **Routine `←` names the rule** (`← chain rule`); his own annotations also
  carry `**must know …` tags and `eg.` micro-examples.
- **`+C` on every indefinite-integral line; `ln(2x+7)` without modulus bars on
  A-Math; magnitude = signed value first, then `|a|` with `← magnitude is just
  the value without the minus sign`.**
- **Name the method the student knows** (`Perform long division:`), not a
  trick ("force a 6(x+1) to appear on top").
- **Page break before each new skill.** Hints go UNDER a practice question in
  light grey `[Remember: …]`.
- **Re-verify his amended DOCX before release** — his hand-typed 1b dropped a
  ×2 (`x³+3x²−8` for `−64`) and Kiara's Example 1 chain ran the inequality
  the wrong way. The standard is his; the arithmetic still gets checked.

Invoke `create-teaching-notes` and give it this brief:

- **Example → Practice pairs, numbered straight through.** No TRIGGER /
  FIRST LINE / WHY-IT-IS-SAFE scaffolding boxes, no memory-aid chants, no recap
  box — those were explicitly cut. Teaching lives inside the annotated worked
  solution, with at most a one-line italic strategy opener.
- **Worked examples reproduce the SHAPE of the question they got wrong**, with
  changed numbers — never a generic textbook example of the same topic.
- **Practice layout is fixed (Adrian, 31 Aug 2026):**
  - **Number the items 1, 2, 3 …** — never (a), (b), (c). Letters are for the
    PARTS of one question; using them for separate questions makes a
    three-question practice look like one question with three parts.
    **And the reverse holds** (Adrian, 2 Sep 2026): the parts of ONE question
    are (a), (b), (c), never 1, 2. A second part that starts "Hence…" or
    reuses the first part's figure is a part, not a new item — Sophie's EM
    sheet numbered "draw the line to solve…" / "Hence solve the inequality…"
    as 1 and 2, and he sent it back. One stem, one figure, one answer line →
    lettered parts.
  - **No source line under a practice question — none at all** (Adrian, 2 Sep
    2026, twice: first "no need to write the school's name in the question",
    then, shown `[2023 / EM / Prelim / Q9]`, "questions are still showing their
    source - remove the sources"). Provenance goes in the completion payload
    and the question-proposal queue, not on the student's page.
    `scripts/sheet-worker/repair-sheet.py` deletes any that reach Dropbox.
  - **Auto-number the items with real Word numbering** (Adrian, 2 Sep 2026:
    "can we have auto numbering for the question numbers"). Call
    `ws.restart_numbering()` right after each `practice_head(...)`, then
    `ws.Q([...], marks=n)` per item and `ws.SQ([...])` per part — the list
    restarts at 1 for every Practice set and an item he inserts or deletes in
    Word renumbers the rest. Typed `"1.  "` text does not.
  - **1.5 line spacing everywhere, solution boxes included** ("improve
    readability"). `worksheet_lib` boxes are 1.5 since 2 Sep 2026; do not
    tighten them back to 1.15.
  - **The word "never" is out** ("avoid the word 'never', use 'not' or something
    else instead"). "A fall of 15% is × 0.85, not −15." — say not / does not /
    is not. Sweep the finished text for it before filing.
  - **A question with parts gets ONE answer line, at the end**, carrying every
    part: `[Ans: (a) v = 5π cos(πt/6), max speed 15.7 cm/s; (b) 8.22 cm/s²;
    (c) 50 cm/s, a = −100 cm/s²]`. An answer line under each sub-part breaks the
    question into fragments and lets the student check (a) before attempting (b).
  - **Answers are OMML too.** They are the maths the student compares their own
    against — a fraction typed as `3/2` beside a properly set one in the working
    reads as a different standard, and the bracket ends up riding the fraction.
  - **Right tab stop at 15.5 cm** for the `[N]` marks and the `[Ans: …]` line, so
    every question on the sheet lines up down one edge.

- **The Practice must drill the METHOD the Example just taught, not the topic
  it belongs to** (Adrian, 31 Aug 2026). Example 3 taught "pair every
  combination of powers that adds up to n" on `(1+4x)(3-ax)⁴`, and its practice
  then asked for the first four terms of `(2 - x/2)⁵` — a plain expansion, which
  never pairs anything. The student drills something adjacent and the skill goes
  untouched. Test each practice item by asking: **can this be answered without
  doing the thing the Example taught?** If yes, it is the wrong question.

### Search the bank BEFORE you write a question (Adrian, 1 Sep 2026 — binding)

This used to read "prefer real bank questions of the same shape", buried at the
end of another bullet, with no procedure and no tool. Predictably nothing was ever
searched: every practice question on every sheet so far was written from scratch.
Checked on Klaire's — `15ˣ = 4×3ˣ⁺¹`, the 300 cm³/s balloon,
`log₅x + log₂₅(x+4)` — **not one of them is in the bank.** A preference with no
recipe is not a preference, it is a comment.

So, for EVERY practice item, in this order:

1. **Search.** The bank holds thousands of real school and TYS questions and it is
   searched semantically, so describe the METHOD, not the topic — "coefficient of
   x² from a product where two pairs of powers combine" finds what "binomial
   expansion" never will:

   ```bash
   curl -s -X POST "$SHEETS_API_BASE/api/admin/mark-paper" \
     -H "Authorization: Bearer $SHEETS_API_TOKEN" -H 'Content-Type: application/json' \
     -d '{"phase":"qb-search","q":"<the method in one sentence>","level":"AM","count":12}'
   ```

2. **Judge each hit by the same test the Practice must pass** — can it be answered
   without doing the thing the Example taught? A hit on the right topic that skips
   the method is not a hit. Take the best one that passes, verify its answer like
   any other, and use it.

3. **Author only when nothing fits**, and then say so: record the question as a
   proposal (below). A real question of the same shape beats an invented one —
   it carries a school's own phrasing, its mark allocation and its difficulty,
   and Adrian can point at where it came from.

**Authored questions go into the vetting queue, not into the void.** Until now an
invented practice question lived in one student's DOCX and nowhere else, so the
bank never grew and the next sheet on the same skill invented it again. POST each
one to `authored_question_proposals` with the search that came up empty:

```bash
curl -s -X POST "$SHEETS_API_BASE/api/admin/question-proposals" \
  -H "Authorization: Bearer $SHEETS_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"runId":"<run id>","sheetJobId":"<job id>","level":"AM","topics":["Binomial"],
       "skill":"pairing powers for a coefficient","questionText":"…","answer":"…",
       "solution":"…","marks":5,"searchQuery":"<what you searched>","searchHits":[…]}'
```

Nothing there reaches the bank until Adrian approves it. Record the FAILED SEARCH
honestly — the queue cannot tell a genuine gap from a lazy search without it, and
the gap is the interesting half: it says what the bank is missing.
- Teach by contrast as a trio where two rules compete (Klaire 4a → 4b → 4c: a
  warm-up box, a stem-less box with the wrong attempt in red and the fix in
  blue, then the exam question); chain examples ("From Example 5: … ← carried
  forward"). **Practice volume follows the skill** (2 Sep 2026): a routine skill
  gets ONE item — the exam question's twin, same parts and marks, function
  family varied; the conceptual skill gets 3–4 escalating items (increasing →
  decreasing → two stationary points → none) from the bank; a set may close
  with a full 12-mark exam question and its figure.
- Colour: red = the single danger line and the offending term; blue =
  check/verify lines with ✓; grey = ← annotations and Common Error working;
  orange right-aligned `[Ans: …]`.
- **The opening block is fixed. Use this, adapted only for the paper and the
  name** (Adrian, 31 Aug 2026 — the first version explained the sheet's
  *selection theory* to a 16-year-old, which is not their problem):

  ```
  ADRIAN'S MATH TUITION            ← running header, grey, centred
  Additional Mathematics           ← running header, grey, centred

  PRACTICE AGAIN — Learn from A Math 2021 Paper 1     ← title, navy, bold, centred
  For Sophie Tan                   ← small, FADED blue (8EAADB), centred

  Read through each Example
  Then do the Practice under it on your own, before you look at the answers.
  When you have finished, photograph your work and submit it for marking.
  ```

  Three instruction lines, in that order, bolding only **Example** and
  **Practice**. Nothing about waves, triage, or why a skill was chosen — that is
  Adrian's reasoning, not the student's instructions. No explanatory sentence
  above them: the title already says what the sheet is.

- **The name is a "For <Full Name>" subtitle under the title** — small, centred,
  and in a FADED blue (`8EAADB`, i.e. the title's blue lightened, not grey).
  Present but receding: the sheet is theirs, it does not shout their name and it
  never addresses them in the prose ("Sophie, this worksheet…" was tried and
  cut — made for them, not talking at them). Nowhere else on the page.
  (This reverses the earlier "name never appears" rule: Adrian wants these
  personalised, just quietly.) The FILE name keeps the student's name as before.
- **The title block is TIGHT** (Adrian, 2 Sep 2026: *"don't leave such a large
  gap"*). The name sits directly under the title, and the first instruction
  line directly under the name. In `worksheet_lib` terms: the title paragraph
  gets `space_after = Pt(2)` and `line_spacing = 1.0` (grab it with
  `ws.doc.paragraphs[-1]` right after `ws.title(...)` — `title()` returns
  nothing), and the `For <Name>` subtitle gets `space_before = 0`,
  `space_after = Pt(3)`, `line_spacing = 1.0`. The WSTitle style's default
  `space_after` of 6pt plus a 10pt subtitle gap is what he sent back. Keep the
  one blank paragraph AFTER the three instruction lines.
- **Every ② item appears as a single line, not a section.** "Q13(a)(ii): the 500
  was already per second — no ÷ 60." That is the whole treatment.
- **The Optional section (③) is last, and says it is optional in its heading**,
  so a student who is short of time knows exactly what they may skip.

**Two things the first sheets got wrong, both non-negotiable:**

- **Real equations, never plain text — headings and question stems included.**
  `dV/dr = 4πr²` typed as a run of characters is not acceptable output; it must
  be OMML, one step per line with the `=` signs aligned, exactly as STYLE.md
  §equation-steps requires. This is the rule most often half-obeyed: the worked
  steps come out typeset while a section heading still reads "Kinematics — v =
  dx/dt" and an example stem writes `40sin(πt/4)` inline (Adrian, 31 Aug 2026).
  If it is maths, it is an equation object, wherever it appears. The marking
  annotations already render proper fractions and derivatives — the sheet cannot
  look worse than the paper it came from.

- **Every fraction is STACKED — numerator over denominator, always** (Adrian,
  31 Aug 2026). In python-docx terms: an `m:f` with **no `m:fPr/m:type`** (the
  default `bar`). Never emit `<m:type m:val="lin"/>` or `"skw"` — Word draws
  those as `4/3` and `1/2` side by side, and on a page where every other
  fraction is stacked the small ones read as a different, sloppier standard.
  Klaire's sheet carried nine linear fractions, all of them the "simple" ones
  (`½`, `4/3`) the author judged not worth stacking — that judgement is wrong,
  it is exactly the constant in front of `πr³` that a student mis-copies.
  The same applies to slashes typed in PROSE: "so v = dx/dt" inside a sentence
  is still maths, so it is still an equation object.
  Sweep the finished file before filing it:

  ```
  python3 -c "import zipfile,re,sys; x=zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode(); \
  print('linear fractions:', len(re.findall(r'<m:type m:val=\"(?:lin|skw)\"/>', x))); \
  print('slashes in maths:', re.findall(r'<m:t[^>]*>([^<]*/[^<]*)</m:t>', x))" sheet.docx
  ```

  Zero linear fractions. The only slashes allowed in an `m:t` are units —
  `cm/s`, `m/s²`.

- **The solution box hugs its content, top and bottom** (Adrian, 31 Aug 2026 —
  *"i can't backspace to bring the box up to below the solution"*). Two separate
  faults make that gap, and neither can be deleted by hand:

  - **Below `Solution:`** — there is no empty paragraph there to remove, so
    Backspace does nothing; the gap is the label paragraph's `space_after` plus
    the cell's top margin. Set `space_after = 0` on the `Solution:` label and
    `space_before = 0` on the cell's first paragraph, so the box starts where
    the label ends.
  - **Inside the box, at the bottom** — a trailing EMPTY paragraph in the cell.
    Word will not let you delete the last paragraph of a cell, so that space is
    permanent for whoever edits the sheet. Never append one: the box's last
    paragraph must be the last line of teaching. Two of Klaire's six boxes ended
    on an empty paragraph, and five of Kiara's ten.

  Check both before filing: the last paragraph of every table cell must have
  text, and no table may be preceded by an empty paragraph.
- **A geometry or area question gets a diagram — EXAMPLES AND PRACTICE ALIKE.**
  If the skill is about a shape, a region, or coordinates, the student must be
  able to SEE it: draw it per DIAGRAMS.md and view the PNG before embedding.

  This is not decoration on an area question, it is the method. "The region
  bounded by the curve, the normal and the coordinate axes" is a sentence a
  student can read three times and still not know what to integrate; one
  sketch with the region shaded settles it. Sophie's sheet proved the point
  twice — the worked example shipped without a figure, and then Practice 1(a),
  (b) and (c) were three area questions in a row with no picture between them,
  carrying an italic note ("in (b) the region really does lie between two
  graphs, so you subtract") that was doing a diagram's job in words.

  The figure shows the bounding curves and lines, labelled, with the region
  shaded. If the practice item asks the student to FIND the region, draw the
  curves and leave the shading to them — but draw the axes and curves.

**Solution boxes flow — pass `keep_together=False`** (Adrian, 2 Sep 2026: "how
can I remove the large space between the example and section 3?"). The default
glues heading + example + figure + box and jumps the whole block to the next
page when it does not fit, leaving half a page empty. On a teaching sheet let
the box split across the page. In Word the same fix is Paragraph → Line and
Page Breaks → untick "Keep with next" on the paragraphs above the box, and
Table Properties → Row → "Allow row to break across pages". For a sheet
already filed with the glue in it, `repair-sheet.py --unglue <file>` drops
every keep-with-next / cannot-split flag in one go (Klaire's sheet, 2 Sep
2026: "when i hit enter, the paragraph just goes right to the next page").

**Verify everything before rendering**: every worked and practice answer
recomputed with sympy; any figure verified from its own coordinates (tangency,
parallels, claimed equal angles). Report the tally. An unverified sheet is not
finished.

### Re-authoring vs a new wave

A sheet already in `/Students/<Student>/<date> <paper>/` for this paper does NOT always mean
the job is a duplicate. Two different requests look identical from here:

- **A new wave** — the same paper, the skills the last sheet deliberately left
  out. If nothing is left (every lost mark is already taught), say so and stop.
  That guard is correct and stays.
- **A re-author** — the SAME wave, rebuilt because the format changed: a
  missing diagram, plain-text maths, a heading Adrian rewrote. The content
  repeats on purpose. Filing it is the whole point, and REPLACING the previous
  file is the right outcome.

`focus` on the job tells you which. Anything naming a rebuild, a fix, or a
format ("regenerate", "with diagrams", "same wave") is a re-author: keep the
wave the earlier sheet used, fix what was asked, file over it, and say in your
summary which file you replaced. With no `focus`, and every lost mark already
taught, the duplicate guard applies as before.

31 Aug 2026: a rebuild-with-diagrams job reached "verifying" and then refused to
file, reporting that all 19 lost marks were already covered by the two sheets
before it. They were — that was the point.

## Step 5 — file it for Adrian

**Export the PDF from ONE fixed folder: `~/.adrianmath_word_export/`.** Copy the
DOCX there, run the Word AppleScript (`document 1` + name guard — recipe in the
sheet-worker toolchain notes), copy the PDF back. Microsoft Word is sandboxed:
it puts a "Grant File Access" dialog in front of Adrian for every NEW folder it
is asked to write into, and a per-job scratch dir means one dialog per job
(found 2 Sep 2026). One folder, granted once, and the grant persists. Word also
refuses `save as` into `/private/tmp/...` outright (`-1708`), so the export
folder has to live under `$HOME` regardless.

Render the DOCX **and** a preview PDF, then file both:

```bash
node scripts/dropbox-put.mjs "<file>" "/Students/<Student Name>/<YYYY-MM-DD> <paper>/Practice Again.docx" --overwrite
```

(The script stages to Blob and calls `/api/admin/dropbox-put`; a direct Dropbox
call from this Mac 401s — its refresh token predates `files.content.write`.)

Then hand Adrian both files in the session and tell him the next step in one
line: **edit the DOCX in Dropbox, export the PDF beside it, then release the
marked paper + sheet together from triage** (the 📘 attach button there).

### The filing path is fixed — one folder per paper (Adrian, 2 Sep 2026)

```
/Students/<Student Name>/<YYYY-MM-DD> <paper>/Practice Again.docx
/Students/<Student Name>/<YYYY-MM-DD> <paper>/Practice Again.pdf
```

`<YYYY-MM-DD>` is the marking run's date (`paper_marking_runs.created_at`, SGT)
and `<paper>` its `paper_name` — e.g. `/Students/Sophie Tan/2026-09-01 EM 2025
p1 sophie/Practice Again.docx`. Adrian, on a folder holding two papers' worth of
docx + pdf side by side: *"these docx and pdfs will pile up in the same folder,
any ways we can keep them more organized?"* A folder per paper keeps each
paper's sheet and PDF together and sorts by date. **The same folder holds the
marked script too**: the bot files `Marked (AI).pdf` there, and Adrian saves his
amended copy beside it as `Marked (Adrian).pdf` — the website's
`src/lib/paper-folder.ts` is the one rule for the folder name (`:` → `-`,
trailing `.pdf` dropped, whitespace collapsed); a sheet must land in exactly
that folder or release-with-sheet cannot find it. (`/Self-Study/` was renamed
to `/Students/` on 2 Sep 2026.)

**No "Wave" in the name.** (*"why are there always the word 'Wave 1'? do we
need that?"*) The wave was SPEC-TEACHING-CYCLE's idea that one paper could
spawn a second sheet later for the skills the first left out. That is rare, and
the label on every first sheet was noise. The first sheet for a paper is
`Practice Again`; only if a second sheet is ever built for the SAME paper is it
`Practice Again 2`. A re-author writes the same path with `--overwrite`.
No date in the FILE name (the folder carries it), no title variation, no run
number.

Sophie's folder is what happens without this. Two runs, two conventions —
"2026-08-31 PRACTICE AGAIN — Learn from A Math 2021 Paper 1 — sophie am tys
2021 p1" and "2026-08-31 Practice Again (Wave 2) — sophie am tys 2021 p1" —
so the rebuild that was told to replace the earlier sheet quietly sat down
beside it instead, and Adrian opened a folder with two sheets, two PDFs and a
sync copy in it, unable to tell which one to send. "Replace the earlier file"
is unenforceable when each run invents its own name.

Dates belong in Dropbox's own modified column, not in the name.

## Hard rules

- **Never send anything to a student.** No assignment creation, no release, no
  Telegram to anyone but Adrian.
- **One wave.** Overwhelming a student is a worse failure than under-covering.
- **Nothing bare.** Every practice item on the sheet has its teaching above it.
- **Evidence or it doesn't ship.** Every skill on the sheet traces to a
  question they actually lost marks on; say which in your summary to Adrian.
- **A slip is not a skill.** Nothing gets a practice question because the
  student was careless — only because they could not do it. See the triage in
  Step 2; getting this wrong wastes the scarcest thing they have.
- **The sheet cannot look worse than the marked paper.** Typeset equations and
  a diagram wherever the idea is visual.
- If the paper has no lost marks, say so and stop — do not invent weaknesses.
