import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { sendTelegram } from '@/lib/telegram';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getInvoiceMonth, MONTH_NAMES } from '@/lib/invoice-month';
import { isProratedMonth } from '@/lib/arrears-invoices';

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

  const invoiceMonth = getInvoiceMonth();
  const monthLabel = invoiceMonth.label;
  // Prorated months (June + Oct–Dec) bill in arrears: the 14th run creates no
  // drafts for them — the arrears crons on the 1st/2nd do (docs/INVOICES.md).
  const prorated = isProratedMonth(invoiceMonth.month);
  const nextMonthName = MONTH_NAMES[invoiceMonth.month % 12];

  await sendTelegram(
    `📋 <b>Invoice reminder — ${monthLabel}</b>\n\n` +
    (prorated
      ? `⚠️ ${monthLabel} is a prorated month — the 14th run will NOT create drafts. ` +
        `They're generated in arrears on 1 ${nextMonthName} 9am (after the month is taught) and auto-sent on 2 ${nextMonthName} 10am.\n\n`
      : `Draft invoices will be generated on the 14th (in 2 days) at 7am SGT.\n\n`) +
    `Check outstanding balances or new students before then — any changes needed should be made in Airtable first.`
  );

  return NextResponse.json({ ok: true, month: monthLabel });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
