# 🧩 The weekly stretch set — SPEC

**Adrian, 4 Nov 2026: "Yes, build it."** Goal: broad understanding, so a student copes with an
exam question they have never seen — the same maths in a new costume, a stretch question, mixed
older topics, spotting a mistake, and guessing before solving. This joins parts we already had
(practice flow, Challenge pilot, spot-the-error cards, Notebook, difficulty job) into one thing a
student actually receives each week.

**State (4 Nov 2026): BUILT on dev, switched OFF for students** (`STRETCH_SET_OPEN_TO_STUDENTS = false`
in `src/lib/portal-beta.ts`; Adrian's admin cookie and the preview student see it). Not announced
anywhere yet — the bot's weekly message line is a proposal waiting for Adrian (§6).

## 1. What a student gets — five things a week, each a different idea

| # | Slot | Comes from (first choice → next best) | Prompt |
|---|---|---|---|
| 1 | 🎭 **Same maths, new look** (`costume`) | an APPROVED new-costume question (`gen_meta.kind = 'costume'`, `verified = true`) on a topic met in the last 3 weeks → a fresh unseen question on a recent topic (gap logged) | |
| 2 | 🧗 **Stretch question** (`stretch`) | an approved Challenge question (`difficulty = 'Challenging'`: the bank's real ones + the 🔥 pilot rows once Adrian approves them) → an Advanced one (gap logged) | 💭 "What does this remind you of?" before starting (optional, one line) |
| 3 | 🔁 **From a while back** (`older`) | a topic last met 3+ weeks ago, lost-marks topics first (Notebook) → any topic not met recently (gap logged) | |
| 4 | 🔍 **Spot the mistake** (`spot`) | an APPROVED `autopsy` card in the level's reach, the student's own most frequent `error_kind` first → any approved card at the level (gap logged) → none (gap logged) | tap the wrong line |
| 5 | 🔮 **Guess first** | a prompt on slot 1 or slot 3, alternating week by week (never on the stretch card, which already asks one thing) | sign / rough size / shape before solving; after the attempt, the guess beside the answer + "Was your guess close?" Never graded, never blocking. |

"Met" = Airtable lesson log (`Topics Covered`, tuition students), Notebook mistakes
(`notebook_mistakes`), and portal practice attempts. A lesson's words are matched onto the
level's bank topics (`matchBankTopics`: exact → "Differentiation" = every "Differentiation (…)"
→ a shared long word).

Level of the set: A Math before E Math (an A Math student sits both), then JC, Sec 2, Sec 1.

## 2. Rules
- **Never an unapproved item.** Bank questions come only through the serving doors
  (`practice_next`, `practice_pool`, `lib/part-syllabus` `studentRow`) — so an unverified AI row,
  a deleted / flag-buried / off-syllabus row never enters a set. Spot cards: `status = 'approved'` only.
- **Nothing the student has done before**: every question they attempted in ~6 months and every
  item from their last 8 sets is skipped.
- **Built once per student-week, then kept** (`stretch_sets`, unique on student + Monday). Built on
  the student's first visit that week, or earlier by Adrian's preview — the student then gets
  exactly the set he saw. Rebuild is allowed only while the student has not answered anything.
- **Gaps are logged** on the row (`gaps`), and `/admin/stretch` lists this week's gaps with counts.

## 3. Results — tracked per question
- **Tried / right first time**: read from `student_attempts` on the slot's question since the set
  was built (first attempt only; "right" = the difficulty job's own rule, `mathAttemptWrong`). The
  questions are marked by the ordinary practice route, so **every stretch attempt already feeds the
  nightly difficulty adjustment** (`/api/cron/math-practice-difficulty` reads every `portal` attempt).
  Known gap: that job never moves a Challenge question (CHALLENGE-PILOT.md).
- **Guess accuracy**: the student's own "Was your guess close?" tap (`responses.<slot>.predictionClose`).
- **Spot**: the first tap — found it or not (`responses.spot.spotRight`).

## 4. Where things live
- `src/lib/stretch-set.ts` (pure: topics, rotation, spot pick, inputs, results; tested) ·
  `src/lib/stretch-set-store.ts` (build, read, save) · table `stretch_sets` (`migrations/stretch_sets.sql`).
- Student: Home card → `/app/stretch` (`src/app/app/stretch/page.tsx`, cards in
  `src/components/StretchSet.tsx`); a question opens `/app/practice?qid=…&from=stretch`.
  API `/api/portal/stretch` (GET set, POST one slot's input). Health check `portal-stretch` (401 gate).
- Adrian: `/admin/stretch` — pick any student, see their set as they will, with a grey "why"
  under each card and the gaps. API `/api/admin/stretch`.
- New costumes: `.claude/skills/generate-similar-questions/SKILL.md` §New costumes — kinds
  `unknown-swap` (change which quantity is unknown) and `diagram-swap` (diagram ↔ words, only where
  the figure library draws it exactly; never an AI-drawn figure). Saved `verified = false`; Adrian
  approves on `/admin/generated` (🎭 chip → ✓ Verify — serve it). Costumes are NOT twins
  (SPEC-TWINS counts same-structure questions only).

## 5. Supply on 4 Nov 2026 (why early sets show gaps)
- New-costume questions: **0** written yet → slot 1 is a fresh recent-topic question for everyone.
- Approved Challenge questions: the bank's real ones (AM 10, EM 1, JC 1, S1 10, S2 4) + the 🔥 pilot
  rows Adrian approved the same evening (all 20, AM + EM, `docs/CHALLENGE-PILOT.md`).
- Approved spot cards: 26 hand-written A Math cards (no `error_kind`), the 11 cards from real
  mistakes still waiting on `/admin/spot-error` → E Math students get no spot card yet.

## 6. Open for Adrian
1. Look at example sets on `/admin/stretch`, then say yes to open `STRETCH_SET_OPEN_TO_STUDENTS`.
2. **Announcement (proposal, not built):** one line in the bot's Monday message to each student —
   "🧩 This week's stretch set is ready — 5 questions that look different from the usual." with a
   link to `/app/stretch`. Ask Adrian before building it.
3. Approve the spot cards waiting on `/admin/spot-error` — E Math students get no spot card until then.
4. Write the first new-costume questions (plan-billed, the skill above) on the topics `/admin/stretch`
   shows as recent.
