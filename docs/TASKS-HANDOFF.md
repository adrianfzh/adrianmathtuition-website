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
