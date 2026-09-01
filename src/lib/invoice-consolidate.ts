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

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// "June 2026" -> sortable integer (year*12 + monthIndex). Unknown -> -1.
// THE canonical month parser (re-exported by invoice-payments). Strictly
// anchored — exactly two tokens, a real month name, a 4-digit year — because
// fail-closed callers (priorBalanceFrom) rely on display spans like
// "July–August 2026" mapping to -1, never to a real month.
export function monthSortKey(label: string | undefined | null): number {
  const p = String(label || '').trim().split(/\s+/);
  if (p.length !== 2 || !/^\d{4}$/.test(p[1])) return -1;
  const mi = MONTHS.indexOf(p[0].toLowerCase());
  return mi < 0 ? -1 : parseInt(p[1], 10) * 12 + mi;
}

// Fetch the student's other open invoices for months EARLIER than `currentMonth`
// and return them as previous-balance rows + total. `currentInvoiceId` is excluded.
export async function getPriorBalance(
  studentId: string,
  currentMonth: string,
  currentInvoiceId: string,
): Promise<Consolidated> {
  let records: any[] = [];
  try {
    const data = await airtableRequestAll('Invoices',
      `?fields[]=Student&fields[]=Month&fields[]=Final Amount&fields[]=Amount Paid&fields[]=Is Paid&fields[]=Status&fields[]=Lessons Count&fields[]=Invoice Type`);
    records = data.records || [];
  } catch {
    return { priorItems: [], priorTotal: 0 };
  }
  return priorBalanceFrom(records, studentId, currentMonth, currentInvoiceId);
}

// Pure core of getPriorBalance, separated so the money logic is unit-testable.
//
// FAILS CLOSED on any month it cannot order. `currentMonth` must be a canonical
// "Month YYYY" label; if it isn't (empty, or a display span like "July–August
// 2026"), there is no way to tell earlier from later, so NOTHING is consolidated.
// The old guard instead skipped the earlier-month check when currentMonth was
// unparseable, which appended every other open invoice — future months included —
// as "previous balance" and over-billed. Omitting a prior month only defers it
// to its own invoice; adding a wrong row bills a parent twice. Same rule for a
// candidate whose own Month is unparseable: excluded, never included.
export function priorBalanceFrom(
  records: { id: string; fields: Record<string, any> }[],
  studentId: string,
  currentMonth: string,
  currentInvoiceId: string,
): Consolidated {
  const curKey = monthSortKey(currentMonth);
  if (curKey < 0) return { priorItems: [], priorTotal: 0 };

  const open = records.filter((r) => {
    const f = r.fields;
    if (r.id === currentInvoiceId) return false;
    if ((f['Student'] || [])[0] !== studentId) return false;
    if (f['Status'] === 'Voided') return false;
    if (f['Is Paid'] === true) return false;
    const outstanding = (f['Final Amount'] || 0) - (f['Amount Paid'] || 0);
    if (outstanding <= 0.001) return false;
    // Only strictly EARLIER months (a current invoice shouldn't show a later
    // month's balance); unparseable months fail closed.
    const k = monthSortKey(f['Month'] || '');
    if (k < 0 || k >= curKey) return false;
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

// Rows a STORED invoice must never carry: machine-written carry-over. Covers the
// pre-cutover "Outstanding balance — <month>" lumps the old carry-forward model
// wrote into Line Items Extra, and the previousBalance rows applyPriorBalance
// appends at render time. regenerate-invoice runs stored extras through this
// before re-persisting, so recalculating a pre-cutover invoice converges it to
// the per-month model; admin-entered manual rows pass through untouched.
export function stripPersistedCarryOver(items: any[]): any[] {
  return (items || []).filter((item: any) =>
    item?.previousBalance !== true &&
    !(((item?.description || '') as string).startsWith('Outstanding balance')));
}

// Merge a student's prior open-month balances into an invoiceData object in place:
// appends "previous balance" rows to lineItemsExtra and bumps finalAmount to the
// consolidated total. Safe no-op if the student has no other open months.
export async function applyPriorBalance(
  invoiceData: { month: string; invoiceId: string; finalAmount: number; lineItemsExtra: any[] },
  studentId: string | undefined,
  // The stored Airtable Month ("August 2026"). REQUIRED whenever invoiceData.month
  // can be a display range ("July–August 2026") — a range fails closed and
  // consolidates nothing. Passing it unconditionally is the drift-proof default.
  canonicalMonth?: string,
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
