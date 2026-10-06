# Hand-over — re-crop the science figures that swallowed the whole question

Written 7 Oct 2026 (00:10 SGT) at the end of a very long session. Adrian said **"yes"** to
building this, and to starting it in a fresh session. Talk to him in plain, short words.
Read `docs/FIGURES.md` first (mandatory — the claim protocol and the traps), then this.

## The problem, in numbers (counted 6 Oct 2026, science project `figure_flags`)

| | rows |
|---|---|
| science figure flags held or open (each HIDES its question from students) | 1,353 held + 65 open |
| `foreign · cosmetic` | 849 |
| …of which the crop holds the whole question (number, prose, options) | **806** |
| …of which stray labels / page furniture | 35 |
| `incomplete · blocks-answering` (part of the figure cut off — a different job) | 324 |
| `incomplete · cosmetic` | 100 |
| `wrong-figure · blocks-answering` (open) | 59 |
| `watermark · cosmetic` | 42 |

The 806 came from the figure sweep of 4 Oct 2026. Their notes read like *"ripple tank … whole
and agrees; question number 25, prose and options A–D are inside the frame"*. The figure is
RIGHT and COMPLETE; the crop is just too big. A science image question is served only once its
row is `clean` (`ScienceLane.tsx` header), so ~800 good questions are invisible for a cosmetic
reason. Adrian must not be asked to judge 849 cards by hand.

## What Adrian agreed to (his "yes" was to these five rules)

1. Cut the picture down to the diagram only — drop the question number and the printed
   sentences (the app shows the question as typed text).
2. **Keep the options when the options are pictures** (e.g. Zhonghua Physics 2025 Prelim P1 Q2:
   a v–t graph, then four displacement–time graphs A–D — the student needs those).
3. Refuse anything that shows a school's name, crest, footer or an "internal circulation"
   line (at least one of the 806 does) — those stay hidden. Never scrub a mark
   (`docs/CONTENT-POLICY.md` rule 3).
4. Keep the original every time, so any re-crop can be undone (`figure_clean_log` is the revert
   ledger on the maths side — check what the science project has and mirror it).
5. Put each new crop through the same five-point fitness check; a pass releases the question by
   itself, a fail stays on Adrian's list.

## Where to look before designing

- `docs/FIGURES.md` — §claim protocol, §4 "Ingestion gate + nightly catch-up", the held/open
  semantics (the serving RPCs exclude a question on any `open` row).
- `src/app/admin/figures-bank/ScienceLane.tsx` + `src/app/api/admin/figures-bank/route.ts` — how
  the science lane reads the SCIENCE project's `figure_flags` and what Accept / Keep hidden /
  Repair write.
- `src/lib/figure-blemish.ts` — the existing "where is the foreign mark" judge (a box on a
  0–1000 grid) and the Clean flow that erases inside a box. A re-crop is the inverse: ask for
  the box that HOLDS the figure(s) (and the option figures), crop to it, verify nothing of the
  figure was lost. Reuse its verify-after pattern.
- `src/lib/figure-flag-release.ts` — the verdict / severity words and when a flag may be released.
- Bot `worker/fly/figfit` + `jobs.sh` `figure-fitness` (03:10) — the nightly judge; a new worker
  job needs a switch (`lib/worker-jobs.ts`, a test fails otherwise) and a `JOB_RHYTHMS` line.
- The worker is now **1 dedicated CPU / 4 GB, at most 3 lanes** (`fly.worker.toml`). Image work
  spikes memory: one figure at a time, and watch for OOM kills (no swap).

## Suggested shape (the new session decides)

1. A dry run on 30 of the 806 first: the box, the cropped result, and the fitness verdict, as a
   contact sheet for Adrian (he likes to see a sample, not a spec).
2. Then the batch on the worker at night, claim protocol from FIGURES.md, originals kept,
   `job_runs` stamp, one Telegram line with the counts when a night ends.
3. Report: how many released, how many refused for a school mark, how many still held.

## Other open items from the same session (not part of this job)

- **The figures page shows "? · ?" and no picture for science rows on the Fitness lane** (it looks
  them up in the maths bank). Adrian was asked whether to fix; no answer yet.
- **Twins that draw the answer:** 5 of the 8 open maths figure flags are our own twins where the
  question says "sketch …" and the figure already shows it (two written 6 Oct). Blocked from
  students, but the twin author should not draw a figure the question asks the student to draw.
  Offered; no answer yet.
- **Promote pending:** `/api/cron/embed-index` (nightly bank index top-up, 02:40 SGT), the Formats
  page and English practice (both closed) are on `dev` only. The cron fires only after a promote.
- **English practice** (`SPEC-ENGLISH-PRACTICE.md`) is built and CLOSED; opening it is a
  content-policy decision Adrian has not made. A proper bench is still owed.
- **Qwen (replace Gemini):** the model is downloaded; a helper is running the untrained test on
  the 60 gold pages — results in `~/paused-work-2026-10-05/linedet/qwen/RESULTS.md`. No training
  without Adrian's word.
- **Worker:** twins + science twins ON, extraction queue empty, 3 lanes. When twins have caught
  up, the old shared machine is fine again (`docs/HANDOFF-2026-10-06.md`).
- Maths bank: 8,955 stored figures have not been through the fitness check yet; 443 questions
  say they have a figure but none is stored (the nightly sweeps work through both).
