# 🔀 Another way to solve this — SPEC

**Adrian, 4 Nov 2026:** *"can we build #5 too > but as a dropdown (closed by default), so students
can click or tap if they want?"* — idea #5 of the 4 Nov "broad understanding" list ("two methods, one
question"). It was left out at first because the marker shows ONE method so students are not
confused. That rule stays: this is a website-only extra, closed until tapped.

## Where it stands (4 Nov 2026)

- **Open to students since 4 Nov 2026** (Adrian: "open it"; `ANOTHER_WAY_OPEN_TO_STUDENTS = true`
  in `src/lib/portal-beta.ts`), promoted the same day. A student sees a drop-down only for a row
  Adrian has APPROVED — opened with all 23 pilot rows still waiting, so each one goes live the
  moment he presses Approve.
- **Pilot: 23 rows waiting for Adrian** on `/admin/another-way` (30 questions tried; 6 had no
  genuinely different method and were skipped by the writer; 1 used sum of roots, which is not in
  the syllabus, and the checker refused it). **Nothing is approved yet** — approval is his.
- Suggested from the phone check: reject f78bba8f (circle tangent) and 19257f3f ("always negative")
  — correct but crowded on a phone.

## 1. What a student sees

Under a maths question's worked solution, a closed drop-down **"🔀 Another way to solve this"**.
Tapped, it shows:

1. **Method: <name>** — a genuinely different second method, worked in the house layout
   (`components/SolutionText`: one step a line, equations lined up, bold **Answer:** last).
2. **"Which is better here?"** — ONE plain sentence saying which method is better for THIS question
   and why ("Grouping is quicker here because the first two terms and the last two terms both share
   $(x+1)$, so no division or comparing is needed."). That line is the point: it links topics.

Where (the two most-used places a student reads a worked solution):
- **Practice** (`/app/practice`, `practice-flow.tsx`) — under the worked solution, beside 🎬 the
  clip door. Rides on `GET /api/portal/practice/solution` as `another` (no extra request).
- **A marked paper's "Where you lost marks"** (`/app/marking/<id>`, `LostMarks.tsx`) — under the
  annotated worked solution, when the marking matched the paper to the bank
  (`question-clip-store bankQuestionsForRun`).

Component: `src/components/AnotherWay.tsx` (a plain `<details>`, no client JS of its own).
Adrian's own admin cookie also sees rows **still waiting** for his approval, with an amber
"Waiting for your approval" tag, so he can judge one where students will see it — students never do.

## 2. The rules (red lines)

- **The main solution stays ONE method.** The bot's marking rule (`base-math.txt` "ONE method per
  part … never show alternative methods unless the student asks") is untouched.
- **Only where a genuinely different method exists** within the O-Level 4052 E Math / 4049 A Math
  syllabus (or H2 where relevant). No trivial variations: not the same method in another order, not
  substituting for x instead of y, not starting from the other side of an identity, not changing a
  log base. No real second way → no row → no drop-down.
- **Out of syllabus is refused**, e.g. sum and product of roots (Adrian: not in the secondary
  syllabus — `docs/SEC-SYLLABUS-METHODS.md`), factor formulae, logarithmic differentiation,
  matrices for simultaneous equations, calculus in E Math.
- **Verified:** a separate checker solves the question BLIND by the named second method and must
  reach the bank's answer; it then reads the draft line by line. Served only when Adrian approved
  AND the check passed (`lib/alt-method.ts altServable`). Approve is refused by the API when the
  check did not pass.
- **Plain Singapore-classroom wording**; no casual words (trick, neat, shortcut, …, plus
  spot-error's list); no mark codes, no "mark scheme", no model names, no names
  (`altDraftProblems`).

## 3. How rows are made (plan-billed, no paid API)

1. **Pick** bank questions where a second method is natural (simultaneous equations, quadratics and
   the discriminant, partial fractions, polynomials, coordinate geometry, trigonometry,
   differentiation, binomial). Served rows only: not national, not deleted, not old syllabus.
2. **Fetch**: `npx tsx scripts/another-way/fetch.mts --ids a,b,c --out rows.json` (small rows;
   skips questions that already have a row).
3. **Write** — an Opus agent per ~10 questions, brief below (§4a). It may skip; skipping is right
   when no real second way exists.
4. **Check BLIND** — a separate Opus agent per batch, brief §4b: solves from the question text and
   method name only, records its answers, THEN reads the draft. It may give wording fixes only.
5. **Save as waiting**: `npx tsx scripts/another-way/insert.mts --drafts drafts.json --checks
   checks.json [--apply]` — runs `altDraftProblems` + `checkProblems`, applies the checker's
   wording fixes, inserts `status='pending'`. Dry run by default.
6. **Adrian approves** on `/admin/another-way` (each card drawn closed, exactly as a student sees it).

Table: `question_alt_methods` (`migrations/question_alt_methods.sql`, math project) — one row per
question: `main_method`, `alt_method`, `working`, `better`, `alt_answer`, `checks` (the blind
verdict), `status` pending | approved | rejected, `note` (his reason on reject).
Health check: `another-way`.

## 4. The agent briefs (keep these — the next batch reuses them)

### 4a. Writer
For each question: is there a genuinely different second method in the current syllabus (list in
§2)? If not, skip with a reason. Else give `main_method` and `alt_method` (2–4 word names), the
`working` (one step a line, `$…$` maths, a short reason where a law is used, substitutions shown,
last line `**Answer:** …`; for a multi-part question only the part(s) the method applies to, part
label on the first line), `better` (ONE sentence ≤ 200 characters with "because", saying which is
better HERE and why — may favour either), and `alt_answer` (equal in value to the bank answer).
Check every number with python. Bank answer looks wrong → skip and say so.

### 4b. Blind checker
Step 1, before opening anything else: solve each question by the named method, record the answers.
Step 2: read the bank answer + solution + draft, and judge `same`, `working_ok` (one wrong line =
false), `different`, `in_syllabus`; wording problems in `notes`, small wording fixes as
`fix_better` / `fix_working` (never a maths repair).

## 5. History
- 4 Nov 2026 — built; pilot of 30 → 24 drafts → 23 passed the blind check, saved as waiting.
  Refused: 448e4243 (midpoint of AB by sum of roots — out of syllabus). Skipped by the writer as no
  real second way: 1181cfc4 (question fixes the method), 175e9a10, 2ec2b813, 80b987a5, 8932e811,
  fd037dd7. Checker's note on 2348cd64 (ratio, classes A and B): "only just a different method" —
  Adrian's call.
