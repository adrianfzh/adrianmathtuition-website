// ─── Invoice email formatting — dates, money, and the nil-invoice case ─────────
//
// Pure and tested, per the repo's money/date rule. Extracted 2026-09-02 because
// the due-date formatter existed three times inline in send-invoices/route.ts —
// and the TWO templates that actually run every month (regular + amended) were
// not among the three: parents were reading "due by 2026-09-15" raw-ISO while
// the dead June-2026 seasonal templates formatted it beautifully.

/** "2026-09-15" → "15 September 2026" (en-SG). Empty in, empty out. */
export function formatDueDate(iso: string): string {
  if (!iso) return iso;
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;   // malformed → show what we have
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Always two decimals — the regular template used to render "$137.5". */
export function formatMoney(n: number): string {
  return n.toFixed(2);
}

/**
 * The "— $X, due by D" clause of the opening sentence. A $0 invoice has no
 * meaningful due date, so it gets "(no payment needed)" instead — "due by
 * 15 September" on a nil invoice reads like a demand for nothing.
 */
export function amountDueHtml(finalAmount: number, dueDate: string): string {
  if (finalAmount <= 0) return `<strong>$${formatMoney(finalAmount)}</strong> (no payment needed)`;
  return `<strong>$${formatMoney(finalAmount)}</strong>, due by <strong>${formatDueDate(dueDate)}</strong>`;
}

/**
 * The payment paragraph. On a $0 invoice the PayNow instructions are replaced —
 * "PayNow $0.00 with reference X" invites a confused transfer of nothing
 * (Jeanette Tan's Sep 2026 invoice was the first nil invoice to ship, and it
 * carried the full PayNow block).
 */
export function paymentHtml(finalAmount: number, paymentRef: string): string {
  if (finalAmount <= 0) {
    return `<p>No payment is needed for this invoice — the attached PDF shows how the total comes to $0.00.</p>`;
  }
  return `<p>To pay, PayNow to <strong>91397985</strong> with reference <strong>${paymentRef}</strong>.</p>`;
}
