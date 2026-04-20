import { NextRequest, NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const validCron = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const validAdmin = !!(adminPassword && authHeader === `Bearer ${adminPassword}`);
  return isVercelCron || validCron || validAdmin;
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
    `Draft invoices will be generated tomorrow (14th) at 8am SGT.\n\n` +
    `Check outstanding balances or new students before then — any changes needed should be made in Airtable first.`
  );

  return NextResponse.json({ ok: true, month: monthLabel });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
