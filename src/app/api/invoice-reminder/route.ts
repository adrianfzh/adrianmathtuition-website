import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { sendTelegram } from '@/lib/telegram';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getInvoiceMonth } from '@/lib/invoice-month';
import { advanceRunNote } from '@/lib/year-end-billing';

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
  // Oct→Jan: the 14th run drafts only the exam-year students (cut short at
  // their last paper); everyone else is billed in arrears on the 1st, and
  // December+January go out together on 1 Jan (lib/year-end-billing.ts,
  // docs/INVOICES.md §Year-end billing). Null outside those months.
  const yearEndNote = advanceRunNote(invoiceMonth.year, invoiceMonth.month);

  await sendTelegram(
    `📋 <b>Invoice reminder — ${monthLabel}</b>\n\n` +
    `Draft invoices will be generated on the 14th (in 2 days) at 7am SGT.\n\n` +
    (yearEndNote ? `⚠️ ${yearEndNote}\n\n` : '') +
    `Check outstanding balances or new students before then — any changes needed should be made in Airtable first.`
  );

  return NextResponse.json({ ok: true, month: monthLabel });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
