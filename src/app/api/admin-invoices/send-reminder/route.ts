import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { RESEND_API_KEY } = process.env;
  if (!RESEND_API_KEY) return NextResponse.json({ error: 'Missing RESEND_API_KEY' }, { status: 500 });

  let body: { recordId: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { recordId } = body;
  if (!recordId) return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });

  // Fetch invoice
  const invoice = await airtableRequest('Invoices', `/${recordId}`);
  const f = invoice.fields;
  const finalAmount: number = f['Final Amount'] || 0;
  const amountPaid: number = f['Amount Paid'] || 0;
  const outstanding = Math.max(0, finalAmount - amountPaid);
  const month: string = f['Month'] || '';
  const dueDate: string = f['Due Date'] || '';

  if (outstanding <= 0) return NextResponse.json({ error: 'Invoice already fully paid' }, { status: 400 });

  // Fetch student + parent details
  const studentId = f['Student']?.[0];
  if (!studentId) return NextResponse.json({ error: 'No student linked' }, { status: 400 });
  const student = await airtableRequest('Students', `/${studentId}`);
  const studentName: string = student.fields['Student Name'] || '';
  const parentName: string = student.fields['Parent Name'] || '';
  const parentEmail: string = student.fields['Parent Email'] || '';
  if (!parentEmail) return NextResponse.json({ error: 'No parent email on file' }, { status: 400 });

  const dueDateFormatted = dueDate
    ? new Date(dueDate + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '';

  const isPartial = amountPaid > 0;
  const subject = `Payment Reminder — ${studentName} (${month})`;

  const html = `<p>Dear ${parentName || 'Parent/Guardian'},</p>

<p>This is a friendly reminder that ${isPartial ? 'a partial balance remains' : 'payment is outstanding'} for ${studentName}'s tuition fees for <strong>${month}</strong>.</p>

<table style="border-collapse:collapse;margin:12px 0;">
  ${isPartial ? `<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Amount paid</td><td style="padding:4px 0;font-weight:600;">$${amountPaid.toFixed(2)}</td></tr>` : ''}
  <tr><td style="padding:4px 16px 4px 0;color:#64748b;">Outstanding</td><td style="padding:4px 0;font-weight:700;color:#dc2626;">$${outstanding.toFixed(2)}</td></tr>
  ${dueDateFormatted ? `<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Due date</td><td style="padding:4px 0;">${dueDateFormatted}</td></tr>` : ''}
</table>

<p>Please transfer <strong>$${outstanding.toFixed(2)}</strong> via PayNow to <strong>91397985</strong>.<br>
Use reference: <strong>${studentName.toUpperCase()} – ${month.toUpperCase()}</strong></p>

<p>If you have already made payment, please disregard this message.</p>

<p>Thank you,<br>Adrian</p>`;

  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: "Adrian's Math Tuition <invoices@adrianmathtuition.com>",
      to: parentEmail,
      reply_to: 'adrianmathtuition@gmail.com',
      subject,
      html,
    }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    return NextResponse.json({ error: `Resend failed: ${err}` }, { status: 502 });
  }

  return NextResponse.json({ success: true, parentEmail, studentName, outstanding });
}
