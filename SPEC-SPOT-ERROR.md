# 🔍 Spot the error — from real marked mistakes (4 Nov 2026)

Adrian, 4 Nov 2026, after a talk on learning broadly and then practising recovering from
mistakes: *"we need to build this"* (spot the error from real marked mistakes) and *"build this
too (lesser priority)"* (spacing + explain-in-your-own-words), then *"Yes, start it"*.

## 1. What it is
A card shows a question and someone's working, one line at a time. The student taps the line
they think is wrong, then sees which line it was, **why**, and the **fix**. It reuses the
`autopsy` learning unit (`src/lib/learn-types.ts`) — the format the hand-written cards already
use — so every place that shows autopsy units shows these too.

## 2. Where the mistakes come from — and privacy
- `paper_marking_runs.result_json`: per-line verdicts (`results[].marking_output.lines[]`), the
  kind (`error_type`, or Adrian's `triage_override.error_kind`), the marker's correction.
- `scripts/spot-error/harvest.mts` → `lib/spot-error.ts briefsFromRun`: maths runs only, not
  superseded; exactly ONE wrong line that is not a knock-on; 3–8 typed lines; no sketches; kinds
  concept / careless / sign / arithmetic / transfer / rounding. Ranked most-frequent kind first,
  spread across topics. **Never reads photos, student columns or notes**; a brief carries only an
  opaque key (hash of run + question), never the run id.
- Every card is **re-written** by an author agent: new numbers, new setting, new wording, the same
  mistake. `noveltyProblems` refuses a copied line, a reused distinctive number (anything but small
  integers and round figures) or 7 copied words in a row. A fresh Opus agent re-solves every card
  before it is saved. Runbook: `.claude/skills/spot-the-error/SKILL.md`.
- **Privacy page:** it says we use a child's work "to make our teaching and marking better".
  Re-written examples shown to other students fit that, but are not spelled out — recommended
  extra line (needs Adrian's yes, and a POLICY_VERSION bump if added): *"We may turn a common
  mistake into a practice example for other students — always re-written with new numbers and a
  new question, never your child's own work, name or handwriting."*

## 3. Approval — nothing reaches a student first
- `scripts/spot-error/insert-drafts.mts` saves cards as `learning_units` rows, `kind 'autopsy'`,
  `status 'pending'`, `payload.origin 'spot-error'` (+ `source`, `error_kind`, `key`), at the end
  of their topic.
- **`/admin/spot-error`** (+ `/api/admin/spot-error`, admin only): Waiting / Approved / Rejected,
  each card drawn with the student component, opened fully. Approve / Reject / Back to waiting.
- The /notes "approve all" button skips these cards (`/api/admin/notes-units` approve-topic).

## 4. Where students meet them (only once approved)
- Wherever autopsy units already show: the /notes topic recap (`NOTES_OPEN_TO_STUDENTS`, closed)
  and the Learn player (`LEARN_OPEN_TO_STUDENTS`, closed).
- **My Notebook** (`/app/my-notes`): a live mistake gets a "🔍 Spot this mistake" chip when an
  approved card has the same kind, a level the paper reaches (`pickSpotUnit`: A Math → AM/EM/S2/S1,
  E Math → EM/S2/S1, H2 → JC/AM/EM) — a shared topic word first. It opens `/app/spot/<id>`
  (`components/SpotErrorCard.tsx`, tap a line → reveal). Behind **`SPOT_ERROR_OPEN_TO_STUDENTS`**
  (closed): Adrian's admin cookie and the preview student only.

## 5. Real-world cards
Hand-made, `source 'real-world'`, EM / Math In Real World Context. First three (4 Nov 2026):
a video's "3,000 cars a year × 10,000 parts = 30 million parts **every day**" (it is a year —
about 82,000 a day); "$16,000 profit on $25,000 revenue is about 50%" (64%); "$20,000 a month =
$120,000 a year" ($240,000).

## 6. Phase 2 — make it stick
- **One more look after 30 days** (`lib/notebook.ts COMEBACK_AFTER_DAYS`): the error notebook
  (`/app/notebook`) used to forget an entry once it was conquered (2 right in a row). Now
  conquering books ONE comeback 30 days later; it shows with the due cards, tagged "one more look".
  Right → done for good; wrong → live again on the 3-day clock. Intervals: 3 days after a wrong
  try, 7 after a right one, archive after 2 right, then 30 days once. Entries conquered before
  4 Nov 2026 have no date and never come back.
- **🧠 Explain it back** on Notebook re-attempts: after any re-attempt, an optional box — "In one
  sentence: when or why do you use this method?" — judged by the same judge as the Learn units
  (`lib/explain-judge.ts`), only against that entry's twin question, answer, worked solution and
  the marker's note. One judged sentence per re-attempt (stored on the attempt). Never blocks.
  The notebook page itself is behind the marking-only beta (`fullPortalVisible`).
