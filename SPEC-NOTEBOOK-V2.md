# SPEC — My Notebook v2: the student's own book

*Agreed with Adrian on the night of 10–11 Sep 2026. Source of truth for the Notebook
builds that follow; each item below says what is decided, what exists, and what
"done" looks like. Build order is §9. CLAUDE.md `app/my-notes/*` stays the map of
what has SHIPPED; this file is the plan.*

## 0. The frame (decided)

The Notebook is not a record the student looks at after a paper. It is **the
student's own book, and their assistant for maths**: everything they touch lands in it
by itself (asks, marked pages, practice, photos, notes, a line from Adrian), it
organises itself by skill and topic, it is searchable, and it talks back — what to do
this week, what to look at before a paper, one small nudge a day.

Two rules from the night it was agreed:

- **Opt-in, off by default, one switch per feature in Settings.** Adrian: the Save
  button, the countdown, and anything else that adds a control a student did not ask
  for. The switch lives in `portal_accounts.prefs` (`lib/portal-prefs.ts` whitelist).
- **The bot's own solutions come first.** A "how to" beside a question is the worked
  answer the student already has — the Ask answer, the Practice Again sheet's worked
  example, the marked paper's solution — never a generated method note in its place.
  Adrian's approved method templates are a later layer, not the first.

What was DROPPED the same night: Questions to retry (live a fortnight, 197 entries, no
student ever attempted one — the pull model does not work; see §7 for the push model).

## 1. Save an answer (opt-in) — BUILT 11 Sep 2026 for fresh Ask answers (Telegram button + restored turns still to do)

- **Where the button is.** Under every answer in the Ask tab; under the bot's Telegram
  answers as a reply button once the account is linked; on a practice question's
  solution; on a marked page (the clip tool already exists). One action, one place.
- **Only when switched on.** Settings → "Save answers to my notebook", off by default
  (`prefs.save_answers`). Off → no button anywhere.
- **What the student sees in the Notebook.** A "Saved answers" band. Cards are
  **grouped by topic** (the word a student knows — "Trigonometry"), each card **tagged
  with its skill** (small label — "R-formula", from `ask_skills`), and the student may
  **rename the card** in their own words; the skill stays as the filing tag. A card
  opens to the question (their photo or text) and the worked answer, maths rendered.
- **Keeps coming up links to them.** A skill line that has saved answers shows
  "3 saved answers" and opens that group.
- **Data.** `notebook_saves` (identity, kind `ask|practice|clip`, source id — the
  Questions row / attempt / run+page, skill, topic, title (student-editable), body,
  created_at). Private to the student. Done = a saved Ask answer appears under its
  topic within one page load, and the Telegram button lands in the same band.

## 2. "How I do it" — a card per skill (later layer)

One card per skill a student has fixed (mistake reached Fixed, or a Practice Again
sheet done). Front: skill name + "Fixed 4 Sep, after Prelim P1 Q7". Open: **the
worked solution they already have** (the bot's answer / the sheet's worked example /
the marked paper's solution — Adrian, 11 Sep: not the method templates first), **their
own correct working** clipped from the marked page or sheet, and **the slip they used
to make** (the red-pen comment from the paper that lost the marks).

**"Try one like this" — back in, on the Find rule (Adrian, 11 Sep 2026).** The old
door opened a bank twin picked by text similarity alone, which is why it could miss.
The card may carry the button only when a question passes the rule Find already uses
(`lib/portal-find.ts classifyFindCandidates`): same canonical topic AND the same
sub-group filing corroborated by two or more matches AND marks within one. **Where the
question comes from:** the question bank — school papers and TYS filed by topic and
sub-group, plus the generated Set papers — through the bot's embedding matches, and only
questions the serving gates allow (no originating-school leak, national papers are
grounding-only and never served — docs/CONTENT-POLICY.md). When nothing in the bank
passes the rule, Find's second path writes a "Made for you" question against the same
sub-group (the daily generate cap applies); when that fails too, no button.

Done = a student who fixed a mistake finds the card without doing anything.

## 3. Exam countdown at the top of Home (opt-in) — BUILDING FIRST

- The countdown card exists (`app/exam-countdown.tsx`, Airtable `Exams` — the WA3 /
  prelim rows Adrian keys in, with Tested Topics), hidden behind
  `EXAM_PREP_OPEN_TO_STUDENTS` because it is bundled with the timed set.
- **Decided:** a per-student switch, `prefs.exam_countdown`, off by default; when on
  the card sits at the **very top of Home**, above everything. Students never see the
  timed-set door on it while that stays admin-only.
- **One-time notice.** The next time a student with an upcoming exam opens Home and has
  never set the switch, one dismissible card says the countdown is available in
  Settings, with "Turn it on" (sets the pref) and "Not now" (`prefs.exam_countdown_notice_seen`).
  Shown once per account, never again.
- Done = switch on → card at the top; switch off → gone; notice appears once and only
  once; the admin "view as student" mode behaves like a student.

## 4. Before the paper (the exam-week page) — BUILT 11 Sep 2026

When an exam is within **5 days** (Adrian, 11 Sep 2026 — not a fortnight), the Notebook pins one card at the top that opens a
page composed from the tested topics: live mistakes in those topics, skills that keep
coming up, saved answers there, the formulas they have met in those topics (§5), and
Adrian's latest line (§6). This IS the study guide (see §10, NotebookLM). No exam
keyed → no card. Done = a student with WA3 keyed sees the page a fortnight before.

**BUILT 11 Sep 2026:** `/app/my-notes` pins one card per Exams row within `BEFORE_PAPER_DAYS` = 5 (`lib/before-paper.ts examsInWindow`); it opens `/app/my-notes/before/[examId]` — the tested topics as chips (grey when nothing in the book touches one), then ⚠️ live mistakes · 💬 keeps coming up · 💾 saved answers · 📷 photos and clippings in those topics (each row opens the stream with that item open), then the §5 formula sheet filtered to the exam's topics. The filing rule is `topicMatches` (pure/tested): same topic, a bracketed sub-topic of the exam's topic, a contained name; a bracketed qualifier is the specific part — two different qualifiers never match, and an exam topic with one needs the item to name it. Adrian's line (§6) joins when §6 is built. No switch: the card exists only in exam week.

## 5. The formula sheet that grows — BUILT 11 Sep 2026

Not the syllabus list. The formulas that have appeared in this student's marked papers,
asks and practice, with the ones misapplied marked. Rendered as a section of the
Notebook and as the formulas section of Before the paper — built once. Source:
`formula_ref` matched to the student's topics + the marker's error kinds.

**BUILT 11 Sep 2026:** `/app/my-notes/formulas` (the 📐 My formulas pill on the Notebook) and the formulas section of Before the paper share ONE component (`my-notes/formula-sheet.tsx`) over `lib/formula-sheet.ts` (pure/tested): the topics the student has MET come from the stream (`topicsMet` — mistakes, saves, photos, asks; how each was met is said), `formula_ref` lines come through the teaching-knowledge layer (`lib/formula-sheet-store.ts`; `formula_ref` files by AREA — Trig, Calculus, Indices/Logs, Coord geom, Algebra — so topics map to areas before the RPC call), each topic links to Adrian's `/formulas/*` page when one exists, and the marks: a live mistake whose title names a formula ("R-formula", "chain rule") flags that line ⚠ *This one cost marks*, any other live mistake in the topic flags the topic ⚠ *Marks lost here*. Only A Math has `formula_ref` rows today (20); E Math and H2 topics show their page link and "no lines filed yet" — file rows and they appear.

## 6. A line from Adrian

The admin log page already has two free-text boxes per lesson: what happened, and what
to do next time. Students never see them. **Decided:** a third, separate box, "note to
the student", written on the same page; it lands in the Notebook as "From Adrian ·
9 Sep" and, when Telegram is linked, as a message. The private boxes stay private.
Done = one line typed on the log page is on the student's Notebook before Adrian
leaves the room.

## 7. Search, photos, OCR, auto-tag, resurfacing (all agreed 11 Sep)

- **Search.** One box at the top of the Notebook. Finds the marker's comments on their
  papers, saved answers, clippings, photo text (after OCR), notes, method cards.
  Math-aware: "sin²x" and "sin^2 x" are the same thing — reuse `lib/notes-search.ts`.
- **Photos.** Already live: Notebook → My clippings & photos → ➕ Add a photo (camera or
  library, optional caption + topic). Adding: **OCR** (the words in the picture become
  searchable) and **auto-tag** (the topic and, where possible, the skill are guessed —
  the same classifier that files asks — so nothing must be typed).
- **Resurfacing — BUILT 11 Sep 2026, OPT-IN** (Adrian: "have a toggle for students to turn this on, default off"): one small card on Home a day, from the Notebook — a live mistake two days in three, else a saved answer or a read photo — with a line on why, opening the item in the stream. Deterministic per student per day, rotating. The 30-second question with a one-tap answer is the next layer; today the card opens the item.
- **No switch for these two.** Adrian, 11 Sep 2026: "OCR or resurfacing do not need a
  toggle, it's default for everyone." Only features that add a control (Save, the
  countdown, keeps-coming-up) are opt-in; reading a photo and one card a day are not.
- **OCR + auto-tag — BUILT 11 Sep 2026.** After a photo is saved, the website reads it
  once (`lib/photo-tag.ts`, Claude Haiku vision): the words on the page →
  `portal_notes.ocr_text` (search's raw material), the canonical topic it looks like →
  `auto_topic` (shown on the card, and copied into `topic` when the student left it
  blank), the bank sub-skill → `auto_skill`. Fail-soft and after the response — the
  photo never waits on the model.

## 8. Personal notes — highest privacy — BUILT 11 Sep 2026

Students may write their own notes in the Notebook (typed; a photo counts). **Rules:**
visible only to that student; no admin page, no "view as student" reveal of a real
student's notes, never in a parent digest or export to Adrian; not read by any AI
feature (search over them is local matching, "Ask my notebook" reads them only if the
student switches that on); in the student's own data export and deleted with the
account; stored in their own table with RLS on and no policies (service key only,
identity-filtered, the `portal_notes` pattern). Done = Adrian cannot find a student's
personal note anywhere in the admin.

**BUILT 11 Sep 2026:** "✍️ Write" beside the search box opens a composer; the note lands in the stream as its own kind (✍️, chip *My notes*, first line as the title), opens inline to edit or delete. Table `notebook_private_notes` (RLS on, no policies); readers are exactly two — `lib/notebook-load.ts` and `/api/portal/notebook/private-notes`, both keyed on the session's own identity. No admin page, no bearer path, no view-as door (the Notebook needs a student session; Adrian's view-as is his demo student's own book); not in `resurfaceCandidates`, not OCR'd, not auto-tagged; search over them is the client's own matching; in `/api/portal/export` (`private_notes`) and deleted by `delete-account`. Typed only for now — a photo note is the existing 📷 path.

## 9. The UI — one stream, not many bands — BUILT 11 Sep 2026 (search v1 = client-side over loaded items; iPad two-pane still to do)

The lesson from GoodNotes, Notability, OneNote and Apple Notes: shallow, a Recent view
as the real entry point, one search, nothing to file by hand.

- Top: the search box. Under it, in exam week, the Before-the-paper card.
- Then **one stream, newest first**, every item typed by a small icon: saved answer,
  marked page, photo, note, From Adrian, mistake fixed.
- Filter chips above the stream: All · Mistakes · Saved · Notes · Photos · From Adrian;
  topic chips as a second row.
- "Your mistakes" stays a band at the top only while it has live rows.
- Phone: one column. iPad: the stream on the left, the open item on the right.
- Settings holds the switches; nothing else is configured inside the Notebook.

## 10. Taken from NotebookLM

- **Answers with citations.** "Ask my notebook" answers only from the student's own
  material and shows where each line came from (this paper, that saved answer).
- **The study guide.** One tap builds the guide for the next exam from their sources —
  that is §4, generated, not hand-made.
- **The audio recap.** Three spoken minutes of their Notebook before a paper, made with
  the lessons' narration pipeline. For the bus, and a reason to come back.
- Not taken: podcast-style two hosts, mind maps, video overviews — novelty, not need.

## 11. The iPad loop through Apple Preview (agreed 11 Sep) — BUILT 11 Sep 2026

iPadOS 26 ships a real Preview app; students already open PDFs in it and write with the
Pencil. **Decided:** every PDF we produce (marked papers, Practice Again sheets, printed
papers) opens cleanly in Preview, and hand-in accepts a PDF that came back with Pencil
ink on it — the pages are rasterised WITH their annotations (Preview writes ink as PDF
annotations with appearance streams; the existing `pdfToPageImages` path must render the
annotation layer). The share back is Files-based on iOS (a web app cannot be a Share
Sheet target): Preview → Share → Save to Files, then Hand in → choose the PDF. Three
taps, honestly. Works on any tablet with a PDF annotator (Samsung Notes, Google's PDF
viewer, Edge) — Preview is only the one that is already installed on an iPad. The
AdrianMarker Pencil shell stays Adrian's tool: it needs weekly re-signing, so it is not
handed to students.

**BUILT 11 Sep 2026:** `lib/pdf-pages.ts` (the browser rasteriser both intakes use) renders the annotation layer (`AnnotationMode.ENABLE`, stated) and, when a page carries an annotation without the Print flag, renders that page with intent 'any' so ink is never dropped by the print rules; verified with a fixture PDF carrying two /Ink annotations (one flagged Print, one not) — both strokes reach the page image. The hand-in page says how: *Wrote on a PDF with your Pencil in Preview on an iPad? Share → Save to Files, then choose it here — your ink comes with it.* The Telegram /handin path rasterises server-side in the bot (`lib/batch-marking.js pdfToPageImages`, pdf.js in Node) — not yet checked for the same rule.

## 12. Push a page to every student (Class Notebook's move) — BUILT 11 Sep 2026

Adrian picks a page (a PDF or a picture) and an audience (everyone, a level, picked
names) on `/admin/send-page`; one row per student lands under "From Adrian" and in
the Notebook's 📖 band, with a Telegram line where linked and a web push. It is the
existing assigned-work table with a read-only `page` kind: never "to do", nothing to
hand in, one stored file for everyone (`pages/…`, readable by any logged-in student).

## 13. Build order

1. Exam countdown switch + one-time notice (§3) — smallest, fully specified.
2. Save an answer, Ask tab first (§1), then the Telegram button.
3. Search (§7) over what exists today, photos joining once OCR lands.
4. Photos: OCR + auto-tag (§7). 5. A line from Adrian (§6). 6. Personal notes (§8).
7. The stream UI (§9) — once there is enough in the book to need it.
8. Before the paper + formulas (§4, §5). 9. Resurfacing (§7). 10. Preview loop (§11).
11. Push a page (§12). 12. "How I do it" cards (§2). 13. Ask my notebook + audio recap (§10).
