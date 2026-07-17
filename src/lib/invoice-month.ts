const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Returns the invoice month — always the month AFTER today.
 * e.g. today = 15 April 2026 → "May 2026"
 */
export function getInvoiceMonth(today = new Date()): {
  label: string;
  year: number;
  month: number; // 1-12
  firstDay: Date;
  lastDay: Date;
} {
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return {
    label:    `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
    year:     d.getFullYear(),
    month:    d.getMonth() + 1,
    firstDay: new Date(d.getFullYear(), d.getMonth(), 1),
    lastDay:  new Date(d.getFullYear(), d.getMonth() + 1, 0),
  };
}

/** Today's date in SGT (UTC+8) as YYYY-MM-DD, independent of server timezone. */
export function sgtTodayISO(now = Date.now()): string {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * The Issue Date to stamp when (re)generating an invoice PDF — ONE rule for
 * every PDF path (generate-pdf-batch, regenerate-invoice). An invoice's issue
 * date is the date it was issued to the parent:
 *   - Status 'Sent' → today: regenerating a sent invoice reissues it (an amend
 *     changed the document), so it must carry today's date, not the original
 *     send date. This is the whole point — a split where one path stamped today
 *     and another preserved the old date is how amended invoices kept a stale
 *     issue date.
 *   - No issue date yet (fresh Draft PDF) → the 15th of today's month, the
 *     scheduled batch-send date.
 *   - Otherwise (unsent Draft that already has a date) → preserve it.
 */
export function resolveInvoiceIssueDate(
  status: string,
  currentIssueDate: string | undefined | null,
  todayISO: string,
): string {
  if (status === 'Sent') return todayISO;
  if (currentIssueDate) return currentIssueDate;
  return `${todayISO.slice(0, 7)}-15`;
}

/**
 * Display month for an invoice whose line items start before its stored Month.
 * A combined first invoice (e.g. July lessons filed under "August 2026" so the
 * monthly generator doesn't double-bill) should read "July–August 2026" on the
 * PDF header, email subject, and attachment filename — while the Month FIELD
 * stays a standard label for filing/filtering. Mirrors preview-invoice's logic.
 */
export function displaySpanMonth(storedMonth: string, lineItemsRaw: string | undefined): string {
  try {
    const items = JSON.parse(lineItemsRaw || '[]') as { date?: string }[];
    const first = items[0]?.date;
    if (!first || !storedMonth) return storedMonth;
    const firstDate = new Date(first + 'T00:00:00');
    const ref = new Date(`1 ${storedMonth}`);
    if (isNaN(firstDate.getTime()) || isNaN(ref.getTime())) return storedMonth;
    if (
      firstDate.getFullYear() < ref.getFullYear() ||
      (firstDate.getFullYear() === ref.getFullYear() && firstDate.getMonth() < ref.getMonth())
    ) {
      return `${MONTH_NAMES[firstDate.getMonth()]}–${storedMonth}`;
    }
    return storedMonth;
  } catch {
    return storedMonth;
  }
}
