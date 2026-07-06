import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';
import { generateAndStoreInvoicePdf } from '@/lib/invoice-pdf';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  try {
    const data = await airtableRequestAll(
      'EmailLog',
      '?sort[0][field]=Sent At&sort[0][direction]=desc'
    );
    const records = (data.records || []).map((r: any) => ({
      id: r.id,
      emailId: r.fields['Email ID'] || '',
      sentAt: r.fields['Sent At'] || '',
      type: r.fields['Type'] || '',
      toEmail: r.fields['To Email'] || '',
      subject: r.fields['Subject'] || '',
      bodyHtml: r.fields['Body HTML'] || '',
      pdfUrl: r.fields['PDF URL'] || '',
      relatedInvoice: r.fields['Related Invoice']?.[0] || '',
      status: r.fields['Status'] || '',
      error: r.fields['Error'] || '',
      resendId: r.fields['Resend ID'] || '',
    }));
    return NextResponse.json(records);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST { logId } — re-send email from a log entry
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { RESEND_API_KEY } = process.env;
  if (!RESEND_API_KEY) return NextResponse.json({ error: 'Missing RESEND_API_KEY' }, { status: 500 });

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const { logId } = body;
  if (!logId) return NextResponse.json({ error: 'Missing logId' }, { status: 400 });

  try {
    const rec = await airtableRequest('EmailLog', `/${logId}`);
    const f = rec.fields;
    const toEmail = f['To Email'] as string;
    const subject = f['Subject'] as string;
    const html = f['Body HTML'] as string;
    const relatedInvoice = f['Related Invoice']?.[0] as string | undefined;
    const type = f['Type'] as string;
    const pdfUrl = f['PDF URL'] as string | undefined;

    if (!toEmail || !subject || !html) {
      return NextResponse.json({ error: 'Log entry missing To/Subject/Body' }, { status: 400 });
    }

    // Invoice/receipt emails MUST carry a PDF — never resend them body-only.
    const typeL = (type || '').toLowerCase();
    const isReceipt = typeL.includes('receipt');
    const isInvoice = typeL === 'invoice' || typeL === 'amended_invoice';
    const requiresPdf = isReceipt || isInvoice || !!pdfUrl;
    const fname = (subject.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice') + '.pdf';

    let attachments: { filename: string; content: string }[] | undefined;
    // 1. Prefer the exact PDF originally sent (archived on the log row).
    if (pdfUrl) {
      try {
        const pdfResp = await fetch(pdfUrl);
        if (pdfResp.ok) {
          const buf = Buffer.from(await pdfResp.arrayBuffer());
          attachments = [{ filename: fname, content: buf.toString('base64') }];
        }
      } catch (e: any) {
        console.error('[admin-emails] resend PDF fetch failed:', e?.message);
      }
    }
    // 2. Invoice with no usable archived PDF (e.g. the original send failed to
    //    attach) — fall back to the invoice's current PDF, regenerating if needed.
    //    Receipts can't be reconstructed here (no payment context), so they rely
    //    solely on the archived PDF above.
    if (requiresPdf && !attachments && isInvoice && relatedInvoice) {
      try {
        const inv = await airtableRequest('Invoices', `/${relatedInvoice}`);
        const sid = inv.fields['Student']?.[0];
        let studentName = '';
        if (sid) {
          const stu = await airtableRequest('Students', `/${sid}`).catch(() => null);
          studentName = stu?.fields?.['Student Name'] || '';
        }
        let buf: Buffer | null = null;
        const cur = inv.fields['PDF URL'] as string | undefined;
        if (cur) { const r = await fetch(cur); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); }
        if (!buf) { const g = await generateAndStoreInvoicePdf(inv, studentName); buf = g.buffer; }
        if (buf) attachments = [{ filename: fname, content: buf.toString('base64') }];
      } catch (e: any) {
        console.error('[admin-emails] invoice PDF regeneration failed:', e?.message);
      }
    }
    // 3. HARD RULE: refuse to resend an invoice/receipt with no PDF attached.
    if (requiresPdf && !attachments) {
      return NextResponse.json(
        { error: 'Cannot resend — this email requires a PDF and none could be attached. Regenerate the invoice PDF first, then retry.' },
        { status: 502 },
      );
    }

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: "Adrian's Math Tuition <invoices@adrianmathtuition.com>",
        to: toEmail,
        reply_to: 'adrianmathtuition@gmail.com',
        subject: `[Resent] ${subject}`,
        html,
        ...(attachments ? { attachments } : {}),
      }),
    });
    if (!sendRes.ok) throw new Error('Resend failed: ' + await sendRes.text());
    const sendData = await sendRes.json().catch(() => ({}));
    const resendId = (sendData as any).id || '';

    // Detect immediate suppression (address blocked → never delivered).
    let delivered = true;
    let failEvent = '';
    if (resendId) {
      try {
        const st = await fetch(`https://api.resend.com/emails/${resendId}`, {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        });
        if (st.ok) {
          const ev = (await st.json())?.last_event;
          if (ev === 'suppressed' || ev === 'failed' || ev === 'bounced') { delivered = false; failEvent = ev; }
        }
      } catch { /* status check failed — assume sent; webhook will catch async failures */ }
    }

    // Log the resend as a new entry
    await airtableRequest('EmailLog', '', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          'Email ID': `resend-${logId}-${Date.now()}`,
          'Sent At': new Date().toISOString(),
          'Type': type,
          'To Email': toEmail,
          'Subject': `[Resent] ${subject}`,
          'Body HTML': html,
          ...(relatedInvoice ? { 'Related Invoice': [relatedInvoice] } : {}),
          ...(pdfUrl ? { 'PDF URL': pdfUrl } : {}),
          'Status': delivered ? 'sent' : 'failed',
          ...(resendId ? { 'Resend ID': resendId } : {}),
        },
      }),
    });

    // Notify on Telegram (the admin explicitly wants resend confirmations).
    await sendTelegram(
      delivered
        ? `↩ <b>Email resent</b>\n${subject}\nTo: ${toEmail}${pdfUrl ? '\n📎 PDF attached' : ''}`
        : `⚠️ <b>Resend NOT delivered (${failEvent})</b>\n${subject}\nTo: ${toEmail}\nThe address is blocked by the email provider — verify it / clear the suppression in Resend.`,
    ).catch(() => {});

    return NextResponse.json({ success: true, resendId, delivered, ...(delivered ? {} : { warning: `not delivered (${failEvent})` }) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
