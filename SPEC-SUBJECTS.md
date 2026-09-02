# SPEC — Portal subject expansion: Science · English · Chinese

> Status: **research + planning only — nothing built.** Written 2026-08-21 after (a) a
> science-progress audit and (b) an exhaustive teardown of ellacoach.app plus a
> competitor sweep. Adrian: "will revisit all later." When that revisit happens,
> start here; this file is the single source of truth for the subjects expansion.

---

## Part 1 — Science: verified current state (2026-08-21)

Science lives in a **separate merged Supabase project** — ref `eaxnstsecxmqdobfvmjh`
(dashboard still named "adrianphysics"; env `SUPABASE_SERVICE_KEY_SCIENCE` +
`SUPABASE_URL_SCIENCE` in the **bot** repo `.env`). Merged 2026-08-05 from four
projects per `~/Desktop/AdrianMath/mac_b_science_tasks/SPEC-SCIENCE-MERGE.md`.
Live counts (queried 2026-08-21):

| subject | rows | with solution | verified | embedded | with images | subgroups |
|---|---|---|---|---|---|---|
| physics | 7,619 | 7,605 | 7,344 | 7,560 | 1,302 | 83 |
| chemistry | 6,194 | 6,194 | 6,033 | 5,110 | 2,349 | 96 |
| biology | 3,589 | 3,588 | 3,578 | 3,589 | 2,322 | 127 |
| science (lower-sec S1/S2) | 4,751 | **0** | 3,619¹ | **0** | 2,459 | **0** |

¹ "verified" on the lower-sec bank predates the solutions pipeline (answer-checked
at extraction), NOT solution-verified like the other three.

**Done:** worked solutions + two-Mac verify audit for chem/phys/bio (task docs +
flag files in `mac_b_science_tasks/`); solution style guides per subject; Class A
answer-key fixes applied.

**Open gaps (in priority order for portal use):**
1. Lower-sec `science` rows have **no solutions, no embeddings, no subgroup
   taxonomy applied** — but the taxonomy is already designed:
   `mac_b_science_tasks/canonical_topics_s1sci.json`. This is the first cohort's
   content (S1/S2 students) and the biggest content gap.
2. Source projects `adrianchemistry` / `adrianbiology` / `adrianlowersecscience`
   are **still ACTIVE** (pause+delete was pencilled for ~2026-08-18; never done).
3. 4 Class-A rows (A2+A6: `0e9634e4`, `af34ac19`, `3ab6dced`, `f832eed5`) still
   await Adrian's source-paper ruling.
4. Portal integration — **physics practice v1 shipped 2026-09-02 (admin-preview,
   `SCIENCE_PRACTICE_OPEN_TO_STUDENTS=false`)**: website env vars added, the
   practice routes read the physics bank as level `PHY` (CLAUDE.md map). Still true:
   no route reads chemistry/biology/lower-sec yet, portal content tables (`learning_units`, `content_snippets`, `subgroups`
   tree) are math-only. Bot-side science Q&A is built (subject classifier, prompt
   additions distilled from real mark schemes, `science_diagrams` curated assets)
   and gated only on Adrian's red-pen review of flagged prompt items.

---

## Part 2 — English + Chinese: research findings (2026-08-21)

Full teardown artifact: **ELLA Teardown** —
https://claude.ai/code/artifact/b2dc035a-f97b-46d0-be04-069ac75cb030
(ellacoach.app = free bilingual writing+oral coach by Edtivate Learning, a ~18-branch
tuition chain; built on Lovable; no pricing — pure lead magnet + homework layer for
their physical classes, with tutors watching student activity).

### Patterns worth adopting

1. **Official rubric as the product spine.** Everything graded in SEAB's own marks
   language, shown to the student (PSLE AL / O-Level continuous writing; oral
   Reading Aloud /15 = 3×5; SBC /25). Chinese rubrics written natively (HCL oral
   scores 声母/韵母/声调), never translated from English.
2. **Frameworks as first-class objects** (PEEL, 起承转合, 总分总 = school-common;
   APRICOT/STORY/HEART etc. = branded centre acronyms). Same concept as our
   `method_templates` for math. Teach common ones; possibly brand our own later.
3. **Oral practice as a product surface**: passage/stimulus bank → record →
   speech-to-text transcript (editable) → rubric grade. ELLA: 56 SG-flavoured
   reading passages + 50 AI-illustrated SBC posters with the exam's 3-question
   ladder (personal → values → societal — the conventional examiner escalation,
   not a printed criterion).
4. **"Why it works" note on every AI generation** (their hook spinner labels each
   of 5 openings by type + one teaching line). One prompt sentence turns
   generation into teaching. Adopt everywhere we generate examples.
5. **Parent facilitator PDFs** — free packs with band-by-band scoring tables and
   "what you hear → what to do next" coaching columns; arms parents to run scored
   practice at home and sells the rigor. We have the docx/PDF tooling already.

### Anti-patterns observed (do NOT repeat)

- Promising "free, no account" then login-walling the action **and losing the
  student's draft** in the redirect loop (reproduced twice on their grader).
- Auth-walling the best acquisition content (model essay library, frameworks)
  while sitemapping it — crawlers get empty shells.
- Level-tuning claims without evals (their "P5–P6" hooks read Sec-level).
- Stateless grading: no per-student memory of recurring errors. (Nobody in the
  market does longitudinal writing feedback yet — open moat.)

### Competitor landscape (2026-08)

- **cher.ai × Mind Stretcher** (23 centres): CompoCoach + Reading Aloud + SBC +
  listening; free for their P5–P6 as "Research Preview", public paid plans. The
  ELLA play at scale — "tuition chain + AI companion" is becoming table stakes.
- **Geniebook / GenieOne**: $18M-funded (no round since 2021), claims 300k+
  cumulative regional students. GenieOne = narrow structured tutors, flagship is
  Primary Chinese 听写 via **official WhatsApp Business/Cloud API** (parent sends
  word list → bot replies session link inside the 24h service window; $20–30/mo).
- **Tutorly.sg**: $49/mo general AI tutor wrapper (chat + screenshot, 1,700+ past
  papers, quizzes, flashcards, voice, photo homework marking, parent activity
  counts). Fully self-serve — no human loop, no assignments.
- **Articulate Intelligence**: B2B essay-grading for schools/centres, intake via
  WhatsApp photo.
- **PSLE oral cottage apps**: PSLEPrep (EN+华文 AI examiner), KouShi (Chinese SBC),
  PSLE.app, pslepractice.com — crowded at P5–P6.
- **MOE SLS LangFA-EL**: grammar/spelling feedback on English assignments,
  **teacher vets before release** — the government normalising our exact
  review-then-release pattern.

**Usage reality:** public numbers are cumulative sign-ups, not actives; consumer
edtech churn is brutal; the products with real usage are the ones **welded to
enrolled classes**. Distribution through Adrian's own teaching is the structural
advantage; don't build for organic app-store pull.

### Strategic conclusions

- Languages flip the portal shape: math/science = question bank + right answers;
  EN/中文 = **open work × official rubric × frameworks × Adrian's voice**.
- **Wedge = Secondary** (O-Level EL 1184, HCL 作文/口试), not P5–P6 where ELLA,
  cher.ai and the oral apps all fight. Sec students are already in our ecosystem.
- **Grading capability is commodity; the marking SYSTEM is the product.** Any
  frontier model drafts a plausible band today, but ungated models drift ±3–4
  marks, run lenient, and give generic praise. Trust comes from: band descriptors
  as `rubrics` rows + anchor scripts + structured output + **calibration gate**
  (Adrian marks 10–15 real scripts; AI must land within ±2 marks before launch —
  same discipline as the math grading calibration gate) + review-then-release.
- **Per-student error taxonomy is the moat**: log tense/SVA/comma-splice/cliché
  (or 病句 types) counts per essay per student → next report says "tense slips
  down from 3 to 1" → feeds parent digests. Nobody does this.
- **Recall companion**: will NOT be used voluntarily (students default to ChatGPT,
  which answers instead of asking). Value only as an **assigned, context-loaded
  instrument**: post-marking follow-up generated from that paper's actual
  mistakes; pre-lesson warm-ups with completion visible to Adrian + digests.
  Do not expand generic chat.

### Phasing sketch (fits solo-maintenance policy: lib+tests, health-check per surface)

| Phase | Ship | Rides on |
|---|---|---|
| **L1** | EL + HCL essay hand-in (photo/typed) → AI rubric report (band, strengths, fixes, vocab/词语 upgrades, error taxonomy) → Adrian review → release | `/app/submit`, marking queue (`paper_marking_runs`), `rubrics`, release UX, Telegram notify. New: essay paper type + grading prompt + rubric rows. 1184 CW = /30 (Content 15 + Language 15 — re-verify against official SEAB descriptors when building) |
| **L2** | Public annotated model-essay library (framework-tagged, pinyin toggle at lower levels) + frameworks reference | `/explain` pages, `content_snippets`, edit-cards editor |
| **L3** | Micro-tools (hook spinner, 好句 upgrader) with "why it works" lines; framework-aware writing-coach mode on recall | recall companion, `syllabus_prompts` |
| **L4** | Oral studio: reading-aloud + picture/video-stimulus conversation; record → STT → rubric bands; attempts on admin dashboard + digests | **the one genuinely new build**: MediaRecorder + STT + audio storage |
| **L5** | Daily writing challenge (streaks, term certificates) + parent facilitator PDF packs | `unit_events`, Puppeteer, Resend |

WhatsApp intake (Articulate/GenieOne pattern): **the plumbing already exists** —
the bot has a live Twilio WhatsApp integration (`handlers/whatsapp.js`: parent
scheduling assistant; webhook + signature check in `handlers/webchat.js`; outbound
via `lib/twilio.js`). Twilio wraps the official WhatsApp Business Platform, so the
user-initiated 24h service window is what the scheduling assistant already rides.
Extending it to photo paper-hand-in (fetch Twilio media → existing mark-inbox →
marked-PDF link back in-window) is an incremental branch in the existing handler,
not a new integration. Student flows stay on Telegram (free, adopted).

---

## Decision log

- 2026-08-21 — Research phase closed; spec written; **no build decisions taken
  yet**. Adrian to revisit. First candidate build when he does: L1 essay grading
  (highest reuse of battle-tested marking pipeline; parent-visible from week one).

---

## Part 3 — Reverse takeaways for MATH (from the same teardown, 2026-08-21)

Ideas from ELLA/competitors that apply to the existing math product, mapped to infra:

1. **Mark-scheme transparency to students.** ELLA shows the official rubric
   structure everywhere; our students see marks but not the M/A/B mark-type logic
   behind them. Add "how this was marked" (method vs accuracy mark language) to
   marked-script feedback and portal practice grading. Teaches students to read
   mark schemes — high O-Level value, prompt-level cost.
2. **"Why it works / why this step" one-liners on all generated content** —
   generated practice questions ("what this tests"), /similar variants ("what
   changed vs the original"), worked-example steps ("why this step earns the
   mark"). One sentence in each generation prompt.
3. **Surface named method frameworks to students.** `method_templates` (23 rows)
   is internal today; give methods student-facing names + step checklists (the
   APRICOT effect: memorable ladders under exam pressure).
4. **Public annotated model-solutions library** — math analogue of ELLA's model
   essays: curated QB solutions annotated step-by-step via the `/explain` infra,
   kept PUBLIC for SEO + trust (ELLA walled theirs; that's the mistake to avoid).
5. **Parent facilitator PDFs for math** — "run a 15-min timed practice at home"
   with a what-you-see → what-to-do-next table; digest attachments + lead
   magnets. docx/PDF skills already exist.
6. **Holiday streak challenge** — 30-day × 10-min daily challenge with a
   certificate (`unit_events` + Puppeteer); digital twin of the June Revision
   Sprint, runnable every school holiday.
7. **Portal onboarding tour + "you are here" flow strips** (learn → practice →
   review → marked work). The portal currently has neither; ELLA's contextual
   wayfinding is the cheapest UX idea worth copying before beta.
8. **One free public micro-tool as lead magnet** on `/tools` (rate-limited) —
   the role ELLA's anonymous hook spinner plays in their funnel.

Anti-patterns in Part 2 (never lose student work, don't auth-wall sitemapped
content, don't claim level-tuning without evals) apply to math surfaces equally.
