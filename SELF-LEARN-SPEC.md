# Solo — Self-Learning Coach (working title)

> **One-line:** a student writes or works a problem, gets **instant, examiner-grade, snippet-anchored feedback**, revises while their logic is fresh, and the tool **learns their recurring weaknesses** — so they improve *without a tutor*.
>
> **Positioning:** ren/rubric build for **teachers** (AI assists marking). Solo builds for **students** — the student is the user, there is **no educator in the loop**, and the memory learns *the student's gaps*, not a teacher's style. The bet: this can replace the feedback half of tuition.
>
> Status: SPEC (pre-build). MVP scope below. Two grading modes ship together: **Math** and **O-Level English**.

---

## 1. The core loop (identical for both modes)

```
WRITE / WORK  →  GRADE  →  SNIPPET-ANCHORED FEEDBACK  →  REVISE  →  RE-GRADE  →  TRACK
```

1. **Submit** — type an essay/paragraph (English) or type/photograph working (Math).
2. **Grade** — the AI scores against the exam rubric and returns structured feedback.
3. **Feedback** — split view: the submission on one side with **highlighted spans**, a feedback panel on the other (per-snippet comment + a fix, rubric breakdown, 2–3 concrete next steps, strengths).
4. **Revise** — the student edits in place and re-submits.
5. **Re-grade** — shows the new band/score and **what improved** vs the last attempt.
6. **Track** — every error is tagged; recurring tags build the student's "weak spots."

This is the Chen Ziling loop: *"quick feedback helps me learn effectively as I can still recall my logic when I'm writing."*

---

## 2. The two modes

### Mode A — O-Level English (essay)
- **Input:** a full essay or a single paragraph (paragraph-level is the killer feature — fast, low-friction, matches how students actually draft).
- **Rubric (1128-style):** two criteria — **Content** and **Language** — each scored to a **band** with descriptors. (Exact max marks calibrated against real marked exemplars — see §5.)
- **Feedback granularity:** line/sentence-level. Each annotation highlights the **exact quote** and gives: what's wrong, why, and a concrete rewrite/fix. Plus essay-level: thesis, structure, development, examples.
- **Error tags (examples):** `vague-example`, `unsubstantiated`, `tense-error`, `subject-verb`, `register`, `weak-topic-sentence`, `no-link-to-question`, `spelling-consistency`.

### Mode B — Math (structured)
- **Input:** typed working, or a **photo** of handwritten working (reuse the existing `mark-batch` / bot region-detection + marking engine).
- **Rubric:** per-part method + answer marks against the question's mark scheme. Score = marks awarded / total.
- **Feedback granularity:** per line of working. Each annotation highlights the **step** and says where it went wrong + the correct step. Plus the full correct method when the student is stuck.
- **Error tags (examples):** `arithmetic-slip`, `method-error`, `conceptual-gap`, `sign-error`, `rounding`, `notation`, `missing-step`.

Both modes return the **same JSON shape** (§4) so the UI and the memory loop are shared.

---

## 3. ren patterns → Solo (student-facing) translation

| ren (teacher) | Solo (student) |
|---|---|
| Snippet-anchored marks | Highlight exact span → inline comment + a fix |
| Answer scheme → extract → calibrate → bulk | **Built-in exam rubrics**, pre-calibrated to examiner standards; student uploads nothing |
| Memory learns *teacher's* style | **Memory learns the *student's* recurring errors** → targets future feedback + practice |
| Reusable tag library | Error-type tags power the weak-spots analytics |
| Cohort weak-question analytics | **Your-own** strengths / gaps / next-step + progress over time |
| rex archive search | Practice search → **then AI generates fresh questions** aimed at weak topics (v2) |
| Calibrate on 1–5 then bulk | We calibrate the rubric once against marked exemplars; student just gets accurate grades |

---

## 4. Grading output — one JSON contract

The model returns this for both modes (Opus 4.8, adaptive thinking, for grading quality):

```jsonc
{
  "mode": "english" | "math",
  "overall": { "band": "B4 (Content) / B3 (Language)" | null, "score": 17, "outOf": 30 },
  "rubric": [
    { "criterion": "Content", "band": "B4", "comment": "Clear stand, but examples stay general." },
    { "criterion": "Language", "band": "B3", "comment": "Mostly accurate; some tense slips." }
  ],
  "annotations": [
    { "quote": "Economic revenue ... is channeled",      // exact span to highlight
      "comment": "Keep spelling consistent — British: \"channelled\".",
      "tag": "spelling-consistency", "severity": "minor" },
    { "quote": "globalisation helps more than it hurts",
      "comment": "Strong thesis — but substantiate with a specific policy/outcome.",
      "tag": "unsubstantiated", "severity": "major" }
  ],
  "strengths": ["Clear position", "Good use of a real-world example (Galapagos fee)"],
  "nextSteps": [
    "Tie each example to a concrete outcome (what changed, for whom).",
    "Vary sentence openings — 3 paragraphs start with \"Globalisation\"."
  ]
}
```

- `quote` = the literal substring (English) or working line (Math) → the UI string-matches it to draw the highlight. (Image-Math: `quote` is the region label/crop id from the existing detector.)
- `tag` feeds the memory loop. `severity` orders the panel.

---

## 5. Calibration (so grades are trustworthy — the make-or-break)
- Build a small set of **marked exemplars** per rubric (real or model essays with known bands / fully-worked math with known marks).
- Run Solo's grader on them; tune the rubric prompt until Solo's band/score is within ±1 band of the exemplar consistently.
- This is exactly the eval-harness we already built (`scripts/eval/`) — point it at the exemplar set, grade, iterate the rubric prompt until accuracy hits target. **The grading rubric is just a tunable prompt + an eval set.**

---

## 6. The memory loop (v1 — what makes it "learn the student")
- After each attempt, persist the `annotations[].tag`s.
- Maintain a per-student **weakness profile**: `{ tag → count, lastSeen, trend }`.
- Two uses:
  1. **Targeted grading** — inject the student's top recurring tags into the next grading prompt: *"This student frequently makes `unsubstantiated` and `tense-error` — watch for these."*
  2. **Weak-spots view** — "Your top 3 things to fix" + progress (is `tense-error` going down?).
- This is the student-facing analog of ren's "marks like you" — here it's **"coaches you on *your* mistakes."**

---

## 7. Data model (Supabase — the app DB)
```
attempts        ( id, student_id|null, mode, level, subject, question_ref|null,
                  submission_text|image_url, created_at )
feedback        ( id, attempt_id, overall_jsonb, rubric_jsonb, annotations_jsonb,
                  next_steps_jsonb, model, created_at )
weakness_tags   ( student_id, tag, count, last_seen )           -- the memory loop
```
- MVP can run **anonymous** (no login, `student_id` null) to minimise friction — like rubric's "Try Now". Logged-in (via the Student Portal in `/app` + `PORTAL.md`) unlocks the memory/weak-spots.

---

## 8. Surfaces / routes
- `/learn/write` — English essay mode (paste/write → grade → feedback → revise).
- `/learn/solve` — Math mode (type or photo working → grade → feedback).
- `/learn/me` — weak-spots dashboard (v1, logged-in).
- Reuse existing: `mark-batch` engine (Math photo), `scripts/eval` (calibration), Supabase, Student Portal auth.

---

## 9. Phased roadmap
- **MVP (this build):** `/learn/write` (English, paragraph + full essay) **and** `/learn/solve` (Math, typed working) → grade → snippet-anchored feedback → revise → re-grade. Anonymous OK. Rubrics calibrated via the eval harness.
- **v1:** memory loop + `/learn/me` weak-spots + targeted grading. Logged-in students.
- **v2:** AI-**generated** practice questions targeted at weak topics; Math photo input; more levels (GP, PSLE).
- **v3:** productise — subscription, onboarding, parent/teacher-optional view.

---

## 10. Open decisions (track here)
- Product name (Solo is a placeholder).
- Exact O-Level English mark scheme (Content/Language max marks) — pin to the current 1128 syllabus + exemplars.
- Math input for MVP: typed only, or typed + photo? (Photo reuses `mark-batch` but adds latency.)
- Anonymous-first vs login-required for MVP.
