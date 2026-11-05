# SPEC-PHOTO-QUALITY — "This looks blurry — retake?" (5 Nov 2026, Adrian: "Yes, build it")

## The problem

A blurry or dark photo used to be sent for an expensive read. We paid, the student waited,
and the answer was "can't read this".

## What happens now

The student's phone checks each photo the moment it is picked — plain pixel maths on a
canvas, instant, nothing downloaded, no AI. A clearly bad photo shows a card with the
photo and one plain line ("This photo looks blurry. Hold the phone steady and tap to
focus.") and two buttons:

- **Retake** — the photo is dropped; the student picks again.
- **Use anyway** — the photo is kept as if nothing happened. A false alarm never blocks.

A good photo passes with no card at all.

## Where it runs

| Screen | File | `source` |
|---|---|---|
| Practice — photo of working | `src/app/app/practice/practice-flow.tsx` (`handlePhotoPick`) | `practice` |
| Practice — "Photos in, a practice sheet out" | `src/app/app/practice/photo-client.tsx` | `practice-photo` |
| Paper hand-in (each photo; a PDF scan's pages are not checked) | `src/app/app/submit/submit-client.tsx` (`onPick`) | `handin` |
| Add pages to a hand-in | `src/app/app/submit/add-pages-client.tsx` | `add-pages` |
| Web chat photo button | `src/app/chat/page.tsx` | `web-chat` |
| App "Ask" photo button | `src/app/app/ask/ask-client.tsx` | `ask` |

Not checked: a pasted screenshot or a dragged-in file in the chat (desktop, always crisp),
the mark-scheme upload (a printed scheme, not the student's photo), admin screens.

## How it works

- `src/lib/photo-quality.ts` — `scoreGrey` / `judge` / `LIMITS` are the **same** as the bot's
  `lib/photo-quality.js` (bot repo, `docs/SOLVER.md` §Photo-quality check). **Change both
  together**; `src/lib/photo-quality.test.ts` pins the limits.
- `src/components/PhotoCheck.tsx` — `usePhotoCheck(source)` → `{ check(files) → kept files, card }`.
- Anything it cannot read (PDF, a HEIC the browser cannot decode) counts as fine.
- Measured: a greyscale copy, longest side 640 px. Sharpness = the |Laplacian| only the
  sharpest 0.5% of pixels reach. Flagged when: longest side < 200 px (`small`); mean grey
  < 40 with edges < 60 (`dark`); edges < 30 (`blurry`, or `bright` when mean > 235 and
  > 85% pure white).

## Limits — how they were set

758 real student photos from the web chat: **0 flagged** (least sharp scored 53; the limit
is 30). Blurred copies: 91–100% flagged. Darkened copies: 100%. Browser vs bot scores on
the same 50 photos: see the commit message of this change.

## Log

Every check (scores only, never the picture) → `POST /api/photo-check` → Supabase
`photo_quality_checks` (`source` = `web:<source>`, `ok`, `issues`, `scores`, `ms`,
`sent_anyway`). The bot writes the same table (`source` = `telegram`). Re-tune when the
share of flagged rows with `sent_anyway = true` climbs (false alarms → lower `blurEdge`).
