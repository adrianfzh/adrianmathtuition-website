import { describe, it, expect } from 'vitest';
import { planReminders, buildReminderEmail, isOverdue, MAX_REMINDERS, type OpenBill } from './overdue-reminders';

// 4 Nov 2026 — reminders on the 15th for students with no bill that day (graduated / left).
const bill = (id: string, studentId: string, month: string, owed: number, dueISO: string, extra: Partial<OpenBill> = {}): OpenBill =>
  ({ id, studentId, month, finalAmount: owed, amountPaid: 0, dueISO, status: 'Sent', ...extra });

const TODAY = '2026-11-15';

describe('planReminders', () => {
  const bills = [
    bill('a1', 'tin', 'September 2026', 280, '2026-09-15'),
    bill('a2', 'tin', 'October 2026', 210, '2026-10-15'),
    bill('b1', 'ezekiel', 'October 2026', 350, '2026-10-15'),     // gets a bill today — it shows there
    bill('c1', 'kandre', 'October 2026', 320, '2026-10-15'),
    bill('d1', 'new', 'November 2026', 280, '2026-11-15'),       // due today — not overdue yet
    bill('e1', 'part', 'October 2026', 300, '2026-10-15', { amountPaid: 300 }),
    bill('f1', 'draft', 'October 2026', 300, '2026-10-15', { status: 'Draft' }),
  ];

  it('one email per student, every overdue bill on it, oldest first', () => {
    const plan = planReminders({ bills, billedToday: new Set(['ezekiel']), sentCounts: new Map(), todayISO: TODAY });
    const tin = plan.remind.find((r) => r.studentId === 'tin')!;
    expect(tin.bills.map((b) => b.id)).toEqual(['a1', 'a2']);
    expect(tin.total).toBe(490);
    expect(tin.number).toBe(1);
    expect(plan.remind.map((r) => r.studentId).sort()).toEqual(['kandre', 'tin']);
  });

  it('stops after the third reminder and lists the student for Adrian', () => {
    const plan = planReminders({ bills, billedToday: new Set(), sentCounts: new Map([['tin', MAX_REMINDERS], ['kandre', 2]]), todayISO: TODAY });
    expect(plan.stopped).toEqual([{ studentId: 'tin', total: 490, sent: 3 }]);
    expect(plan.remind.find((r) => r.studentId === 'kandre')!.number).toBe(3);
  });

  it('a part-paid bill counts what is left', () => {
    const b = bill('x', 's', 'October 2026', 300, '2026-10-15', { amountPaid: 100 });
    expect(planReminders({ bills: [b], billedToday: new Set(), sentCounts: new Map(), todayISO: TODAY }).remind[0].total).toBe(200);
    expect(isOverdue({ ...b, amountPaid: 300 }, TODAY)).toBe(false);
  });
});

describe('buildReminderEmail', () => {
  it('lists each month, the total and one PayNow reference', () => {
    const { subject, html } = buildReminderEmail({
      parentName: 'Mrs Tin', studentName: 'Tin Tze Hin', total: 490,
      bills: [bill('a1', 'tin', 'September 2026', 280, '2026-09-15'), bill('a2', 'tin', 'October 2026', 210, '2026-10-15')],
    });
    expect(subject).toBe('Payment Reminder — Tin Tze Hin (September 2026, October 2026)');
    expect(html).toContain('$490.00');
    expect(html).toContain('TIN TZE HIN – SEP/OCT');
    expect(html).toContain('15 September 2026');
  });
});
