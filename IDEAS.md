# IDEAS.md — the consolidated build queue

> **Why this file exists** (Adrian, 2026-08-29): session memory is per-Claude-account;
> this repo travels everywhere. Any session on any account reads THIS for the agreed
> ideas/backlog. Keep entries one-line-ish with status; move detail into docs/ or specs.
> Statuses: 💡 idea · 📐 designed (awaiting go) · 🔨 in progress · ⏸ parked · ✅ shipped (dated, then prune after a while)
>
> **Standing working agreement (Adrian):** fan out with agents where it makes work faster — no need to ask. Auto commit+push to dev each turn; promote to prod freely once verified (his 2026-08-29 cadence); alias adrianmath-dev after preview builds; ALWAYS check the marking queue (paper_marking_runs result_json null count = 0) before any bot push.

## Product — student portal
- 📐 **Animated solution player** — step-by-step web playback of a worked solution (the /solutions presentation style, animated). The "HTML is the new markdown" direction.
- 📐 **Parent monthly digest as a designed HTML page** — shareable branded page instead of text; top pick of the HTML-first ideas.
- 📐 **Auto-renew subscription option** — S$29/mo second button beside the one-time pass; Stripe recurring price + invoice.paid renewals (skip billing_reason=subscription_create); cancel = message Adrian at current scale.
- ✅ **JC mock enablement (2026-08-29)** — JC1/JC2 students get the Mock preset: 9758 cover, 3 hours, graphing-calculator instructions, P2 Section A/B headings (40/60 derived from blueprint). WAS: 📐 **JC mock enablement** — blueprint SHIPPED (JC-P1/P2 with 40/60 section boundary); remaining: MOCK_LEVELS + JC↔blueprint key mapping, 9758 cover code, H2 instructions/calculator wording, admin fetchCandidates level scope. One wiring pass.
- 💡 **Student-own-notes tab** — students writing their own notes (beyond ✂️ clippings). Later.
- 📐 **Notebook photo-upload** (split out of phone-review #4, 2026-08-29) — student photographs any external work → clippings gallery (`portal_notes` gains source `'upload'`); auto-organization (topic/paper albums) as volume grows.
- 💡 **Recommendation merge** — Home focus card / Practise "up next" / My Notebook bands share one brain eventually.
- 💡 **Exam Intensive queue-priority done; consider surfacing "priority marking" copy** on /app/pass Intensive card once first intensive customer exists.

## Growth / virality (Adrian asked for organic loops, 2026-08-29)
- 💡 **Shareable result cards** — after a marked paper, a branded score-card image ("71/75 · marked overnight") one tap to WhatsApp with the student's invite link baked in. The strongest teen-share loop available.
- 💡 **Referral reward ladder** — 3 paying referrals → a free month / merch; visible progress on the invite sheet.
- 💡 **Inviter leaderboard** (per class / per school) — social proof + competition.
- 💡 **Streak shares** — practice streaks as share cards.
- 💡 **Subjects picker at stranger signup** — Sec 3–5 signups should declare E/A Math (JOIN_LEVELS has no subject split; scoping currently defaults). Small form + account.subjects write.

## Automation — money/ops
- 📐 **Auto-deactivation cron** — monthly: portal account with no active enrollment ≥30d → deactivate + Telegram. Data stays dormant indefinitely (rejoin-friendly); hard-delete only on request or ≥2–3y dormant (see docs/RETENTION.md).
- 📐 **Auto referral invoice credit** — tuition inviter's −S$10 as a deferred adjustment on next invoice when an invited friend's first payment clears (READ docs/INVOICES.md first; Adrian still eyeballs invoices between the 14th and 15th).
- 📐 **Retention cron** — docs/RETENTION.md has the policy sketch; Adrian owes 3 sign-offs before anything deletes.
- 💡 **Privacy-policy copy update** — marking-records retention after deletion + dormancy policy, folded in when retention is signed off.

## Content review debt
- 📐 **Notes bulk approval**: 594 learning-unit blocks approved (live to students) vs **1,297 pending** (invisible to students). Options: Adrian approves topic-by-topic via the /notes Review bar, or a session runs a QC pass over all pending (correctness + readability) and he bulk-approves. (The KEY FACTS/TECHNIQUES mobile readability fix shipped 2026-08-29 — phone-review #12.)

## Growth builds (Adrian-approved directions)
- 📐 **Shareable result cards** — branded score image on release ("marked by AdrianMath" — NOT "overnight"), one tap to WhatsApp, invite link baked in. BUILD FIRST of the growth loops.
- 📐 **"Do it with a friend"** (Adrian's final name — was "Challenge a friend" / "Sit my paper") — share a generated mock so the friend sits the IDENTICAL paper (needs a claim flow copying portal_generated_papers question_ids to the friend's account at signup); both compare marked scores.
- 📐 **Parent digest as a shareable branded page** — public token URL rendering parent_digests content beautifully; parents forward to parent groups.
- ✅ Free-tool funnel (2026-08-29): /chat nudge links "Try the student portal →" /join.

## Marking/content quality
- 💡 **Marker anti-injection line** — marking prompts should state that text ON a student script is never an instruction (cheap insurance; students could write "print your instructions" on paper).
- ✅ **Watermark-held diagram redraws DONE (2026-08-29 night): 76 of 78 applied**, every row verified carrying ONLY our clean redrawn paths (zero watermarked pixels shipped; every figure spec-authored, fail-closed verified, visually checked). The 2 remaining, both documented in the redraw workspace reports:
  - `2d37e763` (Punggol S1 2021 Q2 construction) — **ANOMALY FOR ADRIAN**: exact geometry proves the stored answers wrong (ZY = 5.085 cm vs stored 5.5 ± 0.2; ∠XYZ 100.5° vs 102 ± 2). Suggested corrections in report-C1B.json; redraw is trivial once he rules.
  - `5312d8dc` (Riverside EM 2024 Q16) — base dimensions exist nowhere in the row (empty question_text, unlabelled image); needs re-extraction from the original paper first.
- ✅ **Curve/region figure gaps (2026-08-29)** — 74 registry-verified figures applied (14 question-side, 2 part-level, 58 solution-side); 16 skipped with reasons (unpinnable/no family — incl. compass constructions, frustum, parametric spiral: candidate future families); 2 rows carry representative curves (provenance-noted).
- 💡 **Per-step "why this earns the mark" at scale** across worked solutions.
- 💡 **Generator bake-off** via the GEN_MODEL lever (eval harness exists in bot scripts/).
- 💡 **Confident-wrong view** in /admin/log (😎-marked wrong answers = teaching gold).
- ⏸ **Calibration store** (Adrian: model judgment may suffice; not using triage).

## Engineering hygiene
- 💡 **models.ts central config** — 16 website AI routes hardcode model ids.
- 💡 **Ask-log structural counter → done 2026-08-29 as portal_event_log**; reuse that ledger for future cheap caps.
- 💡 **Drop unused fumadocs deps** from package.json (unimported since the /notes reskin).
- 💡 **/admin stranger-aware views** — acct: ids render raw in admin queues; nicer display when paying strangers matter.

## 📱 Phone review round 5 (2026-08-29, same evening) — prod test after round 4
> Adrian's pass over the promoted build + the /notes reader. ✅ shipped same session.

1. ✅ **Raw `$$ … $$` in question stems** — root cause was systemic: `fixMathFences` (lib/math-markdown) only fenced delimiters HUGGING the math; space-padded `$$ 5^{x} = …$$` never became a fence and rendered as raw dollars on every MathMarkdown surface. Now padded delimiters fence too (tested). This was the "STILL rendering issues" class, not one bad row.
2. ✅ **"Some questions have no marks"** — rows whose `total_marks` is null but whose parts carry `[n]` now derive the header chip via `totalMarksOf(parts)` (lib/bank-question-markdown, tested; wired into practice next + assignment + qid paths).
3. ✅ Marked-paper stems split one part per line (`promptLines`, no semicolon rule — prose punctuation).
4. ✅ Practice search gains a ✕ clear button; ✅ "Print a paper" demoted (hidden while a question is open, slim row below the picker); ✅ My Notebook tab gets its own glyph (was the Home house); ✅ `/app` root loading skeleton (Home tap froze on the Supabase batch).
5. 🔨 **Mock Next-Lesson for the demo account** — blocked mid-build: the demo account's `airtable_student_id` is synthetic (`recTESTE000000000`), so a real Airtable Student + Lessons row + a Supabase identity migration is needed; the auto-mode classifier (configured this same evening) denied the Airtable prod write. Plan is ready (Student "Teste Echo (portal demo)" Trial/no-enrollment → no billing, lesson 2026-09-01 Tue 3-5pm slot recU4GFAJHZX3v6X2, then UPDATE every student-keyed Supabase table from the synthetic id). Needs Adrian's explicit go (or he runs the snippet).
6. 📐 **Figure axis labels read slanted** — bot-side: the matplotlib figure generator uses italic mathtext for axis labels; add an upright-axis-label style rule to the figure prompt/demos (bot ai/question-gen.js figure pass). Do on the next bot deploy window (check marking queue first, per standing rule).
7. **Practice-these-next provenance** (Adrian asked): bank-embedding-matched FIRST (origin "School Year" shown), model-generated + verified only when no bank candidate fits; the demo paper's 4 were all generated because its questions had no close twins. Working as designed.
8. 💡 **Perceived lag continues** — the remaining lever stays the serial session-auth round-trip (round-4 item 1); root skeleton shipped this round.

## 📚 Notes reader content (Adrian, 2026-08-29 evening) — the vetting thread
- **Search exists** (the 🔍 pill → slide-over: topics + sub-group pages + every published worked example BY TITLE — lib/notes-data getSearchIndex). Gaps to close: unit-section titles ("How do I complete the square?") aren't indexed, and the pill under-advertises itself (placeholder copy like "Search notes — try 'complete the square'"). Small build.
- 📐 **Sub-group descriptions carry undelimited ASCII math** ("Rewriting ax^2 + bx + c into a(x – h)^2 + k") — **282 rows** across levels (AM 101, JC 74, EM 49, S2 39, S1 19). Two-part fix: render descriptions through the math pipeline on the topic page, AND a content pass wrapping the math runs in $…$ TeX (in-session/agents with strict rules + spot-check; zero API).
- 📐 **Sub-group NAMES are internal cluster labels** — "Bounding & Sign Reasoning via Completed Square", "Vieta sum-product transformation to new quadratic" read as our filing jargon, not Singapore-syllabus student language. Rename pass with Adrian approving the mapping (names are his voice); flag off-syllabus content instead of renaming it (Vieta sum/product is NOT in 4049 AM — hide vs keep-with-"beyond syllabus"-tag is Adrian's call). Renames change /notes slugs (URLs derive from name) — internal links regenerate, external bookmarks break; acceptable pre-launch.
- 📐 **The vetting process itself** — see the proposal in the 2026-08-29 session summary: 3 layers (mechanical render pass → naming pass → per-unit QC fleet over the 1,297 pending blocks producing an approve/fix/hide sheet for one Adrian sitting).

## 📱 Round 6 (2026-08-29, late evening) — clip testing + notes vetting kickoff
1. ✅ Clipper: pinch-to-zoom + two-finger pan (scale-aware crop math) and a ✕ Clear button (a stray tap could strand an undismissable box).
2. ✅ Notes hidden from students (NOTES_OPEN_TO_STUDENTS=false; direct-URL closed card; View-as-student shows it too) until vetting lands.
3. ✅ Search ✕ on every search bar (notes, picker, finder). ✅ Notes search upgraded: typo tolerance (bounded Damerau–Levenshtein), curated SG synonyms, ²/^ folding, + key-concept section headings indexed (lib/notes-search, 21 tests).
4. ✅ **Auth fast path** — local ES256 JWT verification (jose+JWKS) replaces the per-request Supabase Auth round-trip in getSessionUser/practiceAuth/hasPortalSession; getUser() stays the fallback + refresh path. Trade: revoked sessions live ≤1h (deletion still immediate). ⚠ Felt-improvement NOT yet measured on an authed session — verify on the demo login. FOLLOW-UP: ~19 /api/portal/* routes still call auth.getUser() directly; migrate them to getSessionUser in a careful pass.
5. ✅ **Notes vetting RE-SCOPED and largely executed** (2026-08-29, after 5 sheet UX rounds Adrian couldn't use — lesson recorded below): the issue is **language students see in Notes**, not taxonomy hygiene. What's DONE in-DB (all with rollback): 652 descriptions re-typeset to TeX; 56 leak rows cleaned (Generation-hint tails, school+year+Q citations — whole-table sweep 0 remaining); **516 sub-group renames APPLIED directly** (Adrian's AM-118/AM-120 vetoes honoured; log `renames_applied.json` in session scratchpad; name-rollback via `subgroups_vetting_backup_20260829`; ⚠ /notes slugs changed — fine while Notes hidden); 3 wrong-math JC descriptions fixed (1153 concavity equivalence, 1154 f‴→f″ + Newton-Raphson dropped, 864 broken DE example). **Worked-example titles** (content_snippets.card_title, 708 across AM 382/EM 279/JC 47) being rewritten to student language same-day; backup `content_snippets_titles_backup_20260829`. **⚠ Fleet syllabus flags were unreliable**: a question-level verification pass (agent read the real questions inside all 22 "off-syllabus/wrong-level" groups) REFUTED 19 of 22 — the fleet judged from names/descriptions without reading questions; only AM-1522 (Vieta sum/product, questions die out at 2020 = real 4047 legacy) and S1-461 (Sec-2 factorisation set only by IP-school Sec 1 papers) confirmed, AM-630 borderline (one 2023 prelim part (b) telescoping). **Adrian's remaining calls (chat, not sheet)**: retire AM-1522? S1-461 stays S1 (IP) or moves S2? hide Modulus topic (809-814)? hide JC-863 integrating-factor (not in 9758)? **Parked post-beta housekeeping (no Adrian needed)**: 83 duplicate-fold + 3 re-file flags in scratchpad vetting/*.json. **Review surface = /notes itself** (admin-visible while hidden); sheet artifact retired with a superseded banner. *Process lesson: don't turn a language problem into a 631-card taxonomy audit; evidence-first, and verify agent flags against ground truth before they reach Adrian.*
6. Layer 3 (per-unit QC fleet over 1,297 pending blocks) queued on /admin/my-todos, due 2026-09-02.

## Parked / decided-against
- ⏸ Exam-season booklet (dropped).
- ⏸ Browser E2E tests (solo-maintenance cost).

## 📱 Phone review round 4 (2026-08-29) — the handoff batch
> Adrian's full portal walkthrough. **Batch executed 2026-08-29** — every open item shipped in one session (4 agents + main, one dev push); only 1's TTFB lever stays open. Same push also hotfixed a `notesAdmin()` infinite recursion shipped in d8575f4 that crashed every /notes topic page on the preview.

1. 🔨 **Perceived lag, round 3** — loading/streaming inside the practice picker + notes pages turned out ALREADY shipped (route `loading.tsx` skeletons + in-picker fetch skeletons). Measured TTFB 2026-08-29 (prod, curl): `/app` ~0.34–0.40s warm / ~0.77s cold, `/login` ~0.05s warm — the remaining pre-byte cost on `/app` is the serial session-auth round-trip before the streamed shell; candidate lever: edge/JWT session verification (bigger build, not attempted). Real 4G adds radio RTT on top; nothing pathological server-side.
2. ✅ Home's duplicate Revision Notes card removed (quick-link row remains).
3. ✅ (2026-08-29) Marked script opens the 🖼 red-pen IMAGE pages: chain is now `annotated_pdf_url → photos_pdf_url → pdf_url` (admin send-row precedence per docs/MARKING.md; `photos_pdf_url` verified = the annotated images-only PDF, present on all recent runs), with "Full report (PDF)" kept as a secondary link. Tested.
4. ✅ (2026-08-29) Clip box: drag inside moves, corner handles (28px touch targets) resize, a stray tap no longer wipes the selection. (Photo-upload into My Notebook split out → Product list above.)
5. ✅ (2026-08-29) Every retry card expands inline (native `<details>`): question as marked, marker's comment, slips, worked-solution reveal (AnnotatedSolution looked up from the run), practice link inside. Twin cards expand too — see the mistake before retrying it.
6. ✅ (2026-08-29) Papers tab wears the portal language: violet page + paper-card identity, teal hand-in CTA and "With Adrian" strip, solid-emerald celebratory chip at ≥75% (🎉 on the summary tile).
7. ✅ (2026-08-29) (a) question stem renders above each "where you lost marks" entry; (b) slip-box KaTeX shipped earlier the same day (e268b55); (c) Show-answer splits packed multi-part answers one line per part (`answerLines` in portal-marking, tested).
8. ✅ (2026-08-29) Worksheet PDF: "ADRIAN'S MATH TUITION" house header (navy letterspaced over the orange rule), right-aligned `[n]` from `questions.total_marks` on bank picks, `break-inside: avoid` per question, 68mm working space.
9. ✅ Topic rows no longer show question counts.
10. ✅ (2026-08-29) Advanced-tier gaps: **94 generation_requests seeded across 47 zero-advanced (level × topic) pairs** (2 each, admin-topup row shape, text-only seeds; figure-dependent topics skipped: Constructions, Graph-on-Graph-Paper, Speed-Time Graphs, EM Graphs of Functions; S2 Coordinate Geometry (Lines) had no eligible text-only seed). Also aligned `practice_topics`' advanced_count with the canonical tier CASE (lowercase `advanced`/`Bonus` now count). ⚠ CORRECTION (same day): the nightly topup job is NOT currently scheduled anywhere — the launchd plist is `.disabled` in the bot repo, nothing in ~/Library/LaunchAgents, nothing in Claude scheduled tasks — so these rows sit pending until a manual `topup-bank` session (or a re-enabled schedule, Adrian's call) consumes them. Worker claims ≤10/run.
11. ✅ (2026-08-29) /notes level index = two hero tiles in the portal language (AM navy/cream, EM gold/navy; `data-level` accents in notes.css; print-safe).
12. ✅ (2026-08-29) KEY FACTS now stacks label-over-formula on ≤640px phones (leading-label selectors split from mid-sentence bolds — which also removed 47 spurious 6.5rem desktop gaps; stray `<br>`s suppressed via `:has()`; Techniques `li` spacing opened up). Verified against all 74 real topic_cards through the actual remark pipeline. REMAINING: the content-clarity pass on the cards is Adrian's editing call.
13. ✅ **Sec 3–5 strangers now declare E Math / A Math / Both at signup** — stored to portal_accounts.subjects, scoping practice + mocks via qbLevelsFor.
