# Paid WhatsApp trials + the parent fact sheet

**Where things stand (12 Oct 2026):** built in both repos, **switched off**. Fly secret
`TRIAL_PREPAY` is unset (= off), so parents still get the old trial card that Adrian confirms by hand.
Website on `dev`. Bot commit made but **not pushed**: a push to the bot's `main` deploys
production, so it waits for Adrian's word. Still needed before parents see any of it:

1. Adrian approves the two new WhatsApp messages word for word (below). Set `approved: true`, then
   `/wa submit trial_followup` + `trial_reminder`, then put each `HX…` id in with `/wa <key> sid HX…`.
2. Stripe dashboard → the existing webhook endpoint: no change needed (it already sends
   `checkout.session.completed` + `async_payment_succeeded`; the trial branch rides on it).
3. `TRIAL_PREPAY=test` → Adrian runs the whole journey from his own WhatsApp (pays $80, presses Refund).
4. `TRIAL_PREPAY=on`.

## What Adrian asked for (12 Oct 2026)

- *"yes"* to the bot answering a new parent's questions from one fact sheet; *"yes"* to the prices
  ($320 / $360); keep the location general.
- *"trial lesson is still free, allow parents to book trial lesson on their own, but if book trial
  lesson through whatsapp on their own, they need to pay for the trial lesson, to be refunded when
  trial lesson is completed"*. Fee: *"yes"* to **$80 Secondary, $90 JC**.
- *"after the trial lesson, ask if student will continue, if so, pick an (available) timing, then a
  start date, if sign up, amount will be used to offset the first invoice. if not continuing, then
  put request for refund of trial lesson"*.

## The journey

| Step | Where | What happens |
|---|---|---|
| Question | bot `lib/parent-facts.js` | Unknown number asks something → answered from `FACTS` (fast model, JSON `{answer}`; null → relayed to Adrian as before). Adrian sees every question + the answer in Telegram. |
| Book | bot `handlers/whatsapp.js startPaidTrial` | "trial" → level → subject → slot (next 2 weeks, joinable) → name → row in `trial_bookings` (`awaiting_payment`) → link `/trial/pay/<id>`. The slot is not held until paid. |
| Pay | website `src/app/trial/pay/[id]/route.ts` | GET shows the summary + Pay button (never creates anything — link previews fetch it). POST → Stripe Checkout (`lib/stripe-api.ts`, metadata `kind=trial`). Link lasts 48 h. |
| Paid | website `stripe-webhook` → `lib/trial-paid.ts` → bot `POST /api/internal/trial-paid` → `handlers/trial.js bookPaidTrial` | Amount checked; capacity re-checked; Airtable `Lessons` Type Trial; WhatsApp confirmation; opt-in recorded (the confirmation says we will ask after the trial; STOP works); Telegram note. Full → `slot_full` card. Bot unreachable → 500, Stripe retries. |
| After | bot `runTrialFollowups`, every 30 min | 8 pm SGT on the trial day → lesson Absent → `no_show` card; Cancelled/Rescheduled → `cancelled` card; otherwise template `trial_followup`. No answer 2 days → `trial_reminder` once. 7 days → `no_reply` card. Could not send → card asking Adrian to ask. |
| Yes | bot `trialAnswer` / `handleContinueStep` | weekly slot with room (trial's slot first) → stream (Sec only: G3/G2/G1/IP) → start date (4 weekly dates) → signed sign-up form (`generateSignupUrl` with the trial lesson id + start date). Adrian gets a note. |
| Sign-up | website `api/signup` Step 2c | Paid trial found by `lesson_id` → `Line Items Extra` "Trial lesson fee (already paid)" −$80, Final Amount reduced, Auto Notes line, row → `signed_up` + `invoice_id`. The first invoice is emailed straight away with the welcome email, as before. |
| No | bot `trialAnswer` | row → `declined`; card to Adrian **💸 Refund $80 / Keep the fee**. |
| Refund | bot `trf:<id>` → website `api/bot/trial-refund` | Only on Adrian's tap. `refundCheck` (never twice, never after the bill credit) + Stripe Idempotency-Key `trial-refund-<id>`. Parent told on WhatsApp. |

Statuses: `awaiting_payment → paid → booked → asked → continuing → signed_up`; side exits
`expired`, `slot_full`, `no_show`, `cancelled`, `no_reply`, `declined`, `refunded`, `kept`.

## Money rules (tested)

- Fee table in two places, kept equal: website `src/lib/trial-booking.ts trialFeeCents`, bot
  `lib/trial-booking.js feeCents` (both tested).
- Credit only for a paid, unrefunded, not-yet-credited fee (`trialCreditLine`). Refund only for a
  paid, unrefunded, uncredited fee (`refundCheck`).
- Stripe key: `STRIPE_SECRET_KEY` (restricted). Refunds write: confirmed 12 Oct (a fake id got
  "no such payment", not "permission denied"). Checkout create: not tested from a session (it would
  make a real payment page) — Adrian's test run checks it.

## The two messages awaiting Adrian's yes (bot `lib/whatsapp-templates.js`)

- `trial_followup`: "Dear Parent, thank you for attending the AdrianMath trial lesson. / Will {{1}} be
  continuing with weekly lessons? / If yes, the trial fee is taken off the first bill. If not, it is
  refunded in full. Please tap a button below." Buttons: Yes, continuing · No, thank you.
- `trial_reminder`: "Dear Parent, a gentle reminder from AdrianMath. / Will {{1}} be continuing with
  weekly lessons after the trial? / Please tap a button below so we can arrange the next step. Thank
  you." Same buttons.

## Watch

- Health check `trial-pay-page`; `JOB_RHYTHMS['trial-followup']` (2 h).
- WhatsApp's 24-hour rule: the confirmation and the "refunded" line are free text, so they only
  arrive inside 24 h of the parent's last message. Each one that fails says so on Adrian's card.
