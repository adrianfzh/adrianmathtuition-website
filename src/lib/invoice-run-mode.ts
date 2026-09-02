// Which invoice run a cron is doing — the normal ADVANCE cycle (generate on the
// 14th, remind on the 14th, send on the 15th) or the year-end ARREARS cycle for
// Oct/Nov/Dec attendance (generate + remind on the 1st, send on the 2nd of
// Nov/Dec/Jan). The rules themselves live in lib/year-end-billing.ts; this file
// is only the plumbing the routes branch on, kept pure so it can be tested.

import { arrearsRunTarget, parseMonthLabel, monthLabel } from './year-end-billing';

export type InvoiceRunMode = 'advance' | 'arrears';

/** Anything with URLSearchParams' get() — i.e. `req.nextUrl.searchParams`. */
export interface QueryLike {
  get(name: string): string | null;
}

function isArrearsValue(v: unknown): boolean {
  return typeof v === 'string' && v.trim().toLowerCase() === 'arrears';
}

/**
 * 'arrears' when the query string says `?mode=arrears` (how the Vercel cron
 * fires it) or a manual JSON body says `{ mode: 'arrears' }`. Anything else —
 * including a missing/blank/unknown mode — is the normal advance run.
 */
export function resolveRunMode(query?: QueryLike | null, body?: unknown): InvoiceRunMode {
  if (isArrearsValue(query?.get('mode'))) return 'arrears';
  if (isArrearsValue((body as { mode?: unknown } | null | undefined)?.mode)) return 'arrears';
  return 'advance';
}

/**
 * The invoice `Month` label a run targets:
 *   advance → `advanceLabel` (the caller's getInvoiceMonth().label)
 *   arrears → arrearsRunTarget(todayISO).invoiceLabel — 1 Nov → "October 2026",
 *             1 Dec → "November 2026", 1 Jan → "January 2027" (Dec+Jan combined)
 * A well-formed explicit month always wins, so a manual run can redo an older
 * month. A malformed one is ignored rather than used to build a filter.
 */
export function resolveTargetMonthLabel(opts: {
  mode: InvoiceRunMode;
  todayISO: string;
  advanceLabel: string;
  explicitMonth?: unknown;
}): string {
  const explicit = typeof opts.explicitMonth === 'string' ? parseMonthLabel(opts.explicitMonth) : null;
  if (explicit) return monthLabel(explicit.year, explicit.month);
  if (opts.mode === 'arrears') return arrearsRunTarget(opts.todayISO).invoiceLabel;
  return opts.advanceLabel;
}

/**
 * The `job_runs` name to stamp. The arrears crons keep their own logbook rows
 * so a missed one alarms on its own schedule (JOB_RHYTHMS in lib/job-health.ts
 * carries `-arrears` twins with months [1, 11, 12]).
 */
export function jobNameFor(
  base: 'send-invoices' | 'payment-reminder' | 'generate-invoices',
  mode: InvoiceRunMode,
): string {
  return mode === 'arrears' ? `${base}-arrears` : base;
}

/**
 * The evening payment-reminder Telegram. Advance mode is the long-standing text
 * (invoices generate the next morning at 7am); arrears mode reports drafts that
 * were generated the SAME morning and auto-send the next day at 10am SGT.
 */
export function buildPaymentReminderMessage(mode: InvoiceRunMode, targetMonthLabel: string): string {
  if (mode === 'arrears') {
    return `💰 <b>Payment Reminder — arrears invoices</b>\n\n` +
      `The ${targetMonthLabel} arrears drafts were generated this morning and will ` +
      `send automatically tomorrow (the 2nd) at 10am SGT unless paused.\n\n` +
      `Review them at /admin/invoices, and go to Airtable → Invoices → tick Is Paid for received payments.`;
  }
  return `💰 <b>Payment Reminder</b>\n\n` +
    `Remember to check payments received and update Airtable before ` +
    `invoices generate tomorrow at 7am.\n\n` +
    `Go to Airtable → Invoices → tick Is Paid for received payments.`;
}
