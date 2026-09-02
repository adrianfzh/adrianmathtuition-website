import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getInvoiceMonth, sgtTodayISO } from '@/lib/invoice-month';
import { resolveRunMode, resolveTargetMonthLabel, jobNameFor, buildPaymentReminderMessage } from '@/lib/invoice-run-mode';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  // Cron acceptance: Vercel cron header or CRON_SECRET Bearer. Otherwise
  // standard admin auth (signed session cookie or legacy ADMIN_PASSWORD Bearer).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (req.headers.get('x-vercel-cron') === '1') return true;
  if (cronSecret && safeEqual(authHeader ?? '', `Bearer ${cronSecret}`)) return true;
  return verifyAdminAuth(req);
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
  await sendTelegram(buildPaymentReminderMessage(mode, monthLabel));
  await logJobRun(jobNameFor('payment-reminder', mode), true, 'reminder Telegram sent');
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
