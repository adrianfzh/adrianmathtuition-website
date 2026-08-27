---
name: invoices
description: MANDATORY before touching invoices or billing — /admin/invoices, generate-invoices, send-invoices, payment-reminder, receipts, deferred adjustments, invoice PDFs, or Resend email delivery. Routes you to the area runbook before any code is written.
---

# Invoices & billing — read the runbook first

**Read [`docs/INVOICES.md`](../../../docs/INVOICES.md) in full before writing
or editing any invoice code.** That file is the source of truth — this skill
only routes you there and pins the traps that shipped real bugs:

- **Money and date logic lives in pure `src/lib/` functions with tests** —
  `billing-math.ts` (never re-implement a weekday/proration loop; a duplicated
  loop dropped the last Friday of a month), `invoice-month.ts`,
  `invoice-payments.ts`, `additional-lessons.ts`. Fixing a money bug = adding a
  named regression test.
- **The Additional-lessons linked-record bug**: filtering Airtable linked
  records by record ID silently matches nothing — every Additional lesson went
  unbilled for months. Window-fetch and match the student ID in JS
  (`lib/additional-lessons.ts` is the pattern).
- **`Line Items` / `Line Items Extra` are JSON strings** in Airtable long-text
  fields — always `JSON.parse()`.
- Cron rhythm: generate 14th 7am → reminder 14th 8pm → send 15th 10am SGT
  (Vercel can fire up to ~20 min late). Success paths stamp `job_runs`.
