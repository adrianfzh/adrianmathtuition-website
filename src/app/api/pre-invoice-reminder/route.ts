import { NextRequest, NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';
// Every notification from this file belongs in the money topic (6 Sept 2026; falls back to the DM when unbound).
// The Telegram is switched off (6 Nov 2026, lib/quiet-messages 'pre-invoice-13th'); the brief copy still files.
const notify_money = async (text: string) => {
  const quiet = isQuiet('pre-invoice-13th');
  const sent = quiet ? true : await sendTelegram(text, 'money');
  await fileForBrief({ family: 'pre-invoice-reminder', sentAlso: !quiet, label: 'Invoice run: drafts tomorrow', body: text });
  return sent;
};
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getInvoiceMonth } from '@/lib/invoice-month';
import { advanceRunNote } from '@/lib/year-end-billing';
import { fileForBrief } from '@/lib/staff-inbox';
import { cronAuth } from '@/lib/cron-auth';
import { isQuiet } from '@/lib/quiet-messages';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  return cronAuth(req) || verifyAdminAuth(req);
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
