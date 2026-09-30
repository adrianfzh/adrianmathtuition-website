# Handoff — side-by-side cases in solutions (30 Sep 2026)

Paste the block below into a new Claude Code session opened in
`~/dev/adrianmathtuition-website` (a second session uses `~/dev/adrianmathtuition-website-2`).

```
Build the second half of Adrian's "cases side by side" layout for worked solutions.
Read CLAUDE.md first (dev-first push policy, readability rule, shared-checkout rule).

WHAT ADRIAN WANTS (26 Sep 2026, on a trig R-formula sheet):
- Two cases share a row:            sin x = 1   or   sin x = 1/6
- The NEXT row carries both branches: x = 90°   basic angle = sin⁻¹(1/6)
  The finished case sits on the left; the case still being worked owns the "=" column.
- Continuation rows under that hang under the "=":   = 9.594°
                                                      = 9.6°, 170.4°
- Reasons go grey at the right of the row ("← sin positive → 1st and 2nd quadrants").
- The ∴ line (∴ x = 9.6°, 90°, 170.4°) sits at the left, below the block.
- The basic-angle working goes BELOW the equation it belongs to, never beside it.

WHAT IS ALREADY BUILT (on dev only, not on main yet — commit 4b40f8dc and after):
- src/lib/solution-readability.ts → stepRows() and alignView() line equations up on "=".
  "… or $x = …$" already stays on one row (it appends \quad\text{or}\quad to the rhs).
- Used by src/lib/render-solutions-pdf.ts (solutions PDF) and
  src/components/SolutionText.tsx (the app). Tests: src/lib/solution-readability.test.ts.

WHAT IS NOT BUILT:
1. The row AFTER an "or" row: when the next step solves both cases, put both
   branches on one row — the case that is finished (e.g. x = 90°) on the left, the case
   still being worked (basic angle = …) in the aligned "=" column, and its following
   continuation rows under it.
2. Check scripts/gce-paper/export-docx.py (the Word export) does the same
   (OMML rows, one block per part, empty left side for continuation rows). Build it
   there too if it doesn't.

RULES:
- Pure functions in src/lib with tests in the sibling .test.ts; the stored text is never changed.
- Anything the layout can't be sure about stays a plain sentence (fail safe, like stepRows returning null).
- LOOK at the rendered result before calling it done: render a solutions PDF and the app
  page for a real trig question with two cases, and view them (screenshot / PDF page).
- npm test + typecheck, then commit and push to dev; after the preview build is READY,
  vercel alias set <url> adrianmath-dev.vercel.app. Do NOT promote to main — Adrian says when.
- Commit by pathspec; don't touch files you didn't change.
- Adrian wants short, plain replies.
```
