# Students first — one door for everything about a student

**Status:** agreed in conversation 17 Sep 2026, awaiting Adrian's go on the build order below.
**Written in plain words first; the code word follows in brackets so it can be found in the repo.**

## 1. Why

Adrian, 17 Sep 2026, after a week of building: *"I have to look at two interfaces for essentially the same thing — students' work — it is confusing … I would actually like the organisation to be students first — I would just look up a student, see what's pending, what's done — everything about the student."* And on the student profile page: *"able to better organise this as well? too much things going on, hard to understand."*

Today the same student's work is spread over four pages: the marking desk (`/admin/desk`), Mark a paper (`/admin/mark-paper`), the student profile (`/admin/students/[id]`) and the mirror of their app (`/admin/students/[id]/app`). Each was right when built. Together they make Adrian hop.

This spec continues the 13 Sep plan of "four doors by question" (desk · student · schedule · ops). It changes one thing in that plan: **the student door becomes the main one**, and the desk becomes the sweep for the days he wants to look across everyone.

## 2. The one door: the student profile

Open a student and everything is there, in four tabs.

| Tab | Answers | What is on it |
|---|---|---|
| **Overview** | "Who is this and how are they doing?" | Level, subjects, next lesson, attendance, last exam. The three score lines (one per subject, the sparkline). The two or three weakest topics. The "Send something to do" button. |
| **Papers** | "What have they handed in, what came back, what is still with them?" | **Exactly the student's own Papers tab**, drawn by the same code (`lib/student-app-view.ts` → the same rules as `/app/marking`). Each card: the paper, its score, the Practice Again sheet inside the card with its state (done · handed in · not done yet). Adrian's extra lines fold under each card (see §3). |
| **Work** | "What did I send them, what did they ask for?" | From Adrian (assigned work), pages sent, Find-a-question items, essays. |
| **Billing & slots** | "What do they pay and when do they come?" | Unchanged from today. |

**Actions move into one "…" menu** at the top right (Portal invite · Portal link · Holiday opt-out · Discontinue). The row of nine buttons under the profile goes. Show contact and Ask for review stay as the two visible buttons because they are used weekly.

## 3. The Papers tab is the mirror

The separate mirror page ("Their app, as they see it") is retired by redirect to the profile's Papers tab. The rule Adrian set: *"my interface should be exactly how they see it."*

What the student cannot see, Adrian still needs. It sits **under each card, folded**, in this order:

- who asked for the sheet (student's request · Adrian's tick · the merged batch) and the writer's stage (queued · being written · with Adrian · released)
- a sheet the student has not handed in — **shown on the card, not as a pending state** (Adrian: "sheets not handed in, just be able to view at the card level")
- held or withdrawn sheets, superseded markings, papers hidden by the subject gate
- the marking receipt: pages, who read them (Mac or API), what it cost, the watch-outs
- the buttons: open on the desk · re-mark · queue a sheet · rebuild the copy

"On the shelf" as its own box on the profile goes. The shelf is a property of one sheet (the gaps the writer left out for next time, with the marks they cost), so it belongs as one line under that sheet, which the card already carries.

## 4. Discontinue: out of the way, and reversible

Discontinue moves into the "…" menu. It keeps its confirmation (date, reason). It becomes reversible: the action records what it ended and removed (enrolments ended, lessons deleted, invoices voided) in one row (`student_discontinue_log`), and the profile of a discontinued student shows one **Reinstate** button that puts the enrolments back, re-creates the deleted future lessons from the recorded list, and un-voids nothing (money stays a human decision, shown as a note).

## 5. The desk after this

The desk stays for the across-students sweep: the four lanes, the tick for a merged sheet, Approve & release, the calibration numbers. Two changes from the 13 Sep plan still apply: **Mark a paper becomes a button** on the desk and on the profile (the page behind it stays until nothing else links to it), and the switches (Mac plan only · Science tab · slot accounts) move into a Settings drawer off the desk header. Every row on the desk links to the student's Papers tab, so the desk is the list and the profile is the detail.

## 6. What is already done on the student side (17 Sep 2026)

| Agreed | State |
|---|---|
| A Math \| E Math tabs, one compact row per paper, the sheet as one coloured done / not-done line, "compulsory" gone, sparkline | live on production |
| "Work on next" moved to My Notebook's Mistakes view as one "Weakest topics" line | on the preview site |
| Rename a paper (the student's label; Adrian's name stays on every file) | on the preview site |
| Star a paper (starred first in its tab) | on the preview site |
| Archive a paper (leaves the list for a folded row at the foot; nothing deleted) | on the preview site |
| Search inside a tab (appears from eight papers) | on the preview site |
| My remark — the student's own remark on a paper, read by Adrian too (option 2) | on the preview site |
| Sorting | not built — the tabs, star and archive cover it with less to tap |
| Compare two papers by topic | not built — Adrian: "not useful" |
| The full typeset PDF | no longer drawn when the images copy exists; kept as the fallback for a paper with no annotated pages |
| Practice Again reminders | paused (`REMINDERS_PAUSED`) |

## 7. Review my mistakes (replaces the "this exam" band)

Adrian: *"allow them to select the papers, then all their errors will immediately show, then they can scroll through them as cards, and have an option to go to the exact question in the paper."*

**When it shows (Adrian, 17 Sep 2026: "should open up 5 days before students' exams, and make sure it can be clearly seen").** From five days before an exam keyed in Airtable until the exam day, the subject's tab opens with a full-width coloured band at the very top: "E Math exam on Tuesday — Review my mistakes ›", with the papers on the exam's topics already ticked. Outside that window the button sits at the foot of the tab, plain.

**What the student does.** On the Papers tab a button, **Review my mistakes**. It opens a tick list of their papers in that subject (the same list the merged-sheet tick uses). They tick two or three papers, or "all my E Math papers", and tap Review.

**What they see.** One card per question that lost marks, across the ticked papers, newest paper first, biggest loss first inside a paper. Each card: which paper and question, the printed question, the marks (3/8), the marker's comment in Adrian's voice, the "why" label (the error kind), a folded worked solution, and a **Practise this** link. They scroll the cards one at a time (the swipe deck the worked-example player already has).

**"See it on my paper."** Each card has that button. It opens the paper's page **already scrolled to the mistake itself**, not just the page: the marker records where on the page it inked each question (`annotation_debug` boxes, as fractions of the page), so the app lands with that box in the middle of the screen and a soft highlight around it for two seconds. No scrolling by the student. Only for a question the marker inked without recording a box (older papers) does it land at the top of that page instead.

**How it is built.** No new data. The wrong-question list per paper is what "Where you lost marks" shows today (`StudentPaper.dropped`, `lib/portal-marking.ts`). The page is one route (`/app/marking/review?papers=a,b,c`), a server component that loads the ticked papers (the same released + ownership + subject rules as the list), flattens the dropped questions into cards (a pure, tested function `lib/review-cards.ts`), and hands them to the swipe deck. The jump is an anchor on the paper page (`#page-N`) plus a small client piece that reads the box from the URL and draws the highlight. Also reachable from the Notebook's Mistakes view and from "Before the paper" (ticks pre-filled with the papers on the exam's topics).

**Time.** One evening for the cards and the tick list, one for the jump-and-highlight.

## 8. Build order, each step usable on its own

1. **Profile tabs and the "…" menu** (one evening). **BUILT 17 Sep 2026** — four tabs, the Papers tab is `papers-view` with admin on (tick + search included), the mirror redirects. Nothing removed; the mirror page becomes the Papers tab; the old URL redirects.
2. **Adrian's folded lines under each card** (one evening). The mirror's hidden state moves in.
3. **Reinstate for Discontinue** (half an evening; a log table + one button).
4. **Review my mistakes** (two evenings, §7).
5. **Desk: Mark a paper button + Settings drawer** (one evening). The old pages redirect.

Each step ships to the preview first and Adrian looks at it as himself and as a student (the demo student) before it is promoted.

## 9. What stays human

The profile shows more, it decides nothing new. Releasing, overriding, reinstating and every parent-facing message still wait for Adrian's tap.

## 10. Open questions for Adrian

- On the Papers tab, should the search box and the tick list be shared with the student's own (yes, if "exactly how they see it" is the rule).
- Reinstate: put the lessons back into the same weekly slot if it is still free, or leave the slot for Adrian to choose.
- The Overview's "weakest topics": the same three the student sees in their Notebook, or a longer list for Adrian.

## 11. My remark — the student's remark on a paper (built 17 Sep 2026, option 2)

On the paper page, under the title, a quiet grey box "My remark" (Adrian: amber was "too striking for a remark") with the placeholder "What went wrong, what to remember next time…". It saves by itself when they pause typing. The first line shows in the Papers row under the date. Adrian reads it on his Papers tab as "their remark", so it is never mistaken for the marker's comment; the box says "Adrian can read this too" once something is written. A private thought belongs in the Notebook's private notes, which nobody else reads.

## 12. Doing work and writing on the marked copy, in the app

Adrian, 17 Sep 2026: *"mainly students should be able to do work on the app, and annotate on the marked copy … the original marked pdf itself should still be accessible."* He will get an Apple developer account.

**Status: use 1 (notes on a marked paper) and use 2 (doing a sheet in the app, `/app/work/[id]`) BUILT 17 Sep 2026 on the preview; the download-with-notes is next.**

**Two uses of one ink overlay** (the overlay Adrian already uses on `/admin/mark-paper`, `SPEC-ANNOTATE.md`, with its drafts and its Done that bakes ink into a copy):

1. **Notes on a marked paper.** The student writes on the marked pages in the app. Their ink is saved as **their own layer** (`student_ink`, one row per page, strokes as the overlay stores them), drawn on top of the marked page images. **The marked copy itself is never changed.** On the paper page a switch "Show my notes / Hide my notes" toggles the layer, and "Clear my notes" empties it after a confirm. The download offers both: "Marked copy" (the original) and "Marked copy with my notes" (flattened on request). No "clear to see the original" is ever needed, because the original is always there underneath.
2. **Doing a sheet or paper in the app.** An assigned sheet (Practice Again, From Adrian, a printed set) opens as pages in the app with the same overlay. Progress is saved every few seconds and on leaving (the overlay's draft store). A **Submit** button flattens the ink into the pages and hands them in through the existing hand-in door, so marking starts exactly as it does for a photographed paper. The student never leaves the app; the Preview-save-upload loop disappears.

**The native app, in order:**

1. **Enrol** (Adrian): Apple Developer Program, individual account, $99 a year. No D-U-N-S number needed for an individual. Takes a day or two to approve.
2. **The app itself** (one evening): the existing AdrianMarker shell (`ios-shell/`) generalised — a full-screen web view of the app with login that persists, the Pencil double-tap forwarded to the overlay (the one thing Safari cannot do), push notifications through the app, and a **share extension** so that AdrianMath appears in every app's share sheet: a PDF written on in Notability or Preview can be sent straight back to the app as a hand-in. That last piece is only possible with a native app and answers "save back to the portal when done editing elsewhere".
3. **TestFlight first** (a week): Adrian and three or four students install it from a link; no App Store review needed for a small tester list. This is where the Pencil feel is checked on real iPads.
4. **App Store** (one to two weeks of waiting): the review can reject a plain website wrapper ("minimum functionality"), so the listing leads with what is native: Pencil ink on marked work, offline drafts, push, the share extension. Everyone else installs from the store.
5. **Until then** the same features work in Safari, minus the Pencil double-tap, and students keep the "Open in…" and "Hand in" doors.

**Build time on the web side:** about three evenings for the two uses above, on top of the native shell. **What stays human:** nothing new is decided by the app; a submitted sheet goes into the same marking queue and the same release rule.
