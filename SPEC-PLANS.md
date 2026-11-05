# 💳 SPEC-PLANS — free tier + paid plans for self-serve students

> **Status (5 Nov 2026): PROTOTYPE, test site only.** Built on `dev`; on the test site
> (`adrianmath-dev.vercel.app`) it is ON, on the main site it is OFF until
> `PLANS_OPEN_TO_STUDENTS` (`src/lib/portal-beta.ts`) is flipped — strangers there keep the
> old S$29 / 30-day pass, unchanged. Prices are placeholders; Adrian decides after trying it.

Adrian, 5 Nov 2026: *"let's build it first, including the pricing, then we can change later,
but let's prototype first"*. Earlier: *"don't price it yet"* until marking got cheaper; a
cheaper-model test failed, so marking stays ≈ US$1.40 (≈ S$1.90) a paper.

## The shape (agreed)

- **Free, no payment:** practice stays open (cheap to run) + **1 marked paper, once** — the
  "show the value before asking for money" step.
- **Paid:** three plans split by **full papers marked per 30 days**.
- **Invite:** a friend who joins through an invite link gets **+1 free marked paper** (in place
  of the old 3-day trial while plans are on). The inviter is still rewarded **only when the
  friend pays** (`lib/referral-reward.ts`, unchanged).
- **Tuition students** (linked to Airtable, not deactivated) are **never limited or charged**.

## The one config place — `src/lib/plans.ts`

Every price and limit is there (`PLANS`, `FREE_MARKED_PAPERS`, `REFERRED_EXTRA_FREE_PAPERS`,
`PLAN_PERIOD_DAYS`, `COST_PER_PAPER_SGD`). Change a number → the plans page, the checkout
price, the meter and `/admin/plans` all follow. `plans.test.ts` fails if any plan's margin at
full use drops under 35 %.

| Plan | Price / 30 days | Papers | Per day | Marking at full use | Card fee | We keep |
|---|---|---|---|---|---|---|
| Free | S$0 | 1 (once) | — | S$1.90 | — | −S$1.90 (the hook) |
| Lite | S$15 | 3 | 1 | S$5.70 | S$1.01 | S$8.29 (55 %) |
| Plus | S$29 | 8 | 2 | S$15.20 | S$1.49 | S$12.31 (42 %) |
| Max | S$69 | 20 | 3 | S$38.00 | S$2.85 | S$28.15 (41 %) |

Plus = the old S$29 pass (8 papers), so nobody's price moves. Most students will not use every
paper, so the real margin is higher. Science papers count too while plans are on (they cost the
same to mark); "From your tutor" assignments never count.

## How it works (reuses the S$29 pass plumbing)

- A plan purchase = a `portal_passes` row, `tier` = `lite|plus|max`, 30 days. Stacking,
  idempotent webhooks and the referral reward are the pass code, unchanged.
  `handinAllowance` / `dailyHandinCapForTier` read plan keys from `lib/plans.ts`; old
  `standard` / `intensive` rows keep 8 / 20.
- **Free papers used** = marked-paper runs stamped `result_json.plan_free = true` by
  `/api/portal/submit` (service-only table — a student cannot reset it).
- **Bonus papers** (invite bonus, Adrian's "+1 free paper") = `portal_passes` rows with
  `source = 'bonus'`, `expires_at = starts_at` (never active), `handins_used` = papers given.
  No new columns: `portal_accounts` is student-writable under RLS, so a counter there could be
  reset; and the live-database migration was not run.
- `lib/plan-usage.ts` counts (`getPlanStatus`, `planStatusFromRows`, `planBlockFor`).
- Gates while plans are on: the `/app` layout lets every signed-in account in;
  `requireActiveAccess` lets a plan-less stranger through as `free`; the submit route refuses a
  paper with **402 + `upgrade: '/app/plans'`** once the free paper / the plan's papers are used.

## Surfaces

- `/app/plans` — where you stand ("1 of 1 left") + the three plans. Test site: "Choose" turns
  the plan on at once, **no money** (`/api/portal/plans/checkout`, `source 'manual'`,
  reference `test-checkout:…`, no referral reward). Main site (switch on): a real Stripe
  Checkout priced from `lib/plans.ts`, `metadata.plan`; the stripe-webhook grants that plan
  (floor = the plan's own price).
- Hand-in pages (`/app/submit`, `/app/science/submit`): a "Your free marked paper is used →
  See plans" card instead of the form.
- Home: one line "📝 1 free marked paper — hand one in" / "5 of 8 marked papers left on Plus".
- `/join` (public): **no prices** — "Free to practise, and your first paper marked free".
  No pricing page anywhere public; `/app/*` is disallowed in robots and not in the sitemap.
- `/admin/plans` (All tools → The machine → 💳 Plans): the money table + every self-serve
  account with plan, papers used, and buttons: → Lite / Plus / Max (ends the current plan now,
  starts 30 days), Reset papers used, → Free, +1 free paper.

## Not done yet (follow-ups for when Adrian likes it)

- **Auto-renew.** Today a plan is bought for 30 days at a time, like the pass. A Stripe
  subscription (renews monthly) needs `invoice.paid` handling.
- **Upgrade mid-plan** stacks the new plan after the current one ends (no days lost). A
  pro-rated switch is not built.
- **Going live:** flip `PLANS_OPEN_TO_STUDENTS`, check the Stripe webhook sees `metadata.plan`,
  update `/app/pass` copy for old holders. Remind Adrian of the company points (`CLAUDE.md`
  §🏢: data belongs to the company; credits) — these plans are papers, not credits yet.
