---
name: cloud-recrop
description: Re-crop the science figures whose crop holds the whole question, from a claude.ai CLOUD session with NO database key — through the AGENT_TOKEN_FIGURES door (/api/agent/recrop/*). The session's agents LOOK (where is the drawing → did the cut lose anything → is the new picture fit); the server cuts, stores the new picture beside the original and files it for Adrian. Nothing is released here. Use when Adrian says "re-crop the science figures", "run the re-crops", "carry on with the re-crops", "do 100 re-crops".
---

# Cloud re-crops — you look, the server cuts, Adrian releases

About 800 science figures are hidden from students because the stored picture is the whole
question (number, sentences, options) instead of the diagram alone. For each one this job
makes a tighter picture. **It never releases anything**: a figure that passes is filed as
ready, and Adrian looks at old beside new on `/admin/figures-bank?kind=recrop` and releases.

Background and the rules: `docs/FIGURES.md` §"✂️ Re-crops", `docs/CLOUD.md` §"Cloud re-crops".
The helper: `scripts/figure-recrop/cloud-door.mjs`. Needs `AGENT_TOKEN_FIGURES` in the
environment (never print it). If it is missing, stop and tell Adrian — do not look for
another key.

## The loop for ONE figure (three separate looks — keep them separate)

Each look is a FRESH agent that sees only its own brief and pictures. The agent that drew
the boxes must not be the one that checks the cut: it would see what it meant to keep, not
what the picture shows.

1. **Judge** — give an agent `judge.md` and `grid.png` from the figure's folder. It writes
   `verdict.json`: boxes to keep, boxes to drop, a school mark if any, or a refusal.
2. `node scripts/figure-recrop/cloud-door.mjs cut --run <folder>` — the server cuts.
   - "done: refused…" or "done: refused-school-mark…" → this figure is finished.
   - otherwise `new.png`, `verify.md` and `fitness.md` appear.
3. **Second look** — a fresh agent gets `verify.md`, `orig.png` and `new.png`, writes `check.json`.
4. **Fitness** — only when the check says `"ok": true`: a fresh agent gets `fitness.md` and
   `new.png`, writes `fitness.json`.
5. `node scripts/figure-recrop/cloud-door.mjs submit --run <folder>`
   - "done: …" → finished.
   - "again: …" → the first cut lost something. `judge.md` now carries the correction: a
     fresh judge writes a new `verdict.json`, then cut → second look → fitness → submit once
     more. The second result is final; there is no third cut.

## A batch

```bash
node scripts/figure-recrop/cloud-door.mjs queue --n 10 --out ./recrop-run
```

prints one folder per figure and how many are left. Work the folders in parallel (one small
agent per look; these are single-picture judgements — use the lighter model the session
offers for agents, per docs/FANOUT.md §9, and keep the main session to carrying files and
running the helper). Take the next ten when these are done. A figure handed out and not
finished within 90 minutes goes back in the queue by itself, so abandoning a folder is safe.

## Rules that are not yours to bend

- **A school's name, crest, an identifying footer or a paper code → `school_mark`.** The figure
  is refused and stays hidden. Never try to keep the mark out of the box instead.
- Plain furniture that names nobody ("[Turn over", "END OF PAPER", a bare page number) is
  dropped like a sentence and listed under `furniture`.
- Options stay only when they are PICTURES.
- When in doubt whether something belongs to the drawing, keep it. A clipped label fails the
  second look; a little extra margin does not.
- Do not edit a picture, do not call any other route, do not try to release.

## When you stop

Report once: how many finished and with what result (ready · held by the fitness check ·
refused for a school mark · refused · failed the check), how many are left, and anything
odd (a figure the door refused, a picture that would not load). Adrian reads the pictures
himself on the Re-crops tab — do not describe them to him.
