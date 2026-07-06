import { NextRequest, NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  // Cron acceptance: Vercel cron header or CRON_SECRET Bearer. Otherwise
  // standard admin auth (signed session cookie or legacy ADMIN_PASSWORD Bearer).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (req.headers.get('x-vercel-cron') === '1') return true;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return verifyAdminAuth(req);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const invoiceMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthLabel = `${MONTH_NAMES[invoiceMonthDate.getMonth()]} ${invoiceMonthDate.getFullYear()}`;

  await sendTelegram(
    `📋 <b>Invoice reminder — ${monthLabel}</b>\n\n` +
    `Draft invoices will be generated on the 14th (in 2 days) at 7am SGT.\n\n` +
    `Check outstanding balances or new students before then — any changes needed should be made in Airtable first.`
  );

  return NextResponse.json({ ok: true, month: monthLabel });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
