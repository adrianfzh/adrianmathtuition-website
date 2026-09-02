import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { sendTelegram } from '@/lib/telegram';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getInvoiceMonth } from '@/lib/invoice-month';
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

  // Prorated months bill in arrears — tomorrow's run creates no drafts for them.
  const invoiceMonth = getInvoiceMonth();
  const proratedNote = isProratedMonth(invoiceMonth.month)
    ? `\n\nNote: ${invoiceMonth.label} is prorated — tomorrow's run creates no drafts (they come in arrears on the 1st).`
    : '';

  await sendTelegram(
    `📋 <b>Heads up: Invoice generation runs tomorrow at 7am.</b>\n\n` +
    `Please mark any outstanding payments before then so they're not double-billed.\n\n` +
    `→ Use /invoices in Telegram to check\n` +
    `→ Or review at adrianmathtuition.com/admin/invoices` +
    proratedNote
  );

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
