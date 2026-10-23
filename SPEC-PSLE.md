# SPEC — Primary 6 / PSLE in the question bank

Started 23 Oct 2026. Adrian, 23 Oct 2026: *"We just need 2018 to 2025 psle prelim papers and
for psle Tys - past 10 years"*. Maths and science only; English and Chinese come later.

## Where things stand (23 Oct 2026)

- **Built:** the level, the filename reader, the worker's rules, the topic lists, the switch
  (off). Nothing is queued yet.
- **Next:** cut the multi-school books into one file per school and drop them into the
  Extraction Inbox. This needs Adrian's yes on the agent spend.
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

- **The agent spend** to cut the combined books by school and stage everything. Asked
  23 Oct 2026; waiting for Adrian.
- **Where the missing years come from** (2025 maths; science prelims 2023–25; science TYS
  2024–25). Adrian to supply them.
