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
Running total 227 units, 73 APPROVE / 154 FIX / 0 REJECT. Next:
Integration (Area) 12 in flight; then Incr/Decr 8, Definite 5, then the
83-unit check-only tail (proposal: one batched 3-agent sweep). ⚠ unit_order "ties" seen via ::numeric casts are
PHANTOM — float4 renders 6 sig figs there; compare `unit_order::float8` or
GROUP BY unit_order HAVING count(*)>1. Trig (Identities) block 2 was never
actually collided; no ordering fix needed there.

## 4. Build /admin/prelim-builder (layer 2 of the prelim plan)

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
