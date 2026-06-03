import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  return req.headers.get('authorization') === `Bearer ${adminPassword}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Re-attach the exact PDF that was originally sent (archived on the log), so
    // a resent invoice goes out WITH its invoice — not body-only.
    let attachments: { filename: string; content: string }[] | undefined;
    if (pdfUrl) {
      try {
        const pdfResp = await fetch(pdfUrl);
        if (pdfResp.ok) {
          const buf = Buffer.from(await pdfResp.arrayBuffer());
          const fname = (subject.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice') + '.pdf';
          attachments = [{ filename: fname, content: buf.toString('base64') }];
        }
      } catch (e: any) {
        console.error('[admin-emails] resend PDF fetch failed:', e?.message);
      }
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
