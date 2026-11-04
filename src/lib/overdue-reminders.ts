// Payment reminders on the 15th for students who get NO bill that day — mostly students who have
// graduated or left. Pure; tested in overdue-reminders.test.ts. The Airtable half is
// lib/overdue-reminders-store.ts; the job is /api/cron/overdue-reminders.
//
// Adrian, 4 Nov 2026: "so any outstanding is currently also in the next invoice sent on the next
// 15th — how about students who have graduated/discontinued and still have outstanding > let's
// send reminders on 15th as well?" → "yes, build it" to:
//   • a student still having lessons sees an unpaid bill on their next bill ("Previous balance"),
//     so only students with no bill on the 15th get this email;
//   • ONE email per student, listing every overdue bill;
//   • every 15th until paid; after the 3rd, no more emails — Adrian is told, and follows up himself;
//   • the evening before (14th, 8pm) his "mark payments" Telegram lists who will be reminded, so a
//     bill paid but not yet marked never gets a parent a reminder.

export const MAX_REMINDERS = 3;

export interface OpenBill {
  id: string;
  studentId: string;
  month: string;
  finalAmount: number;
  amountPaid: number;
  dueISO: string | null;
  status: string;
}

export interface ReminderPlan {
  remind: { studentId: string; bills: OpenBill[]; total: number; number: number }[];
  /** Already had MAX_REMINDERS — no email; listed for Adrian. */
  stopped: { studentId: string; total: number; sent: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const owedOn = (b: OpenBill) => round2(Math.max(0, (Number(b.finalAmount) || 0) - (Number(b.amountPaid) || 0)));

/** A bill the parent should have paid by now: sent, past its due date, money still owed. */
export function isOverdue(b: OpenBill, todayISO: string): boolean {
  return (b.status === 'Sent' || b.status === 'Overdue')
    && !!b.dueISO && b.dueISO < todayISO
    && owedOn(b) > 0;
}

/**
 * Who gets a reminder on `todayISO`. `billedToday` = students with a bill issued that day (their
 * bill already shows the balance); `sentCounts` = reminders each student has had already.
 */
export function planReminders(opts: {
  bills: OpenBill[];
  billedToday: ReadonlySet<string>;
  sentCounts: ReadonlyMap<string, number>;
  todayISO: string;
  max?: number;
}): ReminderPlan {
  const max = opts.max ?? MAX_REMINDERS;
  const byStudent = new Map<string, OpenBill[]>();
  for (const b of opts.bills) {
    if (!b.studentId || opts.billedToday.has(b.studentId) || !isOverdue(b, opts.todayISO)) continue;
    byStudent.set(b.studentId, [...(byStudent.get(b.studentId) || []), b]);
  }
  const plan: ReminderPlan = { remind: [], stopped: [] };
  for (const [studentId, bills] of byStudent) {
    bills.sort((a, b) => String(a.dueISO).localeCompare(String(b.dueISO)));
    const total = round2(bills.reduce((t, b) => t + owedOn(b), 0));
    const sent = opts.sentCounts.get(studentId) || 0;
    if (sent >= max) plan.stopped.push({ studentId, total, sent });
    else plan.remind.push({ studentId, bills, total, number: sent + 1 });
  }
  return plan;
}

function longDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The parent's email: every overdue bill, one total, how to pay. Signed by Adrian, like the bills. */
export function buildReminderEmail(d: {
  parentName: string; studentName: string; bills: OpenBill[]; total: number;
}): { subject: string; html: string } {
  const months = d.bills.map((b) => b.month);
  const subject = `Payment Reminder — ${d.studentName} (${months.join(', ')})`;
  const rows = d.bills.map((b) =>
    `<tr><td style="padding:4px 16px 4px 0;">${esc(b.month)}</td>` +
    `<td style="padding:4px 16px 4px 0;color:#64748b;">${b.dueISO ? `due ${longDate(b.dueISO)}` : ''}</td>` +
    `<td style="padding:4px 0;font-weight:600;text-align:right;">$${owedOn(b).toFixed(2)}</td></tr>`).join('');
  const ref = `${d.studentName.toUpperCase()} – ${months.map((m) => m.split(' ')[0].slice(0, 3).toUpperCase()).join('/')}`;
  const html = `<p>Dear ${esc(d.parentName || 'Parent/Guardian')},</p>

<p>This is a friendly reminder that payment is still outstanding for ${esc(d.studentName)}'s tuition fees:</p>

<table style="border-collapse:collapse;margin:12px 0;">
  ${rows}
  <tr><td style="padding:8px 16px 4px 0;font-weight:700;">Total</td><td></td><td style="padding:8px 0 4px;font-weight:700;color:#dc2626;text-align:right;">$${d.total.toFixed(2)}</td></tr>
</table>

<p>Please transfer <strong>$${d.total.toFixed(2)}</strong> via PayNow to <strong>91397985</strong>.<br>
Use reference: <strong>${esc(ref)}</strong></p>

<p>If you have already made payment, please disregard this message.</p>

<p>Thank you,<br>Adrian</p>`;
  return { subject, html };
}
