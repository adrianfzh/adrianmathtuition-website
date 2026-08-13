# Open tasks — handoff (written 2026-08-10, main-Mac session)

Self-contained task list for any Claude Code session on any machine/plan.
**One-time setup on a new machine:** connect the Supabase MCP for the math
project (`nempslbewxtlikfzachi`) to that machine's Claude account — tasks 1-3
query it. Everything else ships with the repo. Delete entries as they finish;
delete the file when empty.

## 1. Generate the first test paper (validation run)

Run the `/prelim-paper` skill (`.claude/skills/prelim-paper/SKILL.md`) —
e.g. "prelim paper: AM P2, standard". It assembles real QB questions against
`data/paper-blueprints.json`, applies the setter checklist, renders house
DOCX + answer key, and ends with an audit manifest. This is the acceptance
test of the blueprint (mined 2026-08-10 from 474 real papers, commit 973dd48).
Adrian reviews the manifest + paper; feedback goes back into the skill's
setter checklist.

## 2. Approve Trigonometry (Identities) units — WAITING ON ADRIAN'S WORD

All 26 pending units of AM · "Trigonometry (Identities)" were reviewed
2026-08-10 (three parallel reviewers; zero mathematical errors; 7 units
surgically repaired in place; unit_order de-collided so core → examples →
practice). They are still `status='pending'`. When Adrian says approve:

```sql
UPDATE learning_units SET status='approved', updated_at=now()
WHERE subject='AM' AND topic='Trigonometry (Identities)' AND status='pending';
-- expect 26 rows; then verify they render at /admin/learn-review and /app/learn
```

## 3. Continue the unit-review rollout (1,293 still pending)

Proven recipe from the pilot — run per topic, ~3 parallel review agents:
- Slice by kind: (core+check) / (example) / (try). Each agent: fetch its
  pending units via MCP, verify EVERY mathematical claim numerically in a
  node scratch script (identities at sampled θ, answer keys re-solved,
  solution-set completeness), check 4049/4052 syllabus fit, readability
  (one idea per line — see memory), internal consistency, overlap.
- Verdicts: APPROVE / FIX (exact replacement text) / REJECT. Reviewers then
  APPLY their own fixes via jsonb_set (content only — never the status
  column); one agent owns unit_order de-collision for the topic.
- Statuses flip only on Adrian's explicit approval, per topic.
Priority order (bleed table × pending counts): Kinematics, Differentiation
(Techniques), Differentiation (Max/Min), Trigonometry (Equations),
Trigonometry (Ratios), then remaining AM; EM/S1/S2 after AM.

Progress (2026-08-10, second-Mac session): **Kinematics DONE** — 17 units,
3 reviewers, 14 payload fixes applied (0 rejects), order verified, report
with Adrian, statuses untouched. **Differentiation (Techniques) DONE** —
37 units, 3 APPROVE / 34 FIX / 0 REJECT, ~200 numeric checks clean, all
four "(…corrected)" title claims independently verified true; printed-notes
misprint list + title-rename proposals with Adrian. **Differentiation
(Max/Min) DONE** — 19 units, 1 APPROVE / 18 FIX / 0 REJECT, ~240 checks;
FOUND ONE TRULY WRONG UNIT (Ex 3b min-gradient: digitisation "correction"
had broken a correct print answer — fixed to (2,1), min grad −3) plus a
degree-mode trig example rebuilt in radians and two ill-posed drill
problems repaired. **Trigonometry (Equations) DONE** — 28 units (incl.
first autopsy/check kinds; planted errors verified genuine + preserved),
7 APPROVE / 21 FIX / 0 REJECT; every solution set brute-force-scanned
against its interval — one wrong published value found (5.17→5.18, a
truncation), both autopsies confirmed correct (255° stands).
**Trigonometry (Ratios) DONE** — 31 units, 23 APPROVE / 8 FIX / 0 REJECT;
signs verified in-quadrant everywhere incl. parametric k/p/t answers; one
degenerate drill part restored, two verbatim Assignment-1 duplicates
re-angled, autopsy sound. Five priority topics complete (132 units,
37 APPROVE / 95 FIX / 0 REJECT, statuses untouched). **Trigonometry
(Graphs) DONE** — 25 units, 15 APPROVE / 10 FIX / 0 REJECT; both
autopsies sound (c=2 boundary verified by exact roots), one false
teaching note fixed ("half a cycle" → one period), one ill-posed
constants question pinned (k=3 witness), .21 gained .19's figure by
byte-identical server-side copy ("same diagram" ask). **Integration (Techniques) DONE** — 22 units, 7 APPROVE / 15 FIX /
0 REJECT; every antiderivative differentiated back; n≠−1 exclusion and
+C discipline restored on formula cards, Summary Q1 key completed
(6 unanswered parts), one verbatim duplicate re-angled, ambiguous
ln(3x)² pinned. **Rates of Change DONE** — 18 units, 4 APPROVE / 14 FIX / 0 REJECT;
every rate chain-rebuilt AND finite-difference-simulated; cone-card
orientation error fixed (tip-up vs tip-down proven by slicing integral),
implicit-diff hint replaced with in-scope substitution route, shapeless/
figure-lost problems restored. **T&N DONE** — 16 units, 4 APPROVE / 12 FIX / 0 REJECT (after a
session-limit interruption + clean relaunch); "Q8 key corrected"
CONFIRMED (q=11; old q=13 wrong); false "flip happens twice" core claim
fixed; two ill-posed drill problems repaired (undefined P; undefined Q
reconstructed via exact identity k=1/5). **R-Formula DONE** — 14 units, 6 APPROVE / 8 FIX / 0 REJECT; autopsy
sound (boundary-min trap verified by 360k-pt scan); drill stub question
reconstructed from the autopsy's own quote; missing solve target
L=11.8 reverse-engineered + verified unique. ⚠ Cross-topic find: TWO
pending EM autopsies have wrong_line:0 vs the 1-indexed convention —
EM Circle Properties ae8866b6 "the 90° that isn't ∠CAD" and EM Matrices
24340501 "Spot the swapped multipliers" — fix when the EM pass reaches
them (0 may be deliberate for figure-label errors; check the renderer).
**Integration (Area) DONE** — 12 units, 0/12/0; found the rollout's 2nd
truly broken item (composite part whose published areas match NO region —
re-posed + verified); figure-lost problems reconstructed; SEAB check:
"area between 2 curves" is officially EXCLUDED from 4049 (card framing
flagged). **Incr/Decr DONE** — 8 units, 2/6/0 ("(x+2)² always positive"
falsehood fixed). **Definite Integrals DONE** — 5 units, 0/5/0; PHYSICAL
KEY ERRATUM: Assignment 2 Q2(a) key says 20, correct is 16; three
orphan answers (problems never digitised) removed pending source.
**ALL AM LESSON-TOPICS COMPLETE: 252 units, 75 APPROVE / 177 FIX /
0 REJECT** (plus the 26-unit Trig Identities pilot) — statuses all still
pending. Binary tie-check across all AM: zero real unit_order ties
(every reported "tie" was the float4 display trap). **Check-tail sweep DONE (Adrian-approved)** — 83 units across 15
micro-topics, 78 APPROVE / 5 FIX / 0 REJECT (two mathematically-false
feedback claims fixed, one impossible point on an x²-axis, generation
debris in one feedback). **AM IS 100% REVIEWED: 335 units this session,
153 APPROVE / 182 FIX / 0 REJECT** (+26-unit Trig Identities pilot).
Also SHIPPED (Adrian-directed): the 'targeted' builder preset — new
bleed_topic_aggregate() SQL fn + bleedOverlay() matcher turn
paper_marking_runs into live topic weights (e2e-verified on preview:
Logs 1.5×, Linear Law 1.30×, Kinematics 1.26×). EM rollout STARTED
per Adrian: EM Trigonometry (60 units) first, two waves. **Wave 1 DONE**
(strands 1081/1082/1083 = 37 units, 13 APPROVE / 24 FIX / 0 REJECT):
found TWO autopsy wrong_line off-by-one bugs (tapping the planted error
graded "Not here" — fixed, planted content byte-preserved; AUDIT
wrong_line on every future autopsy), one factually wrong core claim
(△UQP is right-angled, not cosine-rule), wrong key values 8.73→8.74,
24.3→24.4, 34.3°→34.2°, 5.07→5.06, and a rounding-boundary trap
(displayed 14.15 ⇒ 49.4° vs keyed 49.3° — carry-full-values note added).
**Wave 2 DONE → EM TRIGONOMETRY COMPLETE: 60 units, 16 APPROVE /
44 FIX / 0 REJECT.** Systemic find: ALL FOUR EM Trig autopsies shipped
wrong_line off-by-one (EM digitisation numbered lines 0-based, player is
1-based) — every future EM/S1/S2 autopsy gets a wrong_line audit; the
two wrong_line:0 autopsies (EM Circle Properties, EM Matrices) are the
same bug. More wrong keys fixed: 50.9°→50.8°, 75.6→75.7 m², 8.07→8.08 m.
Session totals: 395 units reviewed, 169 APPROVE / 226 FIX / 0 REJECT.
**EM Probability DONE** — 36 units, 16 APPROVE / 20 FIX / 0 REJECT,
ZERO math errors (fixes were "✓ key" QA-leak strips, run-on formatting,
provenance); all 3 autopsies' wrong_line verified CORRECT as stored (the
0-based bug was EM-Trig-batch-specific; keep auditing anyway). Topic-wide
style question for Adrian: bare per-answer "✓" stamps pervade Probability
try units (authoring residue; approved corpus never stamps) — global
strip is a one-word decision. Progress: 457/1297 reviewed (35.2%);
AM 100%, EM 96/456. Next: EM Vectors (34) in flight; Tier A wave 3
running (backlog 12,914→8,718 after two waves).
Also per Adrian: 18 unit TITLES cleaned (changelog "(…corrected)" tags
stripped, DiffTech applications renumbered Ex 5a–5d, TrigEq double-angle
prefixes); **/qb-enrich Tier A RUNNING** — wave 1 done: 997 answers
extracted (13,040→10,279 gap), 8 skips (constructions/self-contradictory),
Sonnet agents ~1.2k tok/row; wave 2 (4×250) in flight. QB data flags:
136 solutions contain '' double-apostrophe ingestion artifact; pure
construction rows need a one-time no-answer flag.
Task 4 v1 SHIPPED to dev (commit 1bf3957): /admin/prelim-builder
(deterministic assembly API+UI, paper_drafts, per-slot pin/swap/reroll,
/setter-pass skill); e2e-verified on preview (AM-P2 std + hard, EM-P2
all land 90/90; EM closes on Real-World-Context ✓). PDF export pending. ⚠ unit_order "ties" seen via ::numeric casts are
PHANTOM — float4 renders 6 sig figs there; compare `unit_order::float8` or
GROUP BY unit_order HAVING count(*)>1. Trig (Identities) block 2 was never
actually collided; no ordering fix needed there.
**2026-08-11.** Task 4 CLOSED: PDF export shipped —
`/api/admin/prelim-builder/export?id=` renders a saved draft as a real
mock-exam PDF (src/lib/render-prelim.ts: exam header + instructions box,
marks-scaled working space, consolidated ANSWER KEY page; e2e on preview:
AM-P2 draft → 9-page 240KB PDF) — plus 📄 Prelim Builder tile on the
admin hub. **EM VECTORS DONE: 34 units, 11 APPROVE / 23 FIX / 0 REJECT**
(strands 1141 4A/8F, 1142 5A/7F, 1143 2A/8F; sympy-verified throughout —
89/89 + 65/65 named checks + three full verification scripts on 1141).
Finds: two lost-figure units repaired with basis-free consistency proofs
(keyed values first proven basis-independent, so reconstruction cannot
contradict the printed keys); Assignment 1 Q2 used an UNDEFINED point F —
the parallel-line construction is provably the only one matching both
published answers (rival guess ruled out numerically); triangle-inequality
statement strengthened (missing absolute value); autopsy wrong_line=3
audited CORRECT (the 0-based bug stays EM-Trig-batch-only so far).
Printed-sheet errata (physical materials, Vectors): Assignment 1 Q2 key
`4/5·SP` is a mis-copy of `¾·SP`; Ex 3 sheet swaps part values (½ belongs
to (ii), ⅔ to (iii)); Ex 4 printed working has a sign slip (correct value
2m − 2n). Progress: **491/1,297 reviewed (37.9%)** — AM 361/361 (100%),
EM 130/456, S1 (301) + S2 (179) untouched. Next launched: EM Algebra
(Quadratic Equations), 28 units, 3 strands (1012.01–.09 /
1012.10–1013.05 / 1013.06–.14; autopsies ac30e2d5 + b9a5bf49 get the
wrong_line audit). Tier A: wave 3 DONE — 987 answers (backlog
12,914 → 7,731, 40% of the gap closed); wave 4 (4 agents × ~250) in
flight.
**QB errata / suspect-flag list (consolidated; for a later verification
pass — check each row before editing, none are confirmed-safe bulk edits):**
- 136 solutions carry a `''` double-apostrophe ingestion artifact.
- "See parts." stub solutions: c0afa114, cc0d1a50, 114caab4, 02f4c3cd —
  find the rest via `length(solution) < 15`.
- Concatenated double solution: 4a6a2ffd. Final answers never summed:
  c91d75e0. Part (d) missing from solution: 4a685eff.
- Suspect final lines (solution reaches a doubtful conclusion): 8b6c5c9f,
  108f5bf2, ca4677b4, d2efa235 (IQR subtracted backwards), 8fa30be6
  (sign of k), 918e326d (velodrome), 9787f5d1 (SD 6 vs 5), 9932e0f0.
- Pure-construction rows (`[construction]`/`[sketch]` answers) deserve a
  one-time no-answer flag so enrichment sweeps stop re-reading them.

**2026-08-11 (cont'd). EM ALGEBRA (QUADRATIC EQUATIONS) DONE: 28 units,
18 APPROVE / 10 FIX / 0 REJECT**, 210 sympy checks across 3 strands; BOTH
autopsies' wrong_line audited CORRECT as stored (2 and 1 — the 0-based bug
remains EM-Trig-batch-only). Zero wrong keys in the DB; fixes were one
ill-posed premise (cyclists example never said the roads cross at O —
proven the unique configuration matching the keyed equation, premise
written in), a provably-false justification inside a check option
(deleted), one mid-rounded speed 117.925→117.924, a missing
root-rejection statement, run-on reflows, and "All keys/Keys verified."
QA-leak strips. Progress: **519/1,297 reviewed (40.0%)** — AM 361/361,
EM 158/456. Printed-sheet errata (physical materials, quadratics):
**Assignment Q1 is misprinted** — "solve $5y^2=18y+9$ by factorization"
is irreducible (disc 504); the printed key {3/5, 3} belongs to
$5y^2=18y-9$ (autopsy 1012.14 teaches exactly this; fix the sign on the
sheet). Also: cyclists print concludes "3.49 h" against its own 3.4796
line (→3.48), and 1013.05 Q2's key $9.40 reuses the 1-d.p. root
(full-precision $9.42) — both kept as verified teaching notes in the DB.
**Tier A WAVE 4 DONE: 946 answers** (slices 0-3: 247, 4-7: 247,
8-b: 216, c-f: 236); backlog 12,914 → 6,785 = **47.5% of the gap
closed**; per-slice remaining 1,626 / 1,673 / 1,706 / 1,780. End-of-wave
doubled-apostrophe sweep across ALL stored answers: clean (only 2 hits,
both legitimate $f''$/$B''$ double-primes). Process rules for future
waves: fetch at **OFFSET 0 always** (answered rows leave the pool; any
nonzero offset silently skips unprocessed rows — two agents proved and
self-repaired this); apostrophe SQL ratio is `''` → one stored `'`; run
the `answer LIKE '%'||chr(39)||chr(39)||'%'` sweep at end of run.
**QB flag list additions (wave 4):**
- **Wrong solution↔question pairing**: 174a3181 (card-drawing stem,
  spinner solution) — new severity class: DB pairing bug, not a bad solve.
- Corrupted solution: 549b6daf (sign-flipped function, contradicted
  domain, negative "area", literal `\\sin` import artifact).
- New stubs: 15703230 (graph-reading, no values), d798815f, d5a352bc
  ("See sketch."), 97be2504, 97ce49ea.
- Suspect finals (solution contradicts its own working): 157ce613
  ((150,100,150) fails its own equations; (350,150,50) verified),
  163dd8b5, 16967eb6 (0.4775 vs deferred "printed 0.490"), 18c67c19
  (~$900 method disagreement + GC-table off-by-one), 196d3ef0 (integral
  89760/81 vs recomputed ≈10240/81), 546ffc52 (perimeter 10.3 vs
  components ≈12.3), d4bee214 (8/27 vs own 6/18=1/3), d63ae88a,
  d70cd3a0, d7f65872 (cm/m unit typo), 90079e1a (18 leaves vs "19
  students"), 9412f3b8 (iv), 94372819 (two valid methods 17.5 vs
  20.0 cm² — question data inconsistent), 97f95e7a (y=−9/40 vs −9/10
  both ways), 98feaaff (derived 7.95 km + stray "13.0 km").
- Low-confidence notes: 959db93d, 965d93a0 (finals unaffected).
- Partial extractions (one sub-part omitted as unreconcilable): 4255073d
  (a), 442835b8 (a).
**STOPPED here per Adrian ("don't launch new task")** — no wave 5, no
next review topic. Next in line when he says go: EM Coordinate Geometry
(26 units), then Circular Measure / Statistics / Circle Properties /
Real-World Context (24 each); Tier A wave 5 (4 slices, OFFSET-0 rule).

**2026-08-11 (later). ✅ TIER A COMPLETE — backlog 12,914 → 2.** Adrian:
"let's finish qb-enrich Tier A then you move on to Tier B." Between
sessions the main-Mac pipeline (new `qb-extractor`/`qb-verifier` agents +
parts[].answer rollup) had taken 6,785 → 740; this session's finishing
wave wrote the last **728** (slices 1235: 201, 679a: 247, bdef: 280/280).
The only 2 unanswered rows are permanent by design: 15703230 (graph-
reading, no values in source) and 549b6daf (corrupted solution) — prime
candidates for the one-time no-answer flag. **Blind verification gate
PASSED**: qb-verifier re-extracted 36 sampled rows (12 per wave-slice
group incl. 6 known parts-conflict rows + 12 rollup-era rows from hexes
0/4/8/c) without seeing stored answers → 36/36 equivalent, zero value
mismatches (809fe734 hand-verified after the verifier's table dropped
one row); rollup-era trap row 0dc9b13a stored correctly (2:3 from
working, not parts' wrong 2/5). **Systemic find: `parts[].answer`
metadata has a real error rate (~3–4% in the tail)** — 25 conflicts
catalogued across the finish wave where it contradicts the solution's
own working (signs, stale/copy-paste numbers incl. 5b97c904 whose BOTH
sub-answers belong to a different question, intermediate-vs-final,
missing roots); extraction always followed the shown working. Other new
flags: scratch-work/self-correction narrative baked into `solution` on
241e464a + 25b2eb62 (cleanup candidates); 8793f145-class rows (answer
exists ONLY as parts metadata, `solution` NULL — unverifiable, worth a
Tier-B-style backfill); doubled-apostrophe sweep allowlist (legit
multi-prime notation): ff7ad34d 06fb8f98 bf02f8fd 5fdc7130 5d1b404d
23ead986 a17903ad 619deb65 61afddb3 6385fb8c 63870216 78b6bf41. Write
practice going forward: dollar-quoted literals ($qb$…$qb$) beat
quote-doubling. **TIER B LAUNCHED (per the same mandate)**: pool is now
1,631 rows with neither solution nor answer (no-image) — **590 have an
EMPTY question stem** (unsolvable; stem-recovery backlog for a separate
pass), leaving 1,041 solvable: JC2 433, S3_EM_NA 178, AM 131, JC1 109,
S2 64, S1 51, EM 30, EM_NA 27, S3_AM 13, S3_EM 5. Wave 1 = calibration,
3 agents × 40 (AM / EM-family / S3_EM_NA), strong model, MANDATORY
sympy verification of every final value before writing, empty-guarded
`SET solution=…, answer=…`, `verified`/`ai_generated` untouched.
**Tier B WAVE 1 DONE — 122 solutions, 511/511 independent sympy checks
passed FIRST attempt, 0 abandoned.** AM 131→91 (40 written), EM-family
75→33 (42), S3_EM_NA 178→138 (40). Skips: 3 pure ruler-and-compass
constructions (0444367f, 1d486492, 90dc38a8 — answers are measurements
off a drawing; join the no-answer-flag class), 1 truncated stem
(569ca688 — the steak-doneness table was cut out of question_text),
2 deferred linear-law graph-reads (6d35584c, 751accf8 — constants read
off a best-fit line; next wave, deliberately). Metadata answer-field
errors caught + corrected in written rows: 2a248e9c (answer field says
a=−7,b=1 which fails its own f(2)=−1 condition; verified a=−1,b=−5 —
metadata's own solution text agrees), 56302dba (13 h, not "14 h nearest
hour" for t=13.409), 860171f1 (5 h 25 min, not 26). QB flags: exact
duplicate pair 58d9a67e ≡ 1ef0d732; linear-law answers now carry
explicit accept-ranges (least-squares-verified). Pattern: many Tier-B
rows carry FULL parts[].solution/answer metadata that was never rolled
up to row level — Tier B is independent-derive-then-cross-check, which
is exactly why the pass rate is clean. **Wave 2 launched (4 agents):**
JC2 split by id-hex 0–7 / 8–f (~433 pool, H2 register), AM remainder
(91), S3_EM_NA remainder (138), ~60 rows each; easy fronts handed over
(58d9a67e dup-copy-after-verify, 58ee8dc4, 41923752, 430a1674).
**Tier B WAVE 2 DONE — 271 solutions** (JC2 0–7: 60, JC2 8–f: 60,
AM: 80, S3_EM_NA: 71); **cumulative 393/1,041 solvable (38%)**, ~1,160
machine checks this wave, zero unverified writes, zero redo failures.
New PERMANENT skip: 70f282b7 (stem inconsistent — its point P(π/3,π)
is provably not on its own curve; the two plausible repairs give
different exact areas, so any write would be a guess). Metadata
answer-field catalogue grew (answer field wrong, own solution text
right): 234e08e0 (asymptote range omits a≠0, a≠½ degenerate exclusions
INSIDE the claimed range), 978b6bdd (n=3 not 2), 85cec175 (r=0.9678),
7677438c (k=0.16), aedfdc30 (185/6 not 305/12; distance 26 not 13 —
"tangent" claim false), ca2be398 (2/3 not 4/3), 860171f1 (5h25min);
plus a GC-display-precision slop class (intermediates off, finals
unchanged: 8fabf0ee, 9a8c0459, 9c649f06, 03f71c56, 08bc7574, 0cd338f7,
1fd4f0d1). DUPES for a dedupe decision: 58d9a67e ≡ 1ef0d732 (both now
written, identical results), 911a68e6 ≡ 949ec092, f62f467f ≈ a7841394.
Off-syllabus flag: 16298e26 uses Poisson (pre-9758 syllabus). Ops
lessons: a watchdog-stalled agent resumes cleanly via message (45 rows
were already banked; empty-guards make re-runs safe); a write whose
HTTP response dies (ERR_NAME_NOT_RESOLVED) may still have COMMITTED —
verify before re-issuing. **Wave 3 launched (5 agents):** JC2 0–7
(143), JC2 8–f (170), JC1 (109, first-year register), S1+S2 (115,
lower-sec register), Sec mop-up (AM front 9 + EM-family 33 + S3_EM_NA
67 incl. the 5 big graph-paper items + the 2 deferred linear-law
rows).
**Tier B WAVE 3 DONE — 402 solutions** (S1+S2 89, Sec mop-up 106 —
**ALL Sec-level pools now cleared** (AM/EM/EM_NA/S3_* at 0 solvable
minus 5 permanent skips), JC1 75, JC2 0–7 72, JC2 8–f 60); cumulative
**795/1,041 solvable (76%)**, ~1,460 machine checks, zero unverified
writes. Survived a 1:30pm session-limit kill mid-wave: 3 agents
resumed cleanly via message (all writes were already banked —
empty-guards + incremental writes made the kill lossless); one
twice-stalled agent delivered its full report on a report-only resume.
New metadata-error species this wave: missing-boundary inequalities
(1a66b9b3 λ≤1, 11d80c4a a≤−2), strict-not-weak at a self-intersection
node (35cd50ec), k=0-variant answer on a k=1 question (23709a9f),
radian-mode artifact on an EM angle (b6159f34 → 101.5°), key constant
failing its own simultaneous equations (bc6782cb c=33 not 23),
internally inconsistent linear-law key trio (e3bd30a0), class mean
72.3 not 72.5 (a77bef18). QUESTION defect: be82852a — constraints
algebraically dependent, (m,n) underdetermined; family derived, scheme
member stated. New exact dupes: 370299bd ≡ 24b7dd83, c19aed2d ≡
c253498d (latter pair still unwritten). Pattern to police: the solver
occasionally leaks self-correction narration into stored text — six
cases this wave, ALL self-caught + patched (becfa355, 56cfb836,
6881a205, 23709a9f, 459fcebd, a9ae2e7b); wave-4 prompts add a
pre-write clean-prose scan, and an end-of-tier artifact sweep over
every Tier-B solution is queued. **Wave 4 (the closer) launched:**
JC2 0–7 finish (71), JC2 8–f (~70; its batch-5 15 rows are already
machine-verified — script at scratchpad tierb-jc2b3/verify_b5.py),
JC1 finish (34) + S1+S2 finish (26, skip construction 30d3669b,
verify-then-skip f99feee1).

**2026-08-11 (evening). ✅ TIER B COMPLETE — 1,032 of 1,041 solvable
rows written; the 9 that remain are ALL documented permanent skips.**
Wave 4 + final batch: JC1+S1+S2 57 (S2 zeroed; f99feee1 confirmed a
construction), JC2 0–7 71 (slice to ZERO, zero skips), JC2 8–f 74 + 35
(slice to its one truncated row). Tier totals: **~4,000 machine checks
(sympy/scipy/numpy/brute-force enumeration incl. full 9!-and-larger
permutation sweeps), zero unverified writes, zero redo-then-abandon
math failures.** Permanent-skip residue (the no-answer-flag list):
truncated/defective stems 569ca688, 70f282b7 (point not on own curve),
b0a2bfb1 (undefined Q,T), cee564b0 (lost OX/OY relations); pure
constructions 30d3669b, f99feee1, 0444367f, 1d486492, 90dc38a8.
Late-wave metadata catches: 6e9b1e0a (0.00592 not 0.00185 —
copy-pasted from another part), 7f04dd4b (dimensionally-wrong plane
equation), cd4cb46d (missing negative branch of |k|>√2/2), e00ad215
(sketch TP (4.43,1.66)), ee42d20a (k∈ℤ vs its own solution's ℤ⁺ —
verified all ℤ). Question defects documented: cc5b9658 (asks re^iθ,
r>0 but a root is 0), be82852a (underdetermined (m,n)), 51c6d0ff
(odd "continues along the normal" convention — followed, parts only
cohere that way). **End-of-tier artifact sweep** (narration words /
CJK / $qb$ residue over ALL solutions): 11 hits, NONE written this
session (verified against every wave's write list) — they are
older-ingestion LLM solutions with visible self-correction narration,
some reconciling against keys mid-prose: 68125588, 72e4616b, c5af1553,
78ab7e27, 4255073d, 8b264ea6, 93a24612, 6b5118e8, ba91fbe7, 241e464a,
25b2eb62 → queued as a later solution-hygiene pass (each reaches a
defensible conclusion; needs care, not bulk edits). Off-syllabus rows
flagged: 16298e26 (Poisson), 6fb5fbff (Newton-Raphson). Dupes for
dedupe decision: 58d9a67e≡1ef0d732, 911a68e6≡949ec092, 370299bd≡
24b7dd83, c19aed2d≡c253498d, f62f467f≈a7841394. The 590 EMPTY-STEM
no-solution rows remain a separate stem-recovery backlog (nothing to
solve from).

**2026-08-11 (night). QB FLAG-LIST DECISIONS EXECUTED (Adrian's calls):**
**#1 parts-metadata errors FIXED** — 46 rows surgically corrected in the
`parts` JSON (every value independently re-verified before writing;
md5-guarded; parts column only), plus 3 adjudications: dad242d7 circle
centre is (0,13/2) — sympy circumcircle proof — answer+solution+parts
all aligned; e550e3f7 is 5.76 cm²/s (5.77 came from a pre-rounded
radius); 9c3654f9 re-adjudicated — the fix agent correctly REFUSED the
catalogued 31995 (the stored working's own expression evaluates to
31996.7, and exact m=ln20/12 gives exactly 80·20²=32000) → solution
rewritten exact, answer (c)=32000. Follow-ups found by the agents and
fixed: e10af72e (c) roots are −2, 7/2, 5 (answer+parts had 1/2; own
solution factors (x−5)(x+2)(2x−7) and (b) computes f(½)=67.5≠0);
f0fc860f (a) stem typo "A=3s²"→"A=3x³". One report-only leftover:
e00ad215's wrong TP exists only inside a deliberate erratum note (fine);
85cec175 (iv)'s printed a/b are QUESTION data (left; the false printed
step's over-rounded ū was fixed).
**#2 duplicates SOFT-DELETED** — 1ef0d732, a7841394, 949ec092, 24b7dd83,
c253498d (kept the recent/richer copy; for the Boon-Lay-reused-Montfort
pairs the Boon Lay 2025 copies were kept so school-exclusion still
protects current Boon Lay students).
**#3 defective stems REPAIRED FROM SOURCE PDFs** (archive:
Dropbox/1 ONLINE LESSONS/3 Exam Papers/): 4 repaired + solved —
70f282b7 (defect confirmed IN the KCP 2023 print; solved as intended,
area 361π²/108, note in solution), 569ca688 (doneness table restored —
⚠ archive file is misspelled "AM PRELIM 2023 Monfort.pdf"; 63°C
confirmed; stored per-part numeric slips also patched), b0a2bfb1 (SRJC
print itself never defines Q,T — coordinates recovered from the
school's printed mark scheme, labeled as reconstruction; solved i–vi),
cee564b0 (AJC OX/OY relations recovered from the kiasu scan; 143.1°
reproduces). 2 confirmed defects in the original prints, left as-is
with documented flaws: be82852a (YJC — (m,n) genuinely
underdetermined), cc5b9658 (NYJC — re^iθ, r>0 vs root 0).
**Tier B census upgraded: 1,036/1,041 — the only unsolved rows are the
5 ruler-and-compass constructions.**
**#4 off-syllabus rows**: ignored per Adrian (16298e26 Poisson,
6fb5fbff Newton-Raphson stay as solved+flagged).
**#5 stem recovery (590 empty stems)**: rows carry `question_number` +
`source_file` → deterministic lookup. Recommended + agreed design:
Sonnet agents transcribe per-paper (cheap), then the standard
Fable-tier Tier-B solve wave doubles as stem validation. NOT yet
launched — awaiting Adrian's go.

## 4. Build /admin/prelim-builder (layer 2 of the prelim plan)

> ✅ **DONE (2026-08-10/11, second-Mac session)** — API + UI + paper_drafts
> + per-slot pin/swap/reroll + /setter-pass skill + PDF export + admin-hub
> tile, all e2e-verified on the preview. Kept below for design context only.

Deterministic, no model calls: a TS API route ports the skill's slot-walk
(read data/paper-blueprints.json + preset overlays; QB queries with
school-exclusion, year/school spread, embedding near-dup guard; land total
exactly) + a builder UI with pin / swap / reroll per slot, draft persistence
(new Supabase table, e.g. paper_drafts), PDF export via the existing
Puppeteer pipeline (lib getBrowser()). Admin-auth like other /admin pages.
Hybrid flow: drafts are readable by a Claude session ("run the setter pass
on draft N" → swaps written back via MCP). API-powered in-product setter
pass is deliberately deferred.

## 5. Promote to prod — ONLY on Adrian's explicit "promote" / "ship it"

Eight new /tools pages + cards are on dev (verified on
adrianmath-dev.vercel.app). Standard promote per CLAUDE.md:
`git checkout main && git merge --ff-only dev && git push origin main && git checkout dev`

## 6. Small chores (low priority)

- `learning_units.unit_order` is float4 — UIs rounding to 2dp can display
  phantom ties. Consider migrating to numeric (display-only issue today).
- Repo-wide " 2"/" 3" duplicate files (Finder/sync artifact, ~100 untracked
  files incl. copies of the new tools) — ask Adrian before deleting.
- Re-run /bleed-table after the next batch of marking; re-check tool/topic
  priorities against it.
- Blueprint refresh after QB growth: `node scripts/derive-paper-blueprints.mjs
  --save-dump` (needs SUPABASE env) — see script header.
