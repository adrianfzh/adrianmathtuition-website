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
is a sheet that does not get done. Four to six skills in ① is a real sheet; the
rest is ② in one line each, or ③ at the back, or shelved for the next wave.

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
- **The student's name never appears inside the document.** Title it for the
  paper ("PRACTICE AGAIN — Learn from A Math 2021 Paper 1").
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
- **A geometry or area question gets a diagram.** If the skill is about a shape,
  a region, or coordinates, the student must be able to SEE it — draw it per
  DIAGRAMS.md and view the PNG before embedding. Sophie's area example shipped
  without one, which is the one example where seeing the figure IS the method.

**Verify everything before rendering**: every worked and practice answer
recomputed with sympy; any figure verified from its own coordinates (tangency,
parallels, claimed equal angles). Report the tally. An unverified sheet is not
finished.

## Step 5 — file it for Adrian

Render the DOCX **and** a preview PDF, then file both:

```bash
node scripts/dropbox-put.mjs "<file>" "/Self-Study/<Student Name>/<YYYY-MM-DD> <Sheet title> — <paper>.docx"
```

(The script stages to Blob and calls `/api/admin/dropbox-put`; a direct Dropbox
call from this Mac 401s — its refresh token predates `files.content.write`.)

Then hand Adrian both files in the session and tell him the next step in one
line: **edit the DOCX in Dropbox, export the PDF beside it, then release the
marked paper + sheet together from triage** (the 📘 attach button there).

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
