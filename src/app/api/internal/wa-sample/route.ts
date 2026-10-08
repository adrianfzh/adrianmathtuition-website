// GET /api/internal/wa-sample — the values for ONE sample "invoice ready" WhatsApp
// message, for the bot's `/wa sample invoice_ready` (Adrian, 8 Oct 2026: a safe way
// to see a real invoice open, with no e-mail to anyone).
//
// It reads the most recently sent invoice that has a PDF and builds the same six
// values the real send builds (lib/wa-notify.ts), private link included. It sends
// nothing and changes nothing; the bot then sends the sample to Adrian's OWN
// number only. Bot-only: Bearer BOT_INTERNAL_SECRET.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { displaySpanMonth } from '@/lib/invoice-month';
import { invoiceReadyValues } from '@/lib/wa-notify';
import { safeEqual } from '@/lib/safe-equal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!secret || !safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const formula = `AND(NOT({PDF URL}=''),{Final Amount}>0,{Status}='Sent')`;
    const data = await airtableRequest('Invoices',
      `?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Sent At&sort[0][direction]=desc&maxRecords=1`);
    const rec = data?.records?.[0];
    if (!rec) return NextResponse.json({ error: 'no sent invoice with a PDF' }, { status: 404 });
    const sid = rec.fields['Student']?.[0];
    const stu = sid ? await airtableRequest('Students', `/${sid}`) : { fields: {} };
    const studentName = String(stu.fields?.['Student Name'] || '');
    const month = displaySpanMonth(String(rec.fields['Month'] || ''), rec.fields['Line Items'] as string | undefined);
    const values = invoiceReadyValues({
      id: rec.id, studentName, month,
      finalAmount: Number(rec.fields['Final Amount'] || 0),
      dueDate: rec.fields['Due Date'],
      paymentRef: `${studentName.toUpperCase()} – ${month.toUpperCase()}`,
    }, process.env.SIGNUP_SECRET || '');
    if (!values) return NextResponse.json({ error: 'that invoice cannot be announced' }, { status: 404 });
    return NextResponse.json({ values, ref: rec.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
