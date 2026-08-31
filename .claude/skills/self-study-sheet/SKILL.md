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

Use the newest run unless Adrian names one. If several re-marks of the same
paper exist, use the **best/newest** — earlier ones are superseded.

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

Invoke `create-teaching-notes` and give it this brief:

- **Example → Practice pairs, numbered straight through.** No TRIGGER /
  FIRST LINE / WHY-IT-IS-SAFE scaffolding boxes, no memory-aid chants, no recap
  box — those were explicitly cut. Teaching lives inside the annotated worked
  solution, with at most a one-line italic strategy opener.
- **Worked examples reproduce the SHAPE of the question they got wrong**, with
  changed numbers — never a generic textbook example of the same topic.
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

- **Real equations, never plain text.** `dV/dr = 4πr²` typed as a run of
  characters is not acceptable output; it must be OMML, one step per line with
  the `=` signs aligned, exactly as STYLE.md §equation-steps requires. The
  marking annotations already render proper fractions and derivatives — the
  sheet cannot look worse than the paper it came from.
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
