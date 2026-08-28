# IDEAS.md — the consolidated build queue

> **Why this file exists** (Adrian, 2026-08-29): session memory is per-Claude-account;
> this repo travels everywhere. Any session on any account reads THIS for the agreed
> ideas/backlog. Keep entries one-line-ish with status; move detail into docs/ or specs.
> Statuses: 💡 idea · 📐 designed (awaiting go) · 🔨 in progress · ⏸ parked · ✅ shipped (dated, then prune after a while)

## Product — student portal
- 📐 **Animated solution player** — step-by-step web playback of a worked solution (the /solutions presentation style, animated). The "HTML is the new markdown" direction.
- 📐 **Parent monthly digest as a designed HTML page** — shareable branded page instead of text; top pick of the HTML-first ideas.
- 📐 **Auto-renew subscription option** — S$29/mo second button beside the one-time pass; Stripe recurring price + invoice.paid renewals (skip billing_reason=subscription_create); cancel = message Adrian at current scale.
- 📐 **JC mock enablement** — blueprint SHIPPED (JC-P1/P2 with 40/60 section boundary); remaining: MOCK_LEVELS + JC↔blueprint key mapping, 9758 cover code, H2 instructions/calculator wording, admin fetchCandidates level scope. One wiring pass.
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

## Marking/content quality
- 💡 **Marker anti-injection line** — marking prompts should state that text ON a student script is never an instruction (cheap insurance; students could write "print your instructions" on paper).
- 🔨 **Watermark-held diagram redraws** (78 questions) — agent in flight.
- 🔨 **Curve/region figure gaps** (~dozens of rows) — agent in flight.
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
