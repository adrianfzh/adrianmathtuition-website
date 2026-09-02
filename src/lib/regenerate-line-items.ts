/**
 * Line-item rebuild for /api/regenerate-invoice (non-first-invoice path).
 *
 * Regenerate recomputes an invoice from the CURRENT schedule. The rules:
 *
 * 1. Regular lines come from the month's lessons (the caller fetches every
 *    non-cancelled lesson in the month window and filters to the student).
 *    - normal months are billed IN ADVANCE as a projection, so 'Scheduled'
 *      (attendance not yet marked) lessons count;
 *    - prorated months (June, Oct–Dec — lib/arrears-invoices.ts) are billed
 *      IN ARREARS from attendance, so only 'Completed' lessons count. This is
 *      what lets Adrian "mark attendance, then Regenerate" after the arrears
 *      run reported unmarked lessons.
 *
 * 2. Additional lines are KEPT exactly as the generator billed them. The
 *    generator bills Additional lessons from a rolling window (15th of the
 *    previous month → run day; wider for arrears) and ticks the lesson's
 *    `Billed` box — most of those dates fall OUTSIDE the invoice month.
 *    Regenerate used to re-derive additionals from the month window instead,
 *    which (a) silently DROPPED every billed out-of-window Additional line
 *    and (b) ADDED in-window ones without ticking Billed, so the next
 *    generator run billed them again. Found 2026-09-02 while wiring the
 *    arrears trigger; fixed here for every month. To remove a billed
 *    Additional lesson that was later cancelled, amend the invoice.
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
}

export interface RebuildResult {
  lineItems: StoredLineItem[];
  regularCount: number;
  additionalCount: number;
}

export function rebuildLineItems(input: RebuildInput): RebuildResult {
  const regulars: StoredLineItem[] = input.monthLessons
    .filter(l => (l.type || 'Regular') !== 'Additional')
    .filter(l => !input.prorated || l.status === 'Completed')
    .map(l => ({
      date: l.date,
      day: input.slotDayLabel,
      type: l.type || 'Regular',
      description: input.regularDescription,
    }));

  const additionals = input.stored.filter(li => li.type === 'Additional');

  const lineItems = [...regulars, ...additionals].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  return { lineItems, regularCount: regulars.length, additionalCount: additionals.length };
}
