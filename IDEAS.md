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
