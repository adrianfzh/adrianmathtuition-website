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

**Two regeneration routes, one intent each — don't merge them:** `generate-pdf-batch` renders the invoice **as stored** (the ✏️ Amend form's manual line-item/credit edits, verbatim); `regenerate-invoice` (the ♻️ Regenerate button) **recalculates** line items from the current schedule (preserving manual `Line Items Extra`). **Issue Date is one shared rule for both** — `resolveInvoiceIssueDate(status, currentIssueDate, todayISO)` in `lib/invoice-month.ts` (unit-tested): a **Sent** invoice being regenerated is *reissued* → **today** (SGT, via `sgtTodayISO()`); a fresh Draft → the **15th**; an unsent Draft with a date → **preserved**. Never re-implement this in a route or the `admin-invoices` PATCH — an amended Sent invoice must carry today's issue date, and the split where one path stamped today and another preserved the old date is exactly the bug that put a stale 15 Jul date on Kiara's amended Aug invoice.

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
