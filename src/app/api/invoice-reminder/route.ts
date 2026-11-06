import { NextRequest, NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';
// Every notification from this file belongs in the money topic (6 Sept 2026; falls back to the DM when unbound).
// The Telegram is switched off (6 Nov 2026, lib/quiet-messages 'invoice-reminder-12th'); the brief copy still files.
const notify_money = async (text: string) => {
  const quiet = isQuiet('invoice-reminder-12th');
  const sent = quiet ? true : await sendTelegram(text, 'money');
  await fileForBrief({ family: 'invoice-reminder', sentAlso: !quiet, label: 'Invoice run: check balances', body: text });
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

  const invoiceMonth = getInvoiceMonth();
  const monthLabel = invoiceMonth.label;
  // Oct→Jan: the 14th run drafts only the exam-year students (cut short at
  // their last paper); everyone else is billed in arrears on the 1st, and
  // December+January go out together on 1 Jan (lib/year-end-billing.ts,
  // docs/INVOICES.md §Year-end billing). Null outside those months.
  const yearEndNote = advanceRunNote(invoiceMonth.year, invoiceMonth.month);

  await notify_money(
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
