import { describe, it, expect, vi, beforeEach } from 'vitest';
import { monthSortKey, priorBalanceFrom, applyPriorBalance, stripPersistedCarryOver } from './invoice-consolidate';
import { airtableRequestAll } from '@/lib/airtable';

vi.mock('@/lib/airtable', () => ({
  airtableRequestAll: vi.fn(),
}));

// An open invoice for the student under test; override per case.
const inv = (id: string, over: Record<string, any> = {}) => ({
  id,
  fields: {
    Student: ['recStu'],
    Month: 'June 2026',
    'Final Amount': 300,
    'Amount Paid': 0,
    'Is Paid': false,
    Status: 'Sent',
    'Lessons Count': 4,
    ...over,
  },
});

describe('monthSortKey', () => {
  it('orders canonical labels across year boundaries', () => {
    const jun = monthSortKey('June 2026');
    const jul = monthSortKey('July 2026');
    const jan27 = monthSortKey('January 2027');
    expect(jun).toBeLessThan(jul);
    expect(jul).toBeLessThan(jan27);
  });

  it('returns -1 for a combined-invoice display span, empty, and garbage', () => {
    // "July–August 2026" is what displaySpanMonth puts on a combined first
    // invoice's PDF header — it is a display label, never a sortable month.
    expect(monthSortKey('July–August 2026')).toBe(-1);
    expect(monthSortKey('')).toBe(-1);
    expect(monthSortKey('Deposit')).toBe(-1);
    expect(monthSortKey('June')).toBe(-1);
    expect(monthSortKey('Junk 2026')).toBe(-1);
    expect(monthSortKey('June nineteen')).toBe(-1);
  });

  it('is case-insensitive and whitespace-tolerant but stays anchored', () => {
    expect(monthSortKey('  june 2026 ')).toBe(monthSortKey('June 2026'));
    expect(monthSortKey('JUNE  2026')).toBe(monthSortKey('June 2026'));
    expect(monthSortKey('June 202')).toBe(-1);    // year must be 4 digits
    expect(monthSortKey('June 20261')).toBe(-1);
  });
});

describe('priorBalanceFrom', () => {
  it('includes only strictly earlier open months, newest first, with the consolidated total', () => {
    const records = [
      inv('recJul', { Month: 'July 2026', 'Final Amount': 280 }),
      inv('recAug', { Month: 'August 2026', 'Final Amount': 300 }),
      inv('recOct', { Month: 'October 2026', 'Final Amount': 320 }),           // future → out
      inv('recSame', { Month: 'September 2026', 'Invoice Type': 'Revision' }), // same month → out
      inv('recCur', { Month: 'September 2026' }),                              // the invoice itself
    ];
    const { priorItems, priorTotal } = priorBalanceFrom(records, 'recStu', 'September 2026', 'recCur');
    expect(priorItems.map(i => i.description)).toEqual(['August 2026', 'July 2026']);
    expect(priorTotal).toBe(580);
  });

  // REGRESSION — invoice send path, caught 2026-09-02. invoice-pdf.ts (used by
  // the send-invoices cron that emails parents) set invoiceData.month to the
  // displaySpanMonth label and called applyPriorBalance without the canonical
  // month. monthSortKey("July–August 2026") is -1, and the old guard
  // (`if (curKey >= 0 && k >= 0 && k >= curKey) return false`) was disabled at
  // curKey -1 — so EVERY other open invoice, future months included, was
  // appended as "previous balance" and added to the emailed total, while the
  // preview (which passes storedMonth) showed the correct figure. The core now
  // fails CLOSED: an unorderable current month consolidates nothing.
  it('REGRESSION 2026-09-02: display-span current month consolidates NOTHING — never future months', () => {
    const records = [
      inv('recJul', { Month: 'July 2026', 'Final Amount': 280 }),
      inv('recOct', { Month: 'October 2026', 'Final Amount': 320 }),
    ];
    const out = priorBalanceFrom(records, 'recStu', 'July–August 2026', 'recCur');
    expect(out.priorItems).toEqual([]);
    expect(out.priorTotal).toBe(0);
  });

  it('fails closed on an empty current month too', () => {
    const records = [inv('recJul', { Month: 'July 2026' })];
    expect(priorBalanceFrom(records, 'recStu', '', 'recCur')).toEqual({ priorItems: [], priorTotal: 0 });
  });

  it('excludes a candidate whose own Month is unorderable', () => {
    const records = [
      inv('recWeird', { Month: 'Deposit', 'Final Amount': 500 }),
      inv('recJul', { Month: 'July 2026', 'Final Amount': 280 }),
    ];
    const { priorItems, priorTotal } = priorBalanceFrom(records, 'recStu', 'September 2026', 'recCur');
    expect(priorItems.map(i => i.description)).toEqual(['July 2026']);
    expect(priorTotal).toBe(280);
  });

  it('excludes paid, voided, other-student, and fully-offset invoices; keeps partial outstanding', () => {
    const records = [
      inv('recPaid', { Month: 'June 2026', 'Is Paid': true }),
      inv('recVoided', { Month: 'May 2026', Status: 'Voided' }),
      inv('recOther', { Month: 'July 2026', Student: ['recSomeoneElse'] }),
      inv('recZero', { Month: 'July 2026', 'Final Amount': 300, 'Amount Paid': 300 }),
      inv('recPartial', { Month: 'August 2026', 'Final Amount': 300, 'Amount Paid': 250 }),
    ];
    const { priorItems, priorTotal } = priorBalanceFrom(records, 'recStu', 'September 2026', 'recCur');
    expect(priorItems).toEqual([{ description: 'August 2026', amount: 50, lessons: 4 }]);
    expect(priorTotal).toBe(50);
  });

  it('labels non-Regular invoice types', () => {
    const records = [inv('recRev', { Month: 'June 2026', 'Invoice Type': 'Revision', 'Lessons Count': 0 })];
    const { priorItems } = priorBalanceFrom(records, 'recStu', 'September 2026', 'recCur');
    expect(priorItems[0].description).toBe('June 2026 (Revision)');
    expect(priorItems[0].lessons).toBeUndefined();
  });
});

describe('stripPersistedCarryOver', () => {
  // REGRESSION 2026-09-02: regenerate-invoice was missed by the 2026-06-28
  // per-month cutover — it still recalculated the previous month's outstanding
  // into an "Outstanding balance" lump AND baked it into the stored Final
  // Amount, so every consolidated render path (preview / pdf-batch / send)
  // then ALSO appended that month as a previous-balance row: double-counted.
  // A stored invoice must carry only its own month; carry-over is render-only.
  it('drops Outstanding-balance lumps and previousBalance rows, keeps manual rows in order', () => {
    const rows = [
      { description: 'Outstanding balance — July 2026', amount: 280 },
      { description: 'August 2026', amount: 300, previousBalance: true },
      { description: 'Referral credit', amount: -10 },
      { description: 'Exam workshop', amount: 50 },
    ];
    expect(stripPersistedCarryOver(rows)).toEqual([
      { description: 'Referral credit', amount: -10 },
      { description: 'Exam workshop', amount: 50 },
    ]);
  });

  it('tolerates rows without a description and null-ish input', () => {
    expect(stripPersistedCarryOver([{ amount: 25 }])).toEqual([{ amount: 25 }]);
    expect(stripPersistedCarryOver(undefined as any)).toEqual([]);
  });
});

describe('applyPriorBalance', () => {
  beforeEach(() => {
    vi.mocked(airtableRequestAll).mockReset();
  });

  const data = () => ({
    month: 'August–September 2026',   // display span, as invoice-pdf.ts builds it
    invoiceId: 'recCur',
    finalAmount: 400,
    lineItemsExtra: [] as any[],
  });

  // The production scenario end to end (minus the network): a combined first
  // invoice whose display month is a span. With the stored canonical Month
  // passed — as every caller now does — earlier open months consolidate and
  // later ones never do.
  it('with canonicalMonth: appends earlier open months only, bumps finalAmount by exactly their total', async () => {
    vi.mocked(airtableRequestAll).mockResolvedValue({
      records: [
        inv('recAug', { Month: 'August 2026', 'Final Amount': 280 }),
        inv('recOct', { Month: 'October 2026', 'Final Amount': 320 }),
      ],
    });
    const d = data();
    await applyPriorBalance(d, 'recStu', 'September 2026');
    expect(d.lineItemsExtra).toEqual([
      { description: 'August 2026', amount: 280, lessons: 4, previousBalance: true },
    ]);
    expect(d.finalAmount).toBe(680);
  });

  it('without canonicalMonth a display-span month is a no-op — over-billing cannot recur', async () => {
    vi.mocked(airtableRequestAll).mockResolvedValue({
      records: [
        inv('recAug', { Month: 'August 2026', 'Final Amount': 280 }),
        inv('recOct', { Month: 'October 2026', 'Final Amount': 320 }),
      ],
    });
    const d = data();
    await applyPriorBalance(d, 'recStu');
    expect(d.lineItemsExtra).toEqual([]);
    expect(d.finalAmount).toBe(400);
  });

  it('is a no-op without a studentId and never fetches', async () => {
    const d = data();
    await applyPriorBalance(d, undefined);
    expect(d.finalAmount).toBe(400);
    expect(vi.mocked(airtableRequestAll)).not.toHaveBeenCalled();
  });

  it('leaves the invoice untouched when the Airtable fetch fails', async () => {
    vi.mocked(airtableRequestAll).mockRejectedValue(new Error('airtable down'));
    const d = data();
    await applyPriorBalance(d, 'recStu', 'September 2026');
    expect(d.lineItemsExtra).toEqual([]);
    expect(d.finalAmount).toBe(400);
  });
});
