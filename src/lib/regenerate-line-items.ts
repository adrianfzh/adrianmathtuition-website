/**
 * Line-item rebuild for /api/regenerate-invoice (non-first-invoice path).
 *
 * Regenerate recomputes an invoice from the CURRENT schedule. The rules:
 *
 * 1. Regular lines come from the month's lessons (the caller fetches every
 *    non-cancelled lesson in the month window and filters to the student).
 *    - advance months are billed as a projection, so 'Scheduled' (attendance
 *      not yet marked) lessons count — `prorated: false`;
 *    - `prorated: true` keeps only 'Completed' lessons (attendance billing).
 *      The year-end arrears rebuild (Oct–Dec + the combined January,
 *      lib/year-end-billing.ts) does NOT come through here: it reuses the
 *      1st-of-month run's own line builders in lib/arrears-lines.ts, so a
 *      rebuild can never disagree with what the cron drafted.
 *
 * 2. Additional lines are KEPT exactly as the generator billed them. The
 *    advance generator bills Additional lessons from a rolling window (15th of
 *    the previous month → run day; the arrears run sweeps three months) and
 *    ticks the lesson's `Billed` box — most of those dates fall OUTSIDE the
 *    invoice month. Regenerate used to re-derive additionals from the month
 *    window instead, which (a) silently DROPPED every billed out-of-window
 *    Additional line and (b) ADDED in-window ones without ticking Billed, so
 *    the next generator run billed them again. Found 2026-09-02; fixed here
 *    for every month. To remove a billed Additional lesson that was later
 *    cancelled, amend the invoice.
 *
 * 3. A MOVED lesson is billed ONCE, on the row that happens (25 Oct 2026).
 *    The admin reschedule leaves the original as Status 'Rescheduled' and adds
 *    a Type 'Rescheduled' replacement that carries the original's
 *    `Billing Month`. The rebuild used to bill both — Ian Chen's November 2026:
 *    three Sundays moved to Saturdays came out as 6 lessons / $480 instead of
 *    3 / $240, every line labelled with the old Sunday slot. Now:
 *    - an original with Status 'Rescheduled' is never a line (its replacement is);
 *    - a lesson whose `Billing Month` names another month belongs to that
 *      month's invoice, even when it is dated inside this one; the caller also
 *      fetches rows whose `Billing Month` names this month, so a lesson moved
 *      out of the month is still billed here;
 *    - the line shows the slot the lesson actually happens in (`slotLabel`).
 */

export interface StoredLineItem {
  date: string;
  day?: string;
  type?: string;
  description?: string;
  [key: string]: unknown;
}

export interface MonthLesson {
  date: string;
  /** Airtable Lessons `Type`: Regular | Additional | Trial (missing → Regular). */
  type?: string;
  /** Airtable Lessons `Status`: Scheduled | Completed | Cancelled | Cancelled - Prorated. */
  status?: string;
  /** Airtable Lessons `Billing Month` ("November 2026"); blank → the month it is dated in. */
  billingMonth?: string;
  /** The lesson's own slot, e.g. "Sat 1-3pm" — wins over the enrollment's label. */
  slotLabel?: string;
}

export interface RebuildInput {
  /** The invoice's current `Line Items` (parsed JSON). */
  stored: StoredLineItem[];
  /** This student's non-cancelled lessons inside the invoice month. */
  monthLessons: MonthLesson[];
  /** Arrears month → bill Completed lessons only. */
  prorated: boolean;
  slotDayLabel: string;
  /** e.g. "Sec 4 E Math — October 2026" */
  regularDescription: string;
  /** The invoice's Month ("November 2026"). Given → lessons owned by another month are left out. */
  invoiceMonthLabel?: string;
}

export interface RebuildResult {
  lineItems: StoredLineItem[];
  regularCount: number;
  additionalCount: number;
}

export function rebuildLineItems(input: RebuildInput): RebuildResult {
  const regulars: StoredLineItem[] = input.monthLessons
    .filter(l => (l.type || 'Regular') !== 'Additional')
    // Moved away — the replacement row is the one that is billed.
    .filter(l => l.status !== 'Rescheduled')
    .filter(l => !input.invoiceMonthLabel || !l.billingMonth || l.billingMonth === input.invoiceMonthLabel)
    .filter(l => !input.prorated || l.status === 'Completed')
    .map(l => ({
      date: l.date,
      day: l.slotLabel || input.slotDayLabel,
      type: l.type || 'Regular',
      description: input.regularDescription,
    }));

  const additionals = input.stored.filter(li => li.type === 'Additional');

  const lineItems = [...regulars, ...additionals].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  return { lineItems, regularCount: regulars.length, additionalCount: additionals.length };
}
