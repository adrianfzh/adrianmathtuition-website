// GET /api/cron/overdue-reminders — 15th, 11am SGT (after the 10am bills go out).
//
// Adrian, 4 Nov 2026: students who have graduated or left get no next bill, so nothing reminded
// their parents of an unpaid one — "let's send reminders on 15th as well" → "yes, build it".
// One email per student with no bill that day, listing every overdue bill; every 15th until paid;
// after the 3rd, no more emails and Adrian is told (lib/overdue-reminders.ts). The 14th's 8pm
// "mark payments" Telegram lists who will be reminded, so a paid-but-unmarked bill is caught first.
//
// Auth: CRON_SECRET or ADMIN_PASSWORD bearer (lib/cron-auth; the scheduler header is not proof, 4 Nov 2026). ?dry=1 plans without sending.
import { NextRequest, NextResponse } from 'next/server';
import { logJobRun } from '@/lib/job-log';
import { airtableRequest } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';
import { sgtTodayISO } from '@/lib/sgt';
import { buildReminderEmail } from '@/lib/overdue-reminders';
import { loadReminderPlan, reminderLines, REMINDER_LOG_TYPE } from '@/lib/overdue-reminders-store';
import { cronAuth } from '@/lib/cron-auth';
import { isQuiet } from '@/lib/quiet-messages';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const authed = cronAuth;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const today = sgtTodayISO();

  try {
    const { plan, students } = await loadReminderPlan(today);
    if (dry) return NextResponse.json({ ok: true, dry: true, today, lines: reminderLines(plan, students), plan });

    const { RESEND_API_KEY } = process.env;
    const sent: string[] = [];
    const failed: string[] = [];
    for (const r of plan.remind) {
      const s = students.get(r.studentId);
      if (!s?.parentEmail) { failed.push(`${s?.name || r.studentId}: no parent email`); continue; }
      const { subject, html } = buildReminderEmail({ parentName: s.parentName, studentName: s.name, bills: r.bills, total: r.total });
      let resendId = '';
      let error = '';
      try {
        if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: "Adrian's Math Tuition <invoices@adrianmathtuition.com>",
            to: s.parentEmail,
            reply_to: 'adrianmathtuition@gmail.com',
            subject, html,
          }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
        resendId = ((await res.json().catch(() => ({}))) as any).id || '';
        sent.push(s.name);
      } catch (e) {
        error = (e as Error).message;
        failed.push(`${s.name}: ${error}`);
      }
      // The log is also the reminder count (3 → stop), so a failed send is logged as failed.
      await airtableRequest('EmailLog', '', {
        method: 'POST',
        body: JSON.stringify({
          typecast: true,
          fields: {
            'Email ID': `reminder-${r.studentId}-${Date.now()}`,
            'Sent At': new Date().toISOString(),
            Type: REMINDER_LOG_TYPE,
            'To Email': s.parentEmail,
            Subject: subject,
            'Body HTML': html,
            'Related Invoice': r.bills.map((b) => b.id),
            Status: error ? 'failed' : 'sent',
            ...(error ? { Error: error } : {}),
            ...(resendId ? { 'Resend ID': resendId } : {}),
          },
        }),
      }).catch((e) => console.error('[overdue-reminders] EmailLog failed', e));
      await new Promise((r2) => setTimeout(r2, 600));
    }

    const lines = reminderLines(plan, students);
    // the all-fine version is switched off (6 Nov 2026, lib/quiet-messages); a reminder that failed still tells Adrian
    if (lines.length && (failed.length || !isQuiet('payment-reminders-sent'))) {
      await sendTelegram(
        `📨 <b>Payment reminders — ${today}</b>\n` +
        `For students who got no bill today (unpaid bills show on everyone else's bill).\n\n` +
        lines.join('\n') +
        (failed.length ? `\n\n⚠️ Not sent:\n${failed.map((f) => `• ${f}`).join('\n')}` : ''),
        'money',
      ).catch(() => {});
    }
    await logJobRun('overdue-reminders', failed.length === 0, `sent ${sent.length}, stopped ${plan.stopped.length}${failed.length ? `, failed ${failed.length}` : ''}`).catch(() => {});
    return NextResponse.json({ ok: true, today, sent, failed, stopped: plan.stopped.length });
  } catch (e) {
    await logJobRun('overdue-reminders', false, (e as Error).message).catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
