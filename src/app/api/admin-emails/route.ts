import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';

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

    if (!toEmail || !subject || !html) {
      return NextResponse.json({ error: 'Log entry missing To/Subject/Body' }, { status: 400 });
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
      }),
    });
    if (!sendRes.ok) throw new Error('Resend failed: ' + await sendRes.text());
    const sendData = await sendRes.json().catch(() => ({}));
    const resendId = (sendData as any).id || '';

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
          'Status': 'sent',
          ...(resendId ? { 'Resend ID': resendId } : {}),
        },
      }),
    });

    return NextResponse.json({ success: true, resendId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
