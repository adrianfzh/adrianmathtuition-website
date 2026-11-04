// The Airtable half of lib/overdue-reminders.ts — read by /api/cron/overdue-reminders (15th, sends)
// and /api/payment-reminder (14th 8pm, lists tomorrow's reminders for Adrian).
import { airtableRequestAll } from '@/lib/airtable';
import { planReminders, type OpenBill, type ReminderPlan } from '@/lib/overdue-reminders';

/** EmailLog Type for these emails (created on first write with typecast). */
export const REMINDER_LOG_TYPE = 'payment_reminder';

export interface StudentContact { name: string; parentName: string; parentEmail: string }

export async function loadReminderPlan(dayISO: string): Promise<{ plan: ReminderPlan; students: Map<string, StudentContact> }> {
  const [openRes, billedRes, logRes] = await Promise.all([
    airtableRequestAll('Invoices',
      `?filterByFormula=${encodeURIComponent(`AND(OR({Status}='Sent',{Status}='Overdue'),NOT({Is Paid}),{Final Amount}>0)`)}` +
      `&fields[]=Student&fields[]=Month&fields[]=Final Amount&fields[]=Amount Paid&fields[]=Due Date&fields[]=Status`),
    // A bill issued that day already shows the balance ("Previous balance") — no reminder.
    airtableRequestAll('Invoices',
      `?filterByFormula=${encodeURIComponent(`AND(IS_SAME({Issue Date},'${dayISO}','day'),{Status}!='Voided')`)}&fields[]=Student`),
    airtableRequestAll('EmailLog',
      `?filterByFormula=${encodeURIComponent(`AND({Type}='${REMINDER_LOG_TYPE}',{Status}!='failed')`)}&fields[]=Related Invoice`),
  ]);
  const bills: OpenBill[] = (openRes.records || []).map((r: any) => ({
    id: r.id,
    studentId: r.fields['Student']?.[0] || '',
    month: r.fields['Month'] || '',
    finalAmount: Number(r.fields['Final Amount']) || 0,
    amountPaid: Number(r.fields['Amount Paid']) || 0,
    dueISO: r.fields['Due Date'] || null,
    status: r.fields['Status'] || '',
  }));
  const billedToday = new Set<string>((billedRes.records || []).map((r: any) => r.fields['Student']?.[0]).filter(Boolean));
  // Reminders a student has had = reminder emails linked to any of their open bills.
  const studentOfBill = new Map(bills.map((b) => [b.id, b.studentId]));
  const sentCounts = new Map<string, number>();
  for (const r of logRes.records || []) {
    const sids = new Set(((r.fields['Related Invoice'] as string[]) || []).map((id) => studentOfBill.get(id)).filter(Boolean) as string[]);
    for (const sid of sids) sentCounts.set(sid, (sentCounts.get(sid) || 0) + 1);
  }
  const plan = planReminders({ bills, billedToday, sentCounts, todayISO: dayISO });

  const ids = [...plan.remind.map((r) => r.studentId), ...plan.stopped.map((s) => s.studentId)];
  const students = new Map<string, StudentContact>();
  if (ids.length) {
    const st = await airtableRequestAll('Students',
      `?filterByFormula=${encodeURIComponent(`OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`)}&fields[]=Student Name&fields[]=Parent Name&fields[]=Parent Email`);
    for (const r of st.records || []) {
      students.set(r.id, {
        name: r.fields['Student Name'] || r.id,
        parentName: r.fields['Parent Name'] || '',
        parentEmail: String(r.fields['Parent Email'] || '').trim(),
      });
    }
  }
  return { plan, students };
}

/** The lines for Adrian's Telegram — the 14th's preview and the 15th's report share them. */
export function reminderLines(plan: ReminderPlan, students: Map<string, StudentContact>): string[] {
  const name = (id: string) => students.get(id)?.name || id;
  return [
    ...plan.remind.map((r) => `• ${name(r.studentId)} — $${r.total.toFixed(2)} (${r.bills.map((b) => b.month.split(' ')[0]).join(', ')}) · reminder ${r.number} of 3${students.get(r.studentId)?.parentEmail ? '' : ' · ⚠️ no parent email'}`),
    ...plan.stopped.map((s) => `• 🛑 ${name(s.studentId)} — $${s.total.toFixed(2)} · 3 reminders sent, no more emails — follow up yourself`),
  ];
}
