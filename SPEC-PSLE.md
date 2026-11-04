# SPEC — Primary 6 / PSLE in the question bank

Started 23 Oct 2026. Adrian, 23 Oct 2026: *"We just need 2018 to 2025 psle prelim papers and
for psle Tys - past 10 years"*. Maths and science only; English and Chinese come later.

## Where things stand (3 Nov 2026)

- **3 Nov 2026 (Adrian: "Yes, P6 first"): all 310 P6 files QUEUED.** They sat `held` (level
  empty) since 1 Nov. Each row's level / year / school / paper / exam type was filled from its
  name by `parseSourceFilename` (all 310 read cleanly: maths 199 prelims + 10 PSLE, science 90
  prelims + 10 PSLE + 1 SA2), status `queued`, notes end `QUEUED 3 Nov 2026`. The Fly `extract`
  switch is on; the first file was claimed within minutes. Answer keys are inside each file.
- **P5 BUILT + QUEUED 3 Nov 2026 (Adrian: "Yes, set up P5").** Level `P5`, maths + science,
  school end-of-year papers (SA2) 2018–2023 only.
  - Code: the name reader files `P5 SA2 2023 Nanyang.pdf` / `P5 SCI SA2 …` as P5 (PSLE is
    always P6); `P5_EXAM_TOPICS` = the P6 list without Algebra, Circles, Speed, Pie Charts,
    Nets and Solids (mirrored as the bot's `canonical_topics.json` `P5` key); `PRIMARY_QLEVELS`
    = P5 + P6, so the switch keeps both closed. Worker law v2026-11-03-p5 (§Primary 5 papers;
    the old text is archived as `exam-extraction-2026-11-03`).
  - Source: Dropbox `Primary Exam Paper.zip` (23.8 GB, root) → `Primary 5 Exam Paper/P5 Math`
    and `P5 Science`, one vendor book per year (each also holds CA/SA1/WA papers, never queued).
    Cut by their bookmarks into one file per school (Paper 1 + Paper 2 + answer key), every
    cover and end page checked by eye; staging + scripts in `~/P5-staging/` (`_tools/plan_checked.json`
    is the page map). **165 rows queued straight into `paper_library`** (83 maths, 82 science;
    storage `sources/P5/<year>/<school>/`, notes `QUEUED 3 Nov 2026 … cut from <book> pages …`)
    — not through the inbox, because production's name reader did not know P5 yet.
  - Odd cases: 2022 maths Singapore Chinese Girls dropped (bookmark said SA2, cover says SA1;
    no SA2 in the book); 2023 maths Red Swastika is printed twice in the book, the second copy
    + key used; 2023 science Nan Hua's cover says "Preliminary Examination" (filed SA2);
    2018 maths Tao Nan's bookmark was wrong (real pages 1130–1166).
  - Not taken: 2014–2017 books and the 2011–2013 single files (Adrian asked for 2018–2023).
- **P4 maths + science (4 Nov 2026, Adrian: "yes" — "do we have p4 papers as well?").** Same source zip
  (`Primary 4 Exam Paper/P4 Math|P4 Science/<year>/`, one vendor book per year), same rules as P5:
  school end-of-year (SA2) papers 2018–2023, cut by school into `~/P4-staging/`, uploaded as `paper_library`
  rows with status **`held`** until the P5 queue is empty, then released (`queued`). Needs level `P4` in the
  name reader, a P4 topic list, `PRIMARY_QLEVELS` + the worker law, like P5. The Fly worker shrinks only
  after P4 is done too.
- **Primary English, Chinese, Higher Chinese P4–P6 (4 Nov 2026, Adrian: "let's do chinese (and higher
  chinese) and english as well" — reversing the same day's "wait").** Source: the same zip, one vendor book
  per year per level-subject (P4/P5 2018–2023, P6 2018–2022; ~46 books, roughly 600 papers). Cut by school
  into `~/PL-staging/english|chinese/` (one file = Paper 1 + Paper 2 + the key; P4/P5 SA2, P6 Prelim),
  uploaded as `paper_library` rows status **`held`**: subject `english` level `P4_EL|P5_EL|P6_EL`, subject
  `chinese` level `P4_CL|P5_CL|P6_CL`, subject `higher_chinese` level `P5_HCL|P6_HCL`. Into the language bank
  (`language_items` / `language_texts`, MAIN project) — never served to students.
  - Built the same day: `bank_insert_language_paper` accepts those subject/level pairs
    (`migrations/2026-11-04-language-primary-levels.sql`); worker law v2026-11-04-primary-lang
    §Primary language papers (old text archived `exam-extraction-2026-11-04`); bot `worker/fly/extract.sh`
    + `EXTRACT_PROMPT.md` route chinese / higher_chinese like english (Chinese on the default model, English
    on Sonnet).
  - Order: P6 → P5 → P4 maths/science → the languages. Release = `update paper_library set status='queued'
    where kind='source' and status='held' and level in (…)`. Check the FIRST English and the FIRST Chinese
    paper by hand (read rows back against the page) before letting the rest run.
  - The Fly worker shrinks only after all of it, which pushes the cost plan back about a week.
- **⏰ When the primary extraction finishes → shrink the Fly worker (Adrian, 4 Nov 2026: "let's
  finish the extraction work first. and then later bring cost down to less than US$50 per month").**
  The worker stays on performance-2x / 8 GB (≈ US$114/mo in sin) until the P5 + P6 queue is empty.
  Then shrink the worker to shared-cpu-2x / 4 GB (≈ US$30/mo; Adrian, 4 Nov: "Under US$50 for the worker
  alone … yes"). History of every size and why: bot `fly.worker.toml` `[[vm]] size` comment.
  Same day, Adrian: *"for telegram bot > exams are over, we also don't need such large capacity … and able to
  auto set up such that if usage ramps up, capacity ramps up as well?"* — the bot is already at its normal
  post-split size (app shared-1x/2 GB, marker shared-2x/4 GB since 10 Sep); the proposal is a marker that
  sleeps when no paper waits and is woken like the worker (`lib/fly-worker.js`), plus spare machines that
  wake when a queue grows. **Agreed 4 Nov 2026 (Adrian: "yes / but do it after all extractions and twins
  are done"; he expects little usage in the coming months).** The lean plan, in this order, ONLY once the
  P5 + P6 queue is empty AND the science twins have reached 5 a sub-skill:
  1. marker sleeps after 10 idle minutes, the bot wakes it on a hand-in (reuse `lib/fly-worker.js`);
  2. the bot's app machine 2 GB → 1 GB, after Adrian's ▶ Mark / desk redraw draw on the marker (bot `fly.toml` note);
  3. worker → shared-cpu-2x / 4 GB, sleeping between its daily jobs;
  4. spare marker + spare worker kept stopped, woken when ≥ 3 papers still wait after 10 min, one Telegram
     line to Adrian each time; they sleep again after 10 quiet minutes.
  Target ≈ US$30–40/mo in all (trading-signals' US$8 included), from ≈ US$170. Ask Adrian then whether
  twin writing may pause once science reaches 5.
- **Faster extraction (4 Nov 2026, Adrian: "can we make the extraction faster since we have capacity
  now?"):** bot `fly.worker.toml` EXTRACT_LANES 2 → 4, SCI_TWINS_LANES 5 → 2 (8ed4e794). Put the twins back
  to more lanes if they still owe twins when extraction ends.
- **Skill labels:** primary has no sub-skill list (`subgroups` has no P5/P6 rows), so the filer
  leaves P5/P6 questions with topics only. Plan (3 Nov 2026): build the primary skill list
  from the banked questions once ~100 P6 papers are in.
- **First P6 results (3 Nov 2026):** PSLE maths 2017, 2020–2022 banked within the hour —
  every question has answer, solution, topic, difficulty; 2017 has 12 questions marked
  `has_image` with no picture yet (the missing-figures job's work).

## Earlier (23 Oct 2026)

- **Built:** the level, the filename reader, the worker's rules, the topic lists, the switch
  (off).
- **Queued (23 Oct 2026, Adrian said yes to the spend):** 310 files copied into the Extraction
  Inbox; the cloud worker reads them at its usual pace (20 files every 10 minutes, then extraction).
  > **25 Oct 2026 (doc sweep): NOT queued after all.** The inbox turned all 310 away on 23 Oct (08:20–10:50 SGT — "no level token": it read them before it knew P6) and moved them to `/extraction inbox/rejected/`; `paper_library` holds 310 `flagged` rows, `questions` holds 0 at P6, and the inbox never re-reads a file. The worker's `extract` switch is also off since 24 Oct ~07:42.
  - **Past papers (TYS):** `PSLE Maths <year>.pdf` 2015–2024 and `PSLE Science <year>.pdf`
    2014–2023, one file each (Paper 1 A + B, Paper 2, answers). Grounding-only.
  - **School prelims, schools per year:**

    | | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
    |---|---|---|---|---|---|---|---|
    | Maths | 19 | 18 | 14 | 17 | 21 | 17 | 20 |
    | Science | 16 | 18 | 14 | 13 | 13 | 0 | 17 |

  - Single-school files keep their own name (`P6 PRELIM 2023 Nanyang.pdf`, read at the covers).
    Combined books were cut by school on the Mac (rules: `~/PSLE-staging/_tools/BRIEF.md`) into
    `… Paper 1` / `… Paper 2` (science: one `P6 SCI … Paper 1`), each with its answer key at
    the end. Where a school was in both, the cut copy was kept.
  - **Cutting a book with `pdfseparate`/`pdfunite` makes every part carry the whole book's
    shared data** (a 20-page part came out 40–160 MB). Re-save with PyMuPDF
    (`save(garbage=4, deflate=True, clean=True)`, `~/PSLE-staging/_tools/shrink.py`): about a
    twelfth of the size, same pages.
  - School names are short and the same everywhere: ACS Junior, ACS Primary, Singapore Chinese
    Girls, Pei Hwa Presbyterian, CHIJ St Nicholas Girls, Christian Brothers (a joint paper of four
    schools, 2019 science), CHIJ Combined (2024 maths).
  - **Odd cases:** Nanyang 2024 science has no answer key; Northoaks 2024 science's cover is
    misprinted "Booklet B"; Pei Hwa 2021 science's cover says 2019 but is dated Aug 2021;
    Maris Stella 2018 (both) and 2022 science, Maha Bodhi 2022 science, ACS Primary 2021 maths
    and ACS Primary / Ai Tong 2021 science have only CA1/SA1 in the books, so none; Townsville
    2024 maths is on a contents page but not in the book.
- **Not used:** the 2023 "Full" maths book (377 MB) and the 2023 science book (518 MB) are
  online-only in Dropbox; maths 2023 comes from the single-school files and the 16-school book.
  **No 2023 science prelims are queued** until that book is downloaded to this Mac.
- **No student sees any of it.** No student surface for primary is built.

## 1. The level

- One bank level, **`P6`**, in both banks (maths `nempslbewxtlikfzachi`, science
  `eaxnstsecxmqdobfvmjh`). The row's `subject` (`math` / `science`) tells them apart.
- **Maths topics** = `P6_EXAM_TOPICS` in `src/lib/canonical-topics.ts`, mirrored as the `P6`
  key of the bot's `extraction/canonical_topics.json` (change both). These are 27 topics taken
  from the official syllabus (`2 MATH/MATH class 1 PRIMARY/Primary School Syllabus/
  2024-psle-math-0008-exam-syllabus.pdf`).
- **Science topics** = the 22-topic list written into the worker law (§Primary 6 and PSLE
  papers). The science bank's `bank_topics` view has no P6 rows to read them from yet.
- **Speed is on every PSLE paper from 2015 to 2025.** Never mark it as off-syllabus for those
  years.

## 2. The papers

| | Maths | Science |
|---|---|---|
| Paper 1 | no calculator, 1 h, 45 marks — Booklet A Q1–15 multiple choice (10 × 1, 5 × 2), Booklet B Q16–30 short answer (5 × 1, 10 × 2) — **stored as paper `'1'`, numbered on** | Booklet A 28 multiple choice × 2 (56; older papers 30 × 2) + Booklet B open-ended (44) — **one paper `'1'`, numbered on** |
| Paper 2 | calculator, 1 h 30, 55 marks — Q1–5 short answer × 2, Q6–17 structured 3–5 marks | — |

- A 2-mark one-part short answer gives 1 mark for the method when the answer is wrong. The
  worker writes these as `[M1]` and `[A1]` lines.
- **Solutions use primary methods:** model drawing, units, working backwards. They never use
  algebra with a letter for an unknown.

## 3. Filenames (the Extraction Inbox reads these)

- `P6 PRELIM 2024 Nanyang.pdf` is maths. `P6 SA2 2021 Rosyth P2.pdf` is maths Paper 2.
- `P6 SCI PRELIM 2022 Nanyang.pdf` (or `P6 Science …`) is science.
- `PSLE Maths 2019.pdf` / `PSLE Science 2018 Booklet B.pdf` are the national paper. Its row
  reads `school = 'GCE'`, `exam_type = 'PSLE'`.
- Answer keys are named `… Ans.pdf` / `… MS.pdf`. They are kept for pairing and never queued.
- **When a book is cut at its covers**, the parts are named `P6 PRELIM 2023 Nanyang Paper 2.pdf`,
  `P6 SCI …` or `P6 PSLE 2019 Paper 1.pdf` (`partFileName`, with a round-trip test).
- **A multi-school book will NOT cut itself.** Every school's cover says "Paper 1", so the
  cutter sees the same paper twice and leaves the book whole. A 100–230 MB book is also too
  big for one worker run. So these books are cut **by school** before they go in.

## 4. Content policy

- **The national PSLE papers are grounding-only.** They are banked in full and never served,
  because `school = 'GCE'` already trips every national gate (`docs/CONTENT-POLICY.md`).
- **School prelims and SA2 papers** follow the same rules as secondary school papers.

## 5. The switch

- `PRIMARY_OPEN_TO_STUDENTS = false` in `src/lib/portal-beta.ts`.
- While it is off, `lib/serve-gate.ts` refuses every `P6` row to a student, even one on their
  own list.
- No student's level maps to P6 today (`qbLevelsFor`), so Practice, Find and the mock never
  draw one.
- Opening primary to students is a separate build: a P6 student level, a topic tree and a
  sub-skill tree. That build would then open this switch.

## 6. What is in Dropbox (inventory, 23 Oct 2026)

| Wanted | Have | Missing |
|---|---|---|
| Maths past papers (TYS), past 10 years | 2015–2024 (`1 ONLINE LESSONS/3 Exam Papers/Ten Year Series/7 tys PSLE Math`) | 2025 |
| Science past papers (TYS), past 10 years | 2012–2023 (`3 SCIENCE/01 PSLE Science`) | 2024, 2025 |
| Maths prelims 2018–2025 | 2021–2024 as single-school files (about 32 / 49 / 41 / 11) plus combined 2023 and 2024 books; 2018–2020 as combined books (100–130 MB each) | 2025 |
| Science prelims 2018–2025 | 2018–2022 as 5 combined books (91–237 MB) | 2023–2025 |

- Skip " copy" duplicates.
- Never delete anything in Dropbox without Adrian's yes. The staging step **copies** files
  into the inbox.

## 7. Open decisions

- **Where the missing years come from:** everything for 2025; science prelims 2023 (the book
  is in Dropbox but online-only) and 2025; science TYS 2024–25.
