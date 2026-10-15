# School exam tracker — one scan per school exam, compared exam to exam

**Status:** BUILT 15 Oct 2026 (steps 1–3 of §8), admin only. Adrian approved the mock-up, then moved it: *"why don't we put the exams information in overview (tab 1)? then don't build the fifth tab"* — so it is a "📝 School exam papers" block INSIDE the Exams box on Overview, not a fifth tab (§2 below describes the first plan). Only the latest paper is open; older ones show their score until tapped.
**Code:** `lib/school-exam.ts` (+ test: parse, totals, loss by topic, exam-vs-exam), `lib/school-exam-store.ts` (the read on Opus 5.5 — PDF sent whole, photos shrunk; the report writer), `/api/admin/school-exams` (+ `/upload-token`, `/[id]`: PATCH edits, POST confirm|reread, DELETE), `src/app/admin/students/[id]/school-exams.tsx`, table `school_exam_scans` (`migrations/school_exam_scans.sql`). Pages under `uploads/` (Adrian-only).
**Tested 15 Oct 2026** on one of our own marked E Math papers: 26 parts read in 31 s, total 44/54 exactly as marked. The parent-note writer once wrote "her" from a name — the prompt now forbids he/she.
**Not yet:** the "Make a sheet" button on each next-lesson line (step 2 extra), a student view, the line over time.
**Written in plain words first; the code word follows in brackets so it can be found in the repo.**

## 1. Why

Adrian, 15 Oct 2026: *"all the tools we have built so far i have not been using … i suggest we take a scan of their exam papers when they finished their exams, upload it to the portal, then we can do analysis, steps forward, etc, and then when they have another exam, do the same thing, so we can keep track of that … one only has to keep track of that one time point > exam, and we can immediately know if we did a good job."*

The app is a **companion to the lessons**, not a replacement. The one moment every family already cares about is the school exam (WA1, WA2, WA3, EOY, MYE, Prelim, the national exam). One scan at that moment, done by Adrian, gives:
- what this exam shows (marks lost, by topic, and why);
- what to do in the next lessons;
- whether it is better than the last exam;
- a short note for the parent, sent by Adrian in his own voice.

## 2. Where it lives

A fifth tab on the student page (`/admin/students/[id]`): **📝 School exams**, beside Overview · Papers · Work · Billing & slots.

It builds on what is already there:
- The Airtable **Exams** rows (WA1/WA2/WA3/EOY, Tested Topics, Result Score/Total/Grade) already shown as the "Exams" section on Overview (`ExamsEditor` in `profile-client.tsx`). Each row gets an **Upload the marked paper** button.
- Student files go to the private `student-files` bucket (`lib/student-files.ts`), never Blob or Dropbox.
- Topics are the canonical list (`lib/canonical-topics.ts`).

Admin only. Students see nothing in v1.

## 3. What Adrian does (about two minutes per exam)

1. On the student's page, tab **📝 School exams**, tap **Upload the marked paper** on the exam row (e.g. "WA3 · E Math").
2. Take photos of every page, or pick the PDF scan. The school has already marked it.
3. Wait about a minute. A table appears: each question, the marks the school gave, the marks it was worth, the topic, and one short line on what went wrong.
4. Fix anything read wrongly (tap a cell). Tap **Looks right**.
5. The report appears (§5). Copy the parent note into WhatsApp, change what he wants, send it himself.

## 4. What the system does

**Read the school's marks — do not re-mark.** The school's marks are the truth for this exam. For each question and part the reader records:
- question number and part (`q`, `part`);
- marks given and marks available (`got`, `max`), read from the school's ink;
- the topic (canonical topic, plus the sub-skill where it is clear);
- for a part that lost marks: one short line on what went wrong, from the student's working (`why`), and the error kind (the same labels as the marker's ✗ notes, [[error-kind-labels]]).

If the sum of the read marks does not equal the total written on the cover, the table says so in red and Adrian checks it before anything else.

**Fill the exam row.** On **Looks right**, Result Score, Result Total and Tested Topics on the Airtable Exams row are filled (only where empty; never overwrite what Adrian typed).

**Compare with the last exam in the same subject.** Topic by topic:
- **Better** — fewer marks lost on a topic tested both times;
- **Still weak** — lost marks on the topic both times;
- **New** — lost marks on a topic not lost last time;
- plus the score change (e.g. 52% → 64%).

**Next steps for lessons** — at most three lines, each a topic and one action ("Vectors: ratio theorem — two worked examples, then 4 practice"), with a **Make a sheet** button that uses the existing sheet writer.

**Parent note** — a short WhatsApp draft in Adrian's voice (§7). Never sent automatically.

## 5. The report (one screen)

- **Top line:** exam, date, score, grade, change since the last exam.
- **Marks lost by topic:** one bar per topic, biggest loss first.
- **Since last exam:** three short lists — Better · Still weak · New.
- **Next lessons:** the three lines and their buttons.
- **Parent note:** the draft, a Copy button.
- **Over time:** a line of every school exam score in that subject.

## 6. Storage

One new Supabase table, `school_exam_scans`:
`id, student_id (Airtable record id), airtable_exam_id, subject, exam_type, exam_date, files text[] (student-files keys), status ('reading'|'check'|'done'|'failed'), questions jsonb ([{q, part, got, max, topic, subskill, why, error_kind}]), total_got, total_max, report jsonb, parent_note text, created_at, checked_at`.

The comparison is a pure function (`lib/exam-compare.ts` + `.test.ts`): two question lists in, Better / Still weak / New out.

## 7. Red lines

- **Never sent to a parent automatically.** Adrian copies and sends (Relationships stay human, CLAUDE.md doctrine).
- **The parent note names no tools, models or sources.** Plain, warm, short: what went well, what we are working on, what happens next. One emoji at most.
- **Admin only** until Adrian decides a student view.
- **School marks are not changed.** If our reader disagrees with the school's marking, it is a note for Adrian, not a new score.
- Student files stay in the private bucket.

## 8. Build order, each step usable on its own

1. The tab, the upload, the reading, the check table, filling the Airtable row.
2. The report for one exam (marks by topic, next lessons, parent note).
3. Exam-to-exam comparison and the line over time.
4. Old exams: Adrian can upload past papers he still has, so the first comparison is there at once.

## 9. Open questions for Adrian

- Is a mock-up of the report what he wants (shown 15 Oct)? Changes go here first.
