> **✅ EXECUTED IN FULL — 2026-08-27.** All 7 batches run in one session: 136 worked examples created
> (tagged `source='em-fill-2026-08'` in `content_snippets`) and published on Adrian's instruction.
> EM now has 189 published worked examples across 44/44 topics. Archived for reference — **do not re-run**.
> One-statement revert: `delete from content_snippets where source='em-fill-2026-08'`.

# SPEC — Fill the E-Math worked-example library

> Written 2026-08-27 as a SELF-CONTAINED hand-off: any Claude Code session (any
> account/plan) opened in this repo folder can run it. Read this whole file,
> then run ONE batch and stop for Adrian's review. Repo policies in CLAUDE.md
> apply, but note: **this job needs NO git commits** — it is a pure content job
> (Dropbox reads → admin-API writes). Do not edit repo files.

## Goal & current state

/notes (the student reader) shows, per topic, a Quick Revision card + named
worked-example cards. A-Math is full (312 examples, 31/31 topics). **E-Math has
53 examples in only 6 topics** — the other 38 EM topics have a Quick Revision
card and nothing beneath. This spec fills EM to real coverage: **~140 worked
examples**, batch by batch, all landing UNPUBLISHED for Adrian's review.

Check live progress any time (Supabase MCP, project `nempslbewxtlikfzachi`):

```sql
select topic, count(*) from content_snippets
where level='EM' and content_kind='worked_example' group by topic order by 1;
```

Already covered (do NOT add to these unless told): Algebra (Expressions),
Algebra (Factorization), Algebra (Fractions), Algebra (Identities),
Algebra (Subject of Formula), Indices.

## Priority order (Sec-4 EOY weighted) — one batch ≈ one topic-cluster

1. **Batch 1:** Trigonometry (≈10), Mensuration (≈6), Circular Measure (≈3)
2. **Batch 2:** Congruency and Similarity (≈8), Circle Properties (≈6), Polygons + Angles (≈6)
3. **Batch 3:** Statistics (≈10), Probability (≈7)
4. **Batch 4:** Vectors (≈8), Coordinate Geometry (≈4), Graphs of Functions + Algebra (Quadratic Graphs) + Algebra (Graph on Graph Paper) (≈6)
5. **Batch 5:** Numbers (Prime Factorization, HCF and LCM, Percentages, Ratio, Rate, Speed, Estimation) + Proportion + Map Scales + Indices (Standard Form) (≈16)
6. **Batch 6:** Financial Math (Interest, Hire Purchase, Taxation) + Math In Real World Context + Number Patterns + Sets + Matrices (≈14)
7. **Batch 7:** Algebra (Quadratic Equations, Linear Equations, Simultaneous Equations, Inequalities, Expansion) + Distance and Speed Time Graphs + Geometrical Constructions (≈14)

Counts are targets, not quotas — cover the checklist scenarios below; skip a
scenario when the sources genuinely have nothing (report it).

## Sources — in this order

1. **`~/Library/CloudStorage/Dropbox/Apps/AdrianMathNotes/Notes/EM/`** — Adrian's
   full chapter notes (74 DOCX; prefer the "(corrected)" variant when both
   exist). These CONTAIN worked examples — extract and adapt them. This is the
   primary source: it is Adrian's own IP in his own voice.
2. **`…/AdrianMathNotes/Revision/EM/`** — revision sheets (secondary; their
   notes were already distilled into the Quick Revision topic cards, but their
   worked examples remain usable).
3. **Authored from scratch** — only when neither source covers a checklist
   scenario. Verify every number by hand; mark these in the report.

Convert DOCX with `pandoc "<file>" -t gfm` (pandoc at /opt/homebrew/bin/pandoc;
quote paths — they contain spaces). Pandoc emits LaTeX math; clean layout
tables and `\ \ \` spacing junk. Diagrams that cannot be carried: write
*[diagram in original sheet: <what it shows>]* — never drop silently.

> ⚠ **Copyright boundary:** the scanned Shing Lee "Mathematics Achiever" books
> in Dropbox root supplied the CHECKLIST below (scenario names only). NEVER
> open them to copy content, numbers, or phrasing. Adrian's own files only.

## Card format — match exactly (an existing card as the template)

```
**Question:** Rewrite $x^2 + y^2 - 4x + 6y - 12 = 0$ in standard form and state the centre and radius.

**Step 1.** Group $x$-terms and $y$-terms; move the constant to RHS:
$$(x^2 - 4x) + (y^2 + 6y) = 12$$

**Step 2.** …

**Step 3.** Compare with $(x - a)^2 + (y - b)^2 = r^2$:
**Centre** $= (2, -3)$, **radius** $= 5$.

**⚠ Watch out:** $(y + 3)^2 = (y - (-3))^2$ — track the sign.
```

Rules: ONE contained question; numbered steps; KaTeX (`$…$` / `$$…$$`, `\dfrac`
in display); one **⚠ Watch out** line at the end; 1000–1800 characters; simple
numbers; E-Math register (no calculus, no AM-only identities). One idea per
line; blank-line paragraphs (see the card-readability house rule).

**Titles** are what students search: scenario-style, ≤60 chars, distinct within
the topic — "Reverse percentage: original price before GST", never "Worked
example 3" or a repeat of the section name.

## Placement & insertion (no DB credentials needed)

Every EM topic already has sub-groups (sections). List them per topic:

```sql
select id, name from subgroups where level='EM' and topic='<topic>' order by order_index, id;
```

(or GET the reader page). Pick the best-fitting sub-group by name; spread
examples across sub-groups rather than piling into one. `display_group` may
name a finer section when the sub-group is broad.

**Insert via the live admin API** — base `https://adrianmath-dev.vercel.app`
(the stable dev alias; same database as prod), auth
`Authorization: Bearer <ADMIN_PASSWORD from .env.local>`:

1. `POST /api/admin/cards/create` with
   `{ level: "EM", topic, subgroup_id, card_title, content, content_kind: "worked_example", source: "em-fill-2026-08" }`
   → returns the row (it appends order_index itself).
2. The create route publishes by default — immediately
   `PATCH /api/admin/cards/<id>` with `{ "is_published": false }`.
   **Every card must end unpublished.** Verify with the SQL above
   (`… and is_published = false and source = 'em-fill-2026-08'`).

If the Supabase MCP is connected in your session you may insert directly
(`content_kind='worked_example', feature='both', is_published=false,
source='em-fill-2026-08'`) — same fields, same review gate.

## QC bar (non-negotiable)

- Recompute every numeric result by hand before writing it.
- Everything traces to the source file (cite it in your batch report); scratch
  cards say so explicitly.
- Never modify or delete existing cards; never touch AM or JC.
- `source='em-fill-2026-08'` on every insert — one DELETE can revert a batch.

## Coordination

- Content-only: no git commits, no repo file edits, no promotes.
- One batch per run; report per topic (created / skipped scenarios / source
  files used), then STOP for Adrian's review.
- Before starting a batch, run the progress SQL — another session may have
  filled a topic already; never double-fill.

## Coverage checklist (scenario names per topic, distilled from the book index)

**Trigonometry** — unknown side (right-angled); unknown angle; is the triangle
right-angled (Pythagoras); ratios of acute AND obtuse angles; simple trig
equations (incl. two-solution sin case); area ½ab sin C; sine rule (side,
angle); cosine rule (side, angle); combined sine+cosine rule; angle of
elevation/depression; stating a bearing; bearings journey problem; 3-D problem
(×2 difficulty levels).

**Mensuration** — degrees↔radians; trapezium height from area; arc length +
sector area; cone total surface area; sphere volume; composite solid volume +
surface area (×2).

**Circular Measure** — radian-mode arc/sector; segment area; perimeter of a
shaded region.

**Congruency and Similarity** — prove congruent (one test); solve a congruent
pair; determine similar; solve a similar pair; scale factor of enlargement;
ratio of areas of similar triangles; similar-solids ratio (length→mass/volume);
same-height triangles area ratio.

**Circle Properties** — symmetric properties (perp bisector of chord; equal
chords; tangent ⊥ radius; equal tangents) ×2; angle properties (centre = 2×
circumference; semicircle; same segment; opposite segments) ×3–4, incl. one
multi-theorem chain.

**Polygons** — interior/exterior of a regular polygon; find n from an angle;
polygon problem with algebra. **Angles** — angles at a point/parallel lines;
unknown angles in special quadrilaterals; construction (perp + angle bisector).

**Statistics** — dot/stem-and-leaf (draw + read); histogram; mean-median-mode;
grouped mean via mid-values; cumulative frequency curve reading; box-and-
whisker reading; standard deviation (list + grouped); compare two data sets
(two sentences with figures).

**Probability** — sample space; single event; mutually exclusive (addition);
independent (multiplication); dependent/without replacement; possibility
diagram; tree diagram.

**Vectors** — magnitude; scalar multiple; parallel vectors; prove collinear;
sum/difference (triangle law); position vectors ↔ coordinates; geometric
problem in terms of a, b; ratio of areas via vectors.

**Coordinate Geometry** — gradient; length; equation of a line; show two lines
perpendicular. **Graphs of Functions** — sketch quadratic (3 forms); match
sketch to equation; graphical solution + gradient by tangent. **Quadratic
Graphs / Graph on Graph Paper** — covered by Quick Revision cards; add 2–3
examples each if the Notes chapters carry them.

**Numbers cluster** — prime factorisation; HCF (two + three numbers); LCM (two
+ three numbers); square/cube roots via factorisation; perfect-square top-up;
significant figures (whole + decimal); 1-s.f. estimation; standard-form
calculations ×2; ratio (two + three quantities); ratio change; reverse
percentage; percentage in context; rate in context; km/h↔m/s; average speed
×2; direct proportion (incl. √x form); inverse proportion (incl. x³ form).
**Map Scales** — actual distance + area; find the scale. 

**Financial Math** — simple interest rate; compound interest; compare
simple vs compound; loan period; income tax; hire-purchase price; utilities
bill. **Math In Real World Context** — profit/loss %; cost price after loss;
money exchange; distance-time graph reading; speed-time graph reading; water
level-time sketch. **Number Patterns** — nth term (common difference; squares;
common ratio); pattern problem. **Sets** — list elements; subsets; shade Venn
from notation; draw a Venn; intersection/union counts. **Matrices** — display
info; add/subtract; scalar multiple; multiply two; real-world application.

**Algebra remainder** — solve quadratic by factorisation / formula / completing
the square; fractional → quadratic; quadratic applications; linear equations
(brackets + fractions); simultaneous by elimination AND substitution +
graphical meaning; word problem; linear inequality on a number line;
simultaneous inequalities; expansion (double brackets + identities).
**Distance and Speed Time Graphs** — interpret each kind + one sketch.
**Geometrical Constructions** — triangle from 3 sides; quadrilateral with
angles; combined perp-bisector/angle-bisector region.

— end of spec —
