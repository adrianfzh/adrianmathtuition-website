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
- 📐 **Notes bulk approval**: 594 learning-unit blocks approved (live to students) vs **1,297 pending** (invisible to students). Options: Adrian approves topic-by-topic via the /notes Review bar, or a session runs a QC pass over all pending (correctness + readability) and he bulk-approves. Also: KEY FACTS/TECHNIQUES mobile readability fix (label/text wrap breaks mid-sentence — notes.css).

## Growth builds (Adrian-approved directions)
- 📐 **Shareable result cards** — branded score image on release ("marked by AdrianMath" — NOT "overnight"), one tap to WhatsApp, invite link baked in. BUILD FIRST of the growth loops.
- 📐 **"Challenge a friend"** — share a generated mock so the friend sits the IDENTICAL paper (needs a claim flow copying portal_generated_papers question_ids to the friend's account at signup); both compare marked scores.
- 📐 **Parent digest as a shareable branded page** — public token URL rendering parent_digests content beautifully; parents forward to parent groups.
- ✅ Free-tool funnel (2026-08-29): /chat nudge links "Try the student portal →" /join.

## Marking/content quality
- 💡 **Marker anti-injection line** — marking prompts should state that text ON a student script is never an instruction (cheap insurance; students could write "print your instructions" on paper).
- 🔨 **Watermark-held diagram redraws** (78 questions) — in flight at handoff (2026-08-29 night, re-permitted to fan out). Workspace: ~/Documents/Claude/Projects/AdrianMath/diagram-recovery-2026-08/redraw/ (render.js, guarded apply-one.js, batch manifests G1/G2/T1/J1/S1/C1/M1, held lists). If unreported when you read this: check live progress (questions.solution_images counts) + the workspace, finish remaining batches through the guarded apply, never ship watermarked crops.
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
> Adrian's full portal walkthrough. ✅ = fixed same day; the rest are specs for the next session (any account — this file IS the handoff, CLAUDE.md points here).

1. 💡 **Perceived lag, round 3** — streaming shipped for Home; next: loading/streaming inside practice picker + notes pages, and measure real mobile TTFB (his 4G/5G loads still feel slow; serverless cold starts contribute).
2. ✅ Home's duplicate Revision Notes card removed (quick-link row remains).
3. 📐 **Marked script should open the IMAGE pages, not the full assembled PDF** — FACTS (2026-08-29): portal-marking.ts:355 ALREADY prefers `annotated_pdf_url || pdf_url`; Adrian's demo run predates annotated_pdf_url (null → fell back to the full PDF). Remaining work: confirm against docs/MARKING.md which field is the red-pen images-only PDF (`photos_pdf_url` is suspected = the Telegram images PDF; must NOT be raw unmarked photos) and add it to the chain; optionally keep "Full report (PDF)" as a secondary link. Verify on a fresh run.
4. 📐 **Clip box UX**: drag-to-move + corner resize (today every tap redraws the box) — src/app/app/marking/ClipToNotes.tsx. PLUS the bigger idea: **photo-upload into My Notebook** (student photographs any external work → gallery), and auto-organization (topic/paper albums) as volume grows — portal_notes gains source 'upload', topic tagging UI.
5. 🐛 **My Notebook retry cards don't respond to taps** — cards without a bank twin have no action (only "Try a similar one" links exist when variant_qb_id is set). Make EVERY card tappable: with twin → practice qid; without → inline detail (their score, the marker's comment, solution reveal from the run). src/app/app/my-notes.
6. 📐 **Papers tab visual pass** — bring Home's colourful tile language (teal hand-in, violet marked, celebratory score chip).
7. 📐 **"Where you lost marks" upgrades** — (a) show each QUESTION's stem above the feedback (students can't tell what the comment refers to); (b) FIX RAW LaTeX: the yellow annotation boxes show literal $…$ — render KaTeX there; (c) readability: Show-answer content crams onto one line — multi-line layout. src/app/app/marking + portal-marking fields.
8. 📐 **Follow-up worksheet PDF (Practice these next → Download)**: brand header in house style — "ADRIAN'S MATH TUITION" navy letterspaced over a rule, like the Worked Solutions header Adrian showed; add marks [n] per question; `break-inside: avoid` so a question + its working space never straddles pages; more generous working space.
9. ✅ Topic rows no longer show question counts.
10. 📐 **Advanced-tier gaps** — some topics have zero Advanced questions (picker shows "none yet"): SQL the empty (topic × advanced) pairs → seed generation_requests → the nightly plan-billed topup authors them through the 4 gates. Zero-API-cost path exists.
11. 📐 **/notes level index (A Math / E Math cards) redesign** — dull; give it the portal's hero/colour language.
12. ✅ Review/DRAFT admin chrome on /notes now hidden under "View as student" (it was never student-visible — admin cookie chrome — but must not look student-facing in review). REMAINING 📐: the KEY FACTS/TECHNIQUES blocks are hard to read on mobile (label/text column wrap breaks mid-sentence — notes.css table layout) + a content-clarity pass is Adrian's editing call.
13. ✅ **Sec 3–5 strangers now declare E Math / A Math / Both at signup** — stored to portal_accounts.subjects, scoping practice + mocks via qbLevelsFor.
