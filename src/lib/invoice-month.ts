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
