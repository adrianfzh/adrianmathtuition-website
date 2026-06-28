// Per-month invoice model — consolidated rendering.
//
// Each invoice records ONLY its own month's charge. When we render an invoice
// (PDF / preview), we pull the student's OTHER still-open invoices for EARLIER
// months and surface them as "previous balance" rows, newest-first, plus the
// consolidated total. The stored per-month Final Amount stays the source of
// truth; the consolidated total is computed here at render time.
import { airtableRequestAll } from '@/lib/airtable';

export interface PriorBalanceItem {
  description: string;   // e.g. "June 2026"
  amount: number;        // that month's outstanding
  lessons?: number;      // lessons count, for the badge
}

export interface Consolidated {
  priorItems: PriorBalanceItem[];   // newest-first
  priorTotal: number;               // sum of prior outstanding
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "June 2026" -> sortable integer (year*12 + monthIndex). Unknown -> -1.
export function monthSortKey(label: string): number {
  const p = (label || '').trim().split(/\s+/);
  if (p.length !== 2) return -1;
  const mi = MONTHS.indexOf(p[0]);
  const yr = parseInt(p[1], 10);
  return mi < 0 || isNaN(yr) ? -1 : yr * 12 + mi;
}

// Fetch the student's other open invoices for months EARLIER than `currentMonth`
// and return them as previous-balance rows + total. `currentInvoiceId` is excluded.
export async function getPriorBalance(
  studentId: string,
  currentMonth: string,
  currentInvoiceId: string,
): Promise<Consolidated> {
  const curKey = monthSortKey(currentMonth);
  let records: any[] = [];
  try {
    const data = await airtableRequestAll('Invoices',
      `?fields[]=Student&fields[]=Month&fields[]=Final Amount&fields[]=Amount Paid&fields[]=Is Paid&fields[]=Status&fields[]=Lessons Count&fields[]=Invoice Type`);
    records = data.records || [];
  } catch {
    return { priorItems: [], priorTotal: 0 };
  }

  const open = records.filter((r: any) => {
    const f = r.fields;
    if (r.id === currentInvoiceId) return false;
    if ((f['Student'] || [])[0] !== studentId) return false;
    if (f['Status'] === 'Voided') return false;
    if (f['Is Paid'] === true) return false;
    const outstanding = (f['Final Amount'] || 0) - (f['Amount Paid'] || 0);
    if (outstanding <= 0.001) return false;
    // Only EARLIER months (a current invoice shouldn't show a later month's balance).
    const k = monthSortKey(f['Month'] || '');
    if (curKey >= 0 && k >= 0 && k >= curKey) return false;
    return true;
  });

  open.sort((a: any, b: any) => monthSortKey(b.fields['Month'] || '') - monthSortKey(a.fields['Month'] || ''));

  const priorItems: PriorBalanceItem[] = open.map((r: any) => {
    const f = r.fields;
    const outstanding = Math.round(((f['Final Amount'] || 0) - (f['Amount Paid'] || 0)) * 100) / 100;
    const lc = f['Lessons Count'] || 0;
    const type = f['Invoice Type'] || 'Regular';
    const label = type !== 'Regular' ? `${f['Month']} (${type})` : `${f['Month']}`;
    return { description: label, amount: outstanding, lessons: lc > 0 ? lc : undefined };
  });

  const priorTotal = Math.round(priorItems.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  return { priorItems, priorTotal };
}

// Merge a student's prior open-month balances into an invoiceData object in place:
// appends "previous balance" rows to lineItemsExtra and bumps finalAmount to the
// consolidated total. Safe no-op if the student has no other open months.
export async function applyPriorBalance(
  invoiceData: { month: string; invoiceId: string; finalAmount: number; lineItemsExtra: any[] },
  studentId: string | undefined,
  canonicalMonth?: string,   // use when invoiceData.month is a display range, e.g. "April–May 2026"
): Promise<void> {
  if (!studentId) return;
  const { priorItems, priorTotal } = await getPriorBalance(studentId, canonicalMonth || invoiceData.month, invoiceData.invoiceId);
  if (priorItems.length === 0) return;
  invoiceData.lineItemsExtra = [
    ...(invoiceData.lineItemsExtra || []),
    ...priorItems.map(p => ({ description: p.description, amount: p.amount, lessons: p.lessons, previousBalance: true })),
  ];
  invoiceData.finalAmount = Math.round((Number(invoiceData.finalAmount || 0) + priorTotal) * 100) / 100;
}
