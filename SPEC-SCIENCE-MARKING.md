# SPEC — Science paper marking (Physics first)

> Drafted 2026-08-26 at Adrian's ask ("is it possible to extend this marking pipeline
> to mark science papers? … spec it"). Companion to [`SPEC-SUBJECTS.md`](SPEC-SUBJECTS.md)
> (the subjects-expansion source of truth — rubric-as-spine, calibration gate) and
> [`docs/MARKING.md`](docs/MARKING.md) (the pipeline this extends). Status: SPEC ONLY —
> nothing here is built.

## Principle

The marking pipeline splits cleanly into a subject-agnostic **chassis** and a
math-specific **brain**. Science marking = same chassis, new brain per subject, gated
by the same trust machinery (triage + release) and the SPEC-SUBJECTS calibration bar:
**Adrian hand-marks 10–15 real scripts per subject; the AI must land within ±2 marks
of him before anything is released to a student.**

**Chassis (transfers as-is, zero changes):** intake (photos/PDF, spread-split, hi-res
originals), page classification (`page_kind`), 🌙 queue + Batch API, Gemini
tick-grounding + the whole red-pen layer (score rail, two-colour ink, SEAB-style code
boxes), PDF assembly + pagination, Dropbox filing, triage + release gate, answer-key
cross-check, `/app/submit` + `/app/marking`.

**Brain (per subject):** the marking system prompt — how to derive ground truth, the
severity/deduction model, the notation of the codes, the solution-presentation rules.

## Why Physics first

| | Ground truth derivable? | Code-exec verifiable? | Scheme dependence |
|---|---|---|---|
| **Physics** | Mostly — numericals from givens | Yes (units, s.f., algebra) | Low-medium |
| **Chemistry** | Often — mole calc, equations balance | Yes for calc; concept Qs less | Medium |
| **Biology** | Rarely — answers ARE scheme points | No | **High — scheme near-required** |

Physics is closest to math: solve-it-yourself + arithmetic verification carry over
almost unchanged. Biology inverts the doctrine — marking is matching prose against
"any two of:" point lists, so the **official scheme becomes an input**, not a
cross-check. Order: **Sec Physics → Sec Chemistry → Combined Science → Biology**
(Bio only with schemes in hand).

## The Physics brain (v1 scope)

New `PHYSICS_MARK_SYSTEM` beside the math prompts in `ai/paper-marker.js`, selected by
a `subject` field on the marking request (default `math` — nothing changes for math):

- **SOLVE step:** derive the answer from the printed givens; **carry units through
  every line** and verify numerics with code-exec. Anti-anchoring + setup-before-
  arithmetic rules carry over verbatim (a wrong formula computed correctly is the
  same trap in physics).
- **Deduction model:** SEAB physics convention — method/substitution/answer marks;
  **unit errors and s.f. errors cost the answer mark** (configurable severity);
  ECF across parts as in math. Codes stay M/A/B shorthand (schools use variants;
  the box/tick rendering is notation-agnostic).
- **Definition/explain questions:** marking points, not prose quality — the severity
  rules' "explain" section carries over, plus a physics keyword discipline (a
  definition missing its qualifying condition — "per unit *time*", "in a *vacuum*" —
  is the DEFINITION COMPLETENESS case, −1 with the missing words named).
- **Diagrams:** ray diagrams, circuit reading, graphs — reuse the sketch
  feature-by-feature rules; the margin-figure system gains kinds only when
  calibration shows the need (candidates: circuit fragment, ray box). Not v1.
- **Answer key:** same cross-check layer; for physics it should be encouraged —
  Adrian attaches the school's answer page where he has it.

## Data & plumbing (small)

- `paper_marking_runs` gains `subject text default 'math'` (one migration); runs
  filter cleanly per subject in `/admin/papers`, triage, and the bleed table
  (bleed topics come from `topic_detected` — physics topics slot in unchanged).
- Mark-paper page: a subject picker next to the model picker (defaults math; the
  bot safelists like it does `style`). `/app/submit` unchanged until launch.
- The separate science Supabase projects (`SUPABASE_SERVICE_KEY_PHYS` etc.) are for
  the science QB/portal per SPEC-SUBJECTS — marking runs stay in the math project's
  `paper_marking_runs` with the `subject` column, so every existing surface keeps
  working (revisit only if science volume demands it).

## Calibration protocol (the gate)

1. Adrian picks **one hand-marked Sec Physics paper** (his marks = truth #1).
2. Run it through `scripts/eval-mark-model.js` with the physics prompt (the harness
   already supports prompt/model swaps — marking reads only, no side effects).
3. Compare per-question; iterate the prompt on the misses. Repeat over **10–15
   scripts**, tracking |Δ| per paper. Gate: **within ±2 marks per paper** and no
   confident-wrong award Adrian wouldn't forgive.
4. Only then: subject picker goes live for Adrian's own use; student release stays
   behind the same triage gate as math. `/app/submit` for science only after a
   month of Adrian-reviewed use.

## Explicitly out of scope (v1)

- Biology and essay-style marking (needs the scheme-as-input design — spec separately
  once Physics passes the gate; overlaps SPEC-SUBJECTS' L1 essay-rubric work).
- Practical/lab papers, MCQ bubbling (an OMR-ish feature, different machinery).
- Auto-detecting subject from the photos (the picker is one tap and never wrong).

## First concrete step

Adrian hands over one hand-marked Sec Physics paper (photos + his marked copy).
That single calibration run — physics prompt drafted, eval harness, diff against his
marks — is about a day, and tells us more than any further planning.
