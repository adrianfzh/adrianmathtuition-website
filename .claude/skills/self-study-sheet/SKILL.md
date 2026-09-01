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

But it is not the only evidence, and on its own it will mislead you. **Read every
paper this student has had marked** (Step 2), because the thing worth teaching is
usually a habit, and a habit is invisible in one script.

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

### Read EVERY paper, not just this one (Adrian, 1 Sep 2026 — binding)

The single-paper diagnosis is a measured blind spot, not a theory. Eva's five
marked papers were analysed together against the wave the sheet worker had
produced from her newest one alone:

| | marks lost | occasions | papers |
|---|---|---|---|
| Shape & space (mensuration, circle, 3-D) | 44 | 23 | 5 / 5 |
| **Leaving parts blank** | **37** | 14 | 4 / 5 |
| "Explain / justify" — asserting, not reasoning | 9 | 9 | **5 / 5** |
| Scale factor not squared or cubed | 6 | 4 | 3 / 5 |

The worker got shape-and-space right — two of its four picks. It missed the other
three entirely, and the reason is not judgement:

| paper | blank marks | total lost |
|---|---|---|
| **the paper it read** | **0** | 37 |
| the other four | 8 · 15 · 8 · 6 | 97 |

**On the one script it was given, she left nothing blank.** Her largest single
weakness — 37 marks handed over untouched — does not appear in the evidence it
had. Same for "explain": two marks on that paper, below any sensible cut; nine
separate occasions across five.

So pull them all:

```sql
select r.paper_name, r.created_at,
       res->>'question_number' as q, p->>'label' as part,
       (p->>'max')::int - (p->>'awarded')::int as lost,
       coalesce(p->>'not_attempted','false') as blank,
       p->>'error_summary' as why
from paper_marking_runs r,
     lateral jsonb_array_elements(r.result_json->'results') res,
     lateral jsonb_array_elements(res->'marking_output'->'parts') p
where r.student_id = '<rec…>'
  and jsonb_typeof(r.result_json->'results') = 'array'
  and (p->>'awarded')::int < (p->>'max')::int
order by r.created_at desc;
```

**THE LATEST PAPER HAS A VETO** (Adrian, 1 Sep 2026 — the correction that makes
this rule safe). Past papers tell you whether something is a HABIT; the newest one
tells you whether they still have it. A weakness that has stopped appearing is
evidence of LEARNING, and drilling it wastes the sheet on something already fixed.

Eva is the worked example against itself. Blanks were her largest aggregate loss —
37 marks — and they run 6, then 8 and 15, then 8, then **zero** on her most recent
paper. Summed, they look like her number one problem. Read in date order they look
like a problem she is solving. Ranking them first would have taught her something
she had already learned.

So: count across every paper, but **check the newest before you rank**.
- Still present in the latest paper → live. Rank it.
- Absent from the latest but heavy before → say so in the wave as progress
  ("blanks: 37 marks over four papers, none in the newest"), and do NOT give it a
  section. Adrian may still want a word about it; that is his call, not a drill.
- Present ONLY in the latest → a possible one-off; rank it by size and say it has
  been seen once.

**RECURRENCE OUTRANKS SIZE.** A misconception that costs 2 marks in three
different papers beats a 6-mark loss that happened once — the first is a hole they
carry into the exam, the second may be one hard question on one bad day. Adrian's
ruling on Eva's scale factors, 1 Sep 2026: the worker filed them **Optional** on a
2-mark showing; across three papers they are the same error verbatim, and he
ranked them **high**. When you catch yourself putting something in Optional, check
how many papers it appears in before you do.

**Behaviours count as skills.** Two of the three things the single-paper read
missed are not topics at all:
- **Leaving parts blank.** If a student abandons parts, that is the biggest thing
  you can teach them, whatever the topic — a first-move sheet ("what do you write
  when you don't know how to finish") beats another rules sheet.
- **Answering "explain" by restating the claim.** Reaching the right conclusion
  without earning it. Cheap to fix, invisible in one paper, and it costs marks in
  every paper they will ever sit.

**COUNT THE SLIPS AND THE TRANSFER ERRORS TOO** (Adrian, 1 Sep 2026). An
arithmetic slip is not a skill, so it earns no practice (triage ② — show, don't
drill). But it still costs marks, and a student who drops six marks a paper to
slips has a real, teachable problem that no topic list will ever name. So COUNT
them and report the total, even though none of them becomes a section:

- **arithmetic slips** — a sign lost, a term dropped, $-48 \div 8$ written as $+6$
- **transfer errors** — the working says one thing and the answer line another;
  a value copied wrongly from one part into the next; a correct value rounded
  away at the end. Eva's script had this repeatedly, and it is the cheapest
  category of mark there is to win back.

Report them as a line in the wave — *"and 7 marks to slips and answer-line
transfers across four papers"* — so Adrian can see the size of it and decide
whether it deserves a habit sheet of its own. Ignore this and the sheet teaches
the hard things while the easy marks keep leaking.

Say in the wave WHICH papers each skill came from and how often — Adrian is
choosing what to teach, and "three papers running" is the fact that decides it.

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

Section headings are numbered, name the BEHAVIOUR, and may join two ideas with
"+" or give a direct instruction: "3. A constant factor rides along — and read
what the rate is measured per", "4. Squaring hides a second case + Make Sure You
Perform Shoelace Method Correctly".

## Step 3 — propose ONE wave, and STOP

Cluster into 6–8 teachable skills for a single sheet. Everything else is
**deferred with its evidence** (question, part scores, the annotated page URL
from `result_json.annotated_photos`) — put deferred topics in Adrian's
`/admin/my-todos` (one line each, with the marked-page link) until the shelf
is built.

Show Adrian the proposed wave and the shelf list, and **wait for his approval**.
Picking the wave is teaching judgment — the checkpoint is his.

## Step 4 — author the sheet

### Adrian's own trap for the skill — check, then usually move on

The diagnosis in Step 2 comes from the student's real script, which beats any
generic list — do NOT let a stored trap displace what she actually did. But the
teaching line under a heading states the GENERAL rule, and Adrian has often
already written that rule down:

```sql
SELECT wrong_move, why_wrong, corrective_cue FROM pitfalls
WHERE status = 'approved'            -- Adrian's sign-off; NEVER drop this filter
  AND subject = '<AM|EM|JC|S1|S2>' AND topic = ANY(ARRAY['<canonical topic>']);
```

(`subject` is the coarse level: `S3_AM`→`AM`, `S3_EM`/`EM_NA`→`EM`, any `JC*`→`JC`.)

Use one ONLY when it is the same slip the script shows, and then only for the
wording — `corrective_cue` is already in his voice, which is the whole reason to
look. A trap that does not match this student's error does not go on her sheet:
the sheet is about what she got wrong, not what students generally get wrong.
Expect to use none on most sheets.

### The reference sheet

`/Self-Study/Khoo Ke Er Klaire/Practice Again (Wave 1) — klaire am tys 2021 p1.docx`
is the sheet Adrian says is closest to what he wants (31 Aug 2026, comparing it
against Kiara's and Sophie's from the same evening). Read it before authoring.
What makes it the reference — all of it reproducible, none of it accidental:

- **The heading TEACHES; it is not a topic label.** "Make it ONE base before you
  do anything else", "A curved edge is not a polygon — split the region and
  integrate", "When the power is −1 the power rule breaks". Kiara's sheet
  headed the same kind of skill "Always Increasing / Always Positive Leading To
  The Discriminant Condition" — Title Case, a filing label, and a student who
  reads only the headings learns nothing from it. A student who reads only
  Klaire's headings has already been taught four things.
- **Two examples where the skill has two faces.** Example 1a took `12ˣ = 7×4ˣ⁺¹`
  (same base by logs), 1b took `log₂x + log₄(x+3) = 3` (same base by change of
  base) — one skill, both faces, then one practice set covering both. Kiara got
  one example per skill throughout.
- **The three triage tiers are three visible ZONES, in order**, not tags mixed
  into the flow: the numbered skills with Example + Practice, then
  **"Read these once — no practice needed"** (② — one line each, no questions),
  then **"Optional — do these only if you have time"** (③ — teaching, then a
  single `(Optional)` question with its answer). Kiara's sheet put a bare
  `(Optional)` tag above a mid-document skill, so nothing tells a student who is
  short of time where to stop.
- **Diagrams in the Example AND in the Practice.** Klaire's area section carried
  three figures — one in the worked example and one on each practice item.
  Kiara's sheet had none at all.
- **Density.** 107 fractions and 50 display equations in Klaire's, against 29
  and 34 in Kiara's, on comparable page counts. The difference is not padding:
  it is that Kiara's Example 1 solution is four paragraphs of bare algebra with
  no opening line in plain English, and Klaire's boxes all open with one
  ("You are given dV/dt and asked for dr/dt. Build the chain first, substitute
  second.") and close with a red danger line and a blue ✓ check.
- **The fixed opening block, all three lines**, and the name as a faded-blue
  `For <Full Name>` subtitle. Kiara's had one instruction line and no name.

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
- Plain skill-phrase headings ("Differentiating a square root of a linear
  expression"); teach by contrast in one example where two rules compete;
  chain examples ("From Example 5: … ← carried forward"); 2–4 practice per
  skill, escalating into the next idea.
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

**Verify everything before rendering**: every worked and practice answer
recomputed with sympy; any figure verified from its own coordinates (tangency,
parallels, claimed equal angles). Report the tally. An unverified sheet is not
finished.

### Re-authoring vs a new wave

A sheet already in `/Self-Study/<Student>/` for this paper does NOT always mean
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

Render the DOCX **and** a preview PDF, then file both:

```bash
node scripts/dropbox-put.mjs "<file>" "/Self-Study/<Student Name>/Practice Again (Wave <n>) — <paper>.docx" --overwrite
```

(The script stages to Blob and calls `/api/admin/dropbox-put`; a direct Dropbox
call from this Mac 401s — its refresh token predates `files.content.write`.)

Then hand Adrian both files in the session and tell him the next step in one
line: **edit the DOCX in Dropbox, export the PDF beside it, then release the
marked paper + sheet together from triage** (the 📘 attach button there).

### The filename is fixed

`/Self-Study/<Student Name>/Practice Again (Wave <n>) — <paper>.docx` (and
`.pdf`). No date, no title variation, no run number.

The wave number IS the identity: wave 2 of a paper is one document, however many
times it gets rebuilt, so a re-author writes the same path with `--overwrite`
and the folder keeps one file per wave. A NEW wave increments `<n>`.

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
