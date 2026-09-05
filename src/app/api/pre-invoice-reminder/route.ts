import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { sendTelegram } from '@/lib/telegram';
// Every notification from this file belongs in the money topic (6 Sept 2026; falls back to the DM when unbound).
const notify_money = (text: string) => sendTelegram(text, 'money');
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

  // Oct→Jan: tomorrow's run drafts only the exam-year students; everyone else
  // is billed in arrears on the 1st (lib/year-end-billing.ts advanceRunNote,
  // null outside those months).
  const invoiceMonth = getInvoiceMonth();
  const yearEnd = advanceRunNote(invoiceMonth.year, invoiceMonth.month);
  const yearEndNote = yearEnd ? `\n\n⚠️ ${yearEnd}` : '';

  await notify_money(
    `📋 <b>Heads up: Invoice generation runs tomorrow at 7am.</b>\n\n` +
    `Please mark any outstanding payments before then so they're not double-billed.\n\n` +
    `→ Use /invoices in Telegram to check\n` +
    `→ Or review at adrianmathtuition.com/admin/invoices` +
    yearEndNote
  );

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
