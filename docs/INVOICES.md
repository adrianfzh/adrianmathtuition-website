# Invoices & Email Delivery — detailed docs

> Split out of `CLAUDE.md` on 2026-08-04. **MANDATORY reading before touching
> invoice generation/regeneration, `/admin/invoices`, Resend email paths, or
> anything that changes a dollar amount.** Money logic rules (pure functions in
> `src/lib/` + tests) are in the root [`../CLAUDE.md`](../CLAUDE.md) Testing policy.

## Invoice Flow

1. `generate-invoices` (14th 7am) → counts lessons per enrollment → creates Draft invoices with Line Items JSON
2. `payment-reminder` (14th 8pm) → Telegram reminder
3. Admin reviews on `/admin/invoices` → adjusts amounts, approves
4. "Generate Missing PDFs" → `generate-pdf-batch` → Puppeteer → Vercel Blob → PDF URL in Airtable
5. `send-invoices` (15th **10am SGT** — `0 2 15 * *` UTC in vercel.json; Vercel fires crons up to ~20 min late, e.g. 10:18–10:20 on 15 Jul 2026) → Resend email with PDF attachment → marks Sent
6. **Prorated months (June, Oct–Dec) bill in arrears instead** — step 1 creates nothing for them; `generate-invoices?arrears=1` (**1st of the following month, 9am**) makes the Drafts from Completed lessons and `send-invoices?arrears=1` (**2nd, 10am**) sends them → "Prorated months" below

**Two regeneration routes, one intent each — don't merge them:** `generate-pdf-batch` renders the invoice **as stored** (the ✏️ Amend form's manual line-item/credit edits, verbatim); `regenerate-invoice` (the ♻️ Regenerate button) **recalculates** line items from the current schedule (preserving manual `Line Items Extra`) — precisely: **Regular lines are rebuilt** from the month's non-cancelled lessons (**Completed only for a prorated month**), and the **Additional lines stay exactly as the generator billed them** (`lib/regenerate-line-items.ts`, unit-tested). Until 2026-09-02 Regenerate re-derived additionals from the month window, which silently dropped every billed out-of-window Additional line (the generator's window is the 15th of the previous month → run day, so nearly all of them) and re-added in-window ones without ticking `Billed`, so the next generator run billed them again. To drop a billed Additional lesson that was later cancelled, ✏️ Amend. **Issue Date is one shared rule for both** — `resolveInvoiceIssueDate(status, currentIssueDate, todayISO)` in `lib/invoice-month.ts` (unit-tested): a **Sent** invoice being regenerated is *reissued* → **today** (SGT, via `sgtTodayISO()`); a fresh Draft → the **15th**; an unsent Draft with a date → **preserved**. Never re-implement this in a route or the `admin-invoices` PATCH — an amended Sent invoice must carry today's issue date, and the split where one path stamped today and another preserved the old date is exactly the bug that put a stale 15 Jul date on Kiara's amended Aug invoice.

### Prorated months (June + Oct–Dec) — billed from Completed lessons, in arrears

`PRORATION_MONTHS = [6, 10, 11, 12]` (`lib/arrears-invoices.ts` — the ONE list; `generate-invoices`,
`regenerate-invoice`, `holiday-optout` and the 12th/13th reminder crons all import it): instead of projecting slot
occurrences forward, these months bill the student's actual **Completed Regular lessons**
inside the invoice month (June = holiday month, Oct–Dec = year-end taper). The lesson pool
is **ONE window fetch for all students** — formula + per-student JS matching in
`lib/prorated-lessons.ts` (unit-tested); never re-add a `{Student}=` clause or an
inclusive `{Date}<=` bound to it (see history below). Month windows anywhere in invoice
code use the shared half-open `monthWindowClause(year, month)` from `lib/billing-math.ts`
(also used by `regenerate-invoice`).

**Arrears trigger (built 2026-09-02; October 2026 is the first live month).** Two crons in
`vercel.json`; both stamp `job_runs` **every month** (a quiet "not a prorated month" no-op
on the other eight, so the rhythm alarm can tell a quiet month from a dead cron —
`docs/OPS.md`):

| When (SGT) | Cron | Does |
|---|---|---|
| **1st, 9am** | `GET /api/generate-invoices?arrears=1` (`0 1 1 * *`) | Drafts for the **just-ended** month, only if it was prorated. Same Telegram summary as the 14th run, headed "(arrears)", plus a ❓ list of that month's lessons still `Scheduled` (attendance never marked) — those are **not billed**; mark attendance, then ♻️ Regenerate. Stamps `prorated-arrears`. |
| **2nd, 10am** | `GET /api/send-invoices?arrears=1` (`0 2 2 * *`) | Sends those Drafts through the **same conservative classifier** as the 15th send (`isCleanRegular` — anything with extras / adjustments / Auto Notes is 🚩 held for review). Stamps `prorated-arrears-send`. Needed because the 15th cron only ever looks at `getInvoiceMonth()` = next month, so arrears drafts would otherwise never be sent. |

- **The 14th cron creates NOTHING for a prorated target month.** It used to skip everyone
  (0 Completed lessons) *except* students with billable Additional lessons, who got an
  invoice carrying only those — and the arrears run then saw "already has an invoice"
  and their Completed lessons were never billed (the "additionals-only trap"). Now it
  early-exits with a Telegram note ("bills in arrears — no drafts today") and still stamps
  `generate-invoices`. The 12th (`invoice-reminder`) and 13th (`pre-invoice-reminder`)
  Telegram crons say the same thing in advance.
- **Additional lessons around a prorated month ride the arrears invoice.** The arrears
  run's Additional-lesson window starts on the **15th two months before** the prorated
  month (`arrearsAdditionalWindowStartISO`; October 2026 → 15 Aug 2026) — the batch the
  now-silent 14th cron would have carried. Trade-off: those lessons are billed ~6 weeks
  later than they were. Overlap with neighbouring runs is safe: `Billed` is the
  double-billing guard, the window only a fetch bound.
- **Backstop for the trap:** an arrears run normally skips a student who already has an
  invoice for the month silently — but if none of their live invoices bill a regular
  lesson (`existingInvoicesMissRegulars`: additionals-only / Adjustment / all Voided; a
  Revision Sprint invoice counts as covering June) while they DO have Completed lessons,
  the student is listed under "Skipped with a flag" with the unbilled count. Fix by
  ✏️ Amend or ♻️ Regenerate that invoice.
- **Dates:** arrears invoices are issued on the **2nd** and due on the **15th of the
  following month** (`arrearsInvoiceDates`) — the pre-month defaults would stamp a Due
  Date already in the past. `regenerate-invoice` applies the same rule.
- **Manual runs:** `POST /api/generate-invoices {"month":"October 2026"}` after the month
  ends still works (existing invoices skipped; the stamp goes to `prorated-arrears`
  because the slug follows the run's shape, so a manual re-run after a failed 1st-of-month
  cron silences the alarm). **Before the month ends it is refused (400)** unless the body
  carries `{"force":true}` — a partial-month arrears invoice is almost never wanted; the
  `/admin/invoices` Generate button surfaces that message. Drafts created after 10am on
  the 2nd have no cron coming — send them from `/admin/invoices` (the Telegram summary
  says so).
- **`pause_auto_send` is month-agnostic:** it pauses whichever actual-cron send fires
  next (15th regular or 2nd arrears) and then clears; a quiet-month arrears no-op exits
  before the check and never consumes it.
- Deferred adjustments targeting a prorated month are applied by the arrears run (until
  then they stay parked and are flagged as unapplied by the 14th run's summary).

Date rules: `lib/arrears-invoices.ts` (`PRORATION_MONTHS`, `justEndedMonth`, `monthHasEnded`,
`arrearsInvoiceDates`, `arrearsAdditionalWindowStartISO`, `arrearsSendAtISO`,
`existingInvoicesMissRegulars`) + `arrears-invoices.test.ts`; the unmarked-lesson formula is
`proratedUnmarkedFormula` in `lib/prorated-lessons.ts` (tested).

> ⚠ History (fixed 2026-09-02): from launch, the prorated branch filtered
> `{Student}='recXXX'` — matches NOTHING on a linked field (CLAUDE.md Gotchas; the same
> bug class that unbilled every Additional lesson until 2026-07-26) — and ended its window
> `{Date}<='monthEnd'`, which drops lessons ON the month's last day. Net effect: **no
> prorated month had ever billed a single regular lesson**, even on manual arrears re-runs.
> `regenerate-invoice` carried the same inclusive-bound bug (a regenerated invoice lost
> its last-day lesson). Regression tests: `lib/prorated-lessons.test.ts` +
> `monthWindowClause` block in `lib/billing-math.test.ts`.

**`/api/admin-invoices` GET windows PAID invoices to the last ~5 months** (`paidWindowCutoffISO` in `lib/invoice-month.ts`, unit-tested) so the Airtable scan doesn't grow a serial pagination page every ~2 months; unpaid/unsent are always included regardless of age; `?all=1` = full history (the month filter's "Earlier months…" option triggers it).

### Deferred Adjustments (carry a credit/charge to a FUTURE month's invoice)

For when an adjustment must land on a month whose invoice doesn't exist yet (e.g. a referral credit deferred from June to July). Stored on the student's **current** invoice via 4 Invoices fields:

| Field | Type | Notes |
|---|---|---|
| `Deferred Amount` | Currency | Signed — negative = credit, positive = extra charge |
| `Deferred Note` | Long text | Reason, shown as the line-item description on the future invoice |
| `Deferred To Month` | Single line text | Target month, exactly `Month YYYY` (e.g. `July 2026`) |
| `Deferred Applied` | Checkbox | Auto-ticked by the generator once applied (applies exactly once) |

- **Set it:** via the Invoice Assistant AI ("defer Kiara's −$280 referral to July") → `patch_invoice` sets the 4 fields; or manually in Airtable.
- **Set automatically (referral reward, 2026-09-02):** when an invited friend's paid pass clears and the inviter is a TUITION student, the payment webhooks write a −S$10 carrier themselves — `lib/referral-invoice-credit.ts` (pure logic + tests), idempotent per checkout session via Supabase `referral_invoice_credits` (payment_reference UNIQUE). Target month: next month before the 14th SGT, the month after next from the 14th on — never a month the generator has already passed (a stale label would sit in the banner forever). It never clobbers a pending deferral (picks a free carrier record; falls back to the manual "apply by hand" Telegram when none). Success Telegram is a receipt only.
- **Apply:** `generate-invoices` queries `AND({Deferred To Month}='<month>', NOT({Deferred Applied}), {Deferred Amount}!=0)`, adds a `Line Items Extra` line to that student's new invoice, bumps `Final Amount`, appends `Auto Notes`, ticks `Deferred Applied`. If no invoice exists that month to attach to, it's left unapplied (resurfaces next run) and flagged in the Telegram summary.
- **Banner:** `/admin/invoices` shows a blue "⏰ Pending adjustments" banner (data from `/api/admin-invoices/deferred-pending`) grouped by target month, each with a ✕ Cancel button.
- PDF caveat: like referral credits, the deferral changes `Final Amount` after the draft PDF was rendered — regenerate PDFs before sending (the normal draft-review step covers this).

## Email delivery reliability

Resend returns **200 + an email id even when it SUPPRESSES** a send (address blocked because a prior email to it hard-bounced or was marked spam) — the mail is never delivered. So "Resend accepted it" ≠ "delivered". Two guards:

- **Send-time suppression check** (`send-invoices`, `admin-emails` resend, `mark-paper-send`, `welcome-email`): after the Resend POST, GET the email's `last_event`; if `suppressed`/`failed`/`bounced`, treat it as **not delivered** — the invoice is NOT marked `Sent`, the EmailLog row is `failed`, the Telegram summary reports it under "NOT delivered", and the bot send shows ❌.
  **All four call sites share `lib/resend-verify.ts` (pure classifier + tests) — never re-inline this check.** Its verdict has **three** states, not two: `ok`, `not-delivered`, and `unavailable`. The third exists because the read-back can itself stop working: a Resend key downgraded to **"Sending access"** answers **403 code 1010** to every GET, and the original inline guard was `if (st.ok) { … }`, so a 403 fell through as *"nothing wrong here"* and the invoice was marked Sent unverified. **A check that could not run is not a check that passed.** `unavailable` is split by `permanent`: 401/403 is a config fault that never fixes itself → Telegram ⚠️ "delivery verification is OFF" (once per batch in `send-invoices`, not once per invoice); 404/429/5xx/timeout is a slow night → stays quiet, the webhook is the async backstop. The send itself is never blocked by a monitoring failure.
- **Resend webhook** (`/api/resend-webhook`): real-time async events (`delivered`/`bounced`/`complained`/`delivery_delayed`) update the EmailLog `Status` by Resend ID and **Telegram-alert on bounce/complaint**. Setup: Resend dashboard → Webhooks → add `https://www.adrianmathtuition.com/api/resend-webhook`, subscribe to those events, put the signing secret in `RESEND_WEBHOOK_SECRET` (Svix-verified; if unset, events still flow but unverified). To clear a stuck address: Resend dashboard → Suppressions → remove it, then resend.
- **`resend-delivery-read` health check** (6h cron): reads the newest EmailLog row's Resend ID back from `/emails/{id}` and goes red on 401/403 only. The older `resend` check pings `/domains` and proves the API *answers*; this one proves the key can still **read**, which is the exact permission the suppression guard needs. They are not the same check — a send-only key sends perfectly and 403s every read, so without this a guard that had stopped guarding stayed green forever. Fix is always the same: Resend dashboard → API Keys → **Full access**.

Email Log resend (`/api/admin-emails` POST) re-attaches the archived PDF and posts a Telegram confirmation ("↩ Email resent" / "⚠️ Resend NOT delivered").

### Email footer — the WhatsApp assistant line

The invoice footer's reschedule paragraph points parents at the **Twilio assistant
line** (`KIOSK_WA_NUMBER`), never Adrian's personal number. Its formatting lives in
`lib/wa-number.ts` (`waDigits` for the `wa.me` link, `waDisplay` for the visible
text) and is unit-tested — **do not re-inline it into an email template.**

Why the test exists: the inline formatter shipped on 10 Aug 2026 with its
replacement string written as `'1ドル 2ドル'` — a currency-localised mangling of the
backreferences `'$1 $2'`. With the backreferences gone the regex still matched all
eight digits and swapped them for that literal, so the number was not reformatted,
it was erased: one parent was emailed *"WhatsApp our assistant at 1ドル 2ドル"*
(Jeanette Tan, 15 Aug). It type-checked, never threw, and reads as ordinary text in
a diff. Only an assertion on rendered output catches this class of bug, so
`wa-number.test.ts` asserts the shape `/^\d{4} \d{4}$/` and the absence of `$`.
The paragraph was pulled 15 Aug and restored 1 Sep 2026 on Adrian's instruction.

### Re-sending an invoice — `resend: true`

`POST /api/send-invoices {recordId, resend: true}` sends an **unchanged** invoice
again (first email lost, junked, or defective). Without the flag, any invoice whose
earlier EmailLog row carried a PDF is classified as an AMENDMENT — subject becomes
"AMENDED Invoice for …" and the body reads *"this replaces the previously sent
invoice, disregard the earlier email"*. That is correct when the figures changed and
misleading when they did not; the classifier cannot tell the cases apart, so the
caller declares which it is. Add `preview: true` to see the exact email without
sending. Note the Email Log's own resend button replays the ARCHIVED body verbatim —
use it only when you want the original bytes, mistakes included.

## Delivery receipts — the webhook, and why the log said `sent` for three months

`/api/resend-webhook` turns Resend's delivery events into the EmailLog row's
`Status`, so "did the parent actually get it?" is a glance at the row instead of
an investigation. It was built in June 2026 and answered that question for
**zero** of 279 emails until 1 Sep 2026, because of two independent faults that
each fail in total silence:

1. **The subscription.** The endpoint was live, enabled, and pointed at the
   correct `www` URL — subscribed to `email.delivery_delayed` and nothing else.
   A delayed email is rare, so the endpoint was simply never called. Adrian added
   the other four events on 1 Sep.
2. **The write.** `Status` is an Airtable singleSelect whose only options were
   `sent` and `failed`. Writing an unlisted option to a singleSelect is a 422,
   and the PATCH is wrapped in `.catch(console.error)` — a webhook must return
   200 or Resend retries forever. So the first `delivered` event to arrive would
   have failed invisibly too. Fixed 2 Sep with `typecast: true`
   (`lib/email-status.ts`), which makes Airtable create the option on first use.
   The API token has no `schema.bases:write` scope, so adding the options by hand
   was not available; typecast is safe here because `STATUS_BY_EVENT` is a closed
   five-value set.

**If you touch delivery status, check both halves.** Code review sees the second
fault at best; only the Resend API sees the first:

```
curl -s https://api.resend.com/webhooks -H "Authorization: Bearer $RESEND_API_KEY"
```

(needs a Full-access Resend key — a sending-only key 403s with error 1010). The
same lesson as the mangled WhatsApp number above: **an integration that
type-checks, deploys, and throws nothing is not an integration that works. Only
an assertion on real output proves it.**
