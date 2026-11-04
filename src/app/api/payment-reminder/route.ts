import { loadReminderPlan, reminderLines } from '@/lib/overdue-reminders-store';
import { addDaysISO } from '@/lib/sgt';
import { NextRequest, NextResponse } from 'next/server';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
// Every notification from this file belongs in the money topic (6 Sept 2026; falls back to the DM when unbound).
const notify_money = async (text: string) => {
  const sent = await sendTelegram(text, 'money');
  await fileForBrief({ family: 'payment-reminder', label: 'Invoice run: mark payments', body: text });
  return sent;
};
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getInvoiceMonth, sgtTodayISO } from '@/lib/invoice-month';
import { resolveRunMode, resolveTargetMonthLabel, jobNameFor, buildPaymentReminderMessage } from '@/lib/invoice-run-mode';
import { fileForBrief } from '@/lib/staff-inbox';
import { cronAuth } from '@/lib/cron-auth';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  return cronAuth(req) || verifyAdminAuth(req);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Two rhythms: the advance cycle (14th 8pm, invoices generate next morning)
  // and the year-end ARREARS cycle (1st of Nov/Dec/Jan 8pm — drafts were made
  // that morning and auto-send on the 2nd). Cron fires `?mode=arrears`.
  let body: unknown = null;
  try { body = await req.json(); } catch { /* no body */ }
  const mode = resolveRunMode(req.nextUrl.searchParams, body);
  const monthLabel = resolveTargetMonthLabel({
    mode,
    todayISO: sgtTodayISO(),
    advanceLabel: getInvoiceMonth().label,
  });
  // Tomorrow's payment reminders to students with no bill (graduated / left) — listed tonight so
  // a bill paid but not marked is marked first (4 Nov 2026, lib/overdue-reminders.ts).
  let reminderNote = '';
  if (mode === 'advance') {
    try {
      const { plan, students } = await loadReminderPlan(addDaysISO(sgtTodayISO(), 1));
      const lines = reminderLines(plan, students);
      if (lines.length) reminderNote = `\n\n📨 <b>Payment reminders tomorrow at 11am</b> (no bill for them tomorrow):\n${lines.join('\n')}\nMark any already paid tonight and they won't get one.`;
    } catch (e) { reminderNote = `\n\n⚠️ Could not list tomorrow's payment reminders: ${(e as Error).message}`; }
  }
  await notify_money(buildPaymentReminderMessage(mode, monthLabel) + reminderNote);
  await logJobRun(jobNameFor('payment-reminder', mode), true, 'reminder Telegram sent');
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
