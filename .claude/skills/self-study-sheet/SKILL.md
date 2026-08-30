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
- If the paper has no lost marks, say so and stop — do not invent weaknesses.
