import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';
export const maxDuration = 30;

function checkAuth(req: NextRequest): boolean {
  const token = process.env.RECEIPT_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const auth = req.headers.get('authorization');
  if (token && auth === `Bearer ${token}`) return true;
  if (adminPassword && auth === `Bearer ${adminPassword}`) return true;
  return false;
}

function buildReceiptHtml(opts: {
  studentName: string;
  parentName?: string;
  month: string;
  paymentAmount: number;
  paymentDate: string;
  paymentMethod: string;
  isFullPayment: boolean;
  isOverpayment: boolean;
  remainingBalance: number;
  finalAmount: number;
}) {
  const greeting = opts.parentName ? `Dear ${opts.parentName},` : 'Dear Parent/Student,';
  const dateFormatted = new Date(opts.paymentDate + 'T00:00:00').toLocaleDateString('en-SG', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  let statusLine: string;
  if (opts.isOverpayment) {
    const credit = (opts.paymentAmount - opts.finalAmount).toFixed(2);
    statusLine = `<p>Your ${opts.month} invoice is now <strong>fully paid</strong>. The excess amount of <strong>$${credit}</strong> will be applied as a credit on your next invoice.</p>`;
  } else if (opts.isFullPayment) {
    statusLine = `<p>Your ${opts.month} invoice is now <strong>fully paid</strong>. Thank you!</p>`;
  } else {
    statusLine = `<p>An outstanding balance of <strong>$${opts.remainingBalance.toFixed(2)}</strong> remains for your ${opts.month} invoice. Please settle this when convenient.</p>`;
  }

  return `
    <p>${greeting}</p>
    <p>This is to confirm receipt of your ${opts.paymentMethod} payment of <strong>$${opts.paymentAmount.toFixed(2)}</strong> for ${opts.studentName}'s tuition fees, received on ${dateFormatted}.</p>
    ${statusLine}
    <p>Thank you for your prompt payment.</p>
    <p>Best regards,<br>Adrian</p>
  `;
}

function buildCorrectionHtml(opts: { studentName: string; month: string }) {
  return `
    <p>Dear Parent/Student,</p>
    <p>Please disregard our earlier payment confirmation email regarding ${opts.studentName}'s ${opts.month} invoice.</p>
    <p>The payment has been reverted in our system. We apologise for any confusion. We will follow up if there are any concerns.</p>
    <p>Best regards,<br>Adrian</p>
  `;
}

// GET — return the default subject + HTML preview for the receipt page
// Query params mirror the POST body (invoiceId required, rest optional)
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const invoiceId       = sp.get('invoiceId');
  if (!invoiceId) return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });

  const paymentAmount   = parseFloat(sp.get('paymentAmount') || '0');
  const paymentDate     = sp.get('paymentDate') || new Date().toISOString().split('T')[0];
  const isFullPayment   = sp.get('isFullPayment') === 'true';
  const isOverpayment   = sp.get('isOverpayment') === 'true';
  const remainingBalance = parseFloat(sp.get('remainingBalance') || '0');
  const paymentMethod   = sp.get('paymentMethod') || 'PayNow';

  try {
    const invoice = await airtableRequest('Invoices', `/${invoiceId}`);
    const studentId = invoice.fields['Student']?.[0];
    if (!studentId) return NextResponse.json({ error: 'No student linked' }, { status: 400 });
    const student = await airtableRequest('Students', `/${studentId}`);

    const studentName = (student.fields['Student Name'] || '') as string;
    const parentName  = (student.fields['Parent Name']  || '') as string;
    const parentEmail = (student.fields['Parent Email'] || '') as string;
    const month       = (invoice.fields['Month']        || '') as string;
    const finalAmount = (invoice.fields['Final Amount'] as number) || 0;

    let subject: string;
    if (isOverpayment) {
      subject = `Payment Received (with Credit) \u2014 ${studentName} (${month})`;
    } else if (isFullPayment) {
      subject = `Payment Received \u2014 ${studentName} (${month})`;
    } else {
      subject = `Partial Payment Received \u2014 ${studentName} (${month})`;
    }
    const html = buildReceiptHtml({
      studentName, parentName, month,
      paymentAmount, paymentDate, paymentMethod,
      isFullPayment, isOverpayment, remainingBalance, finalAmount,
    });
    return NextResponse.json({ subject, html, studentName, parentEmail, month });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { RESEND_API_KEY } = process.env;
  if (!RESEND_API_KEY) return NextResponse.json({ error: 'Missing RESEND_API_KEY' }, { status: 500 });

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { invoiceId, paymentAmount, paymentDate, isFullPayment, isOverpayment, remainingBalance, paymentMethod, correction, customHtml } = body;
  if (!invoiceId) return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });

  // Fetch invoice + student
  const invoice = await airtableRequest('Invoices', `/${invoiceId}`);
  const studentId = invoice.fields['Student']?.[0];
  if (!studentId) return NextResponse.json({ error: 'No student linked' }, { status: 400 });

  const student = await airtableRequest('Students', `/${studentId}`);
  const parentEmail = student.fields['Parent Email'] as string;
  const parentName = (student.fields['Parent Name'] || '') as string;
  const studentName = (student.fields['Student Name'] || '') as string;
  const month = (invoice.fields['Month'] || '') as string;
  const finalAmount = (invoice.fields['Final Amount'] as number) || 0;

  if (!parentEmail) return NextResponse.json({ error: 'No parent email' }, { status: 400 });

  // Build email
  let subject: string;
  let html: string;
  let type: string;

  if (correction) {
    subject = `Payment Correction \u2014 ${studentName} (${month})`;
    html = buildCorrectionHtml({ studentName, month });
    type = 'correction';
  } else {
    if (isOverpayment) {
      subject = `Payment Received (with Credit) \u2014 ${studentName} (${month})`;
      type = 'overpayment_receipt';
    } else if (isFullPayment) {
      subject = `Payment Received \u2014 ${studentName} (${month})`;
      type = 'receipt';
    } else {
      subject = `Partial Payment Received \u2014 ${studentName} (${month})`;
      type = 'partial_receipt';
    }
    html = customHtml || buildReceiptHtml({
      studentName, parentName, month,
      paymentAmount: paymentAmount || 0,
      paymentDate: paymentDate || new Date().toISOString().split('T')[0],
      paymentMethod: paymentMethod || 'PayNow',
      isFullPayment: !!isFullPayment,
      isOverpayment: !!isOverpayment,
      remainingBalance: remainingBalance || 0,
      finalAmount,
    });
  }

  // Send via Resend
  let resendId = '';
  let status = 'sent';
  let errorMsg = '';
  try {
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
    if (!sendRes.ok) throw new Error('Resend failed: ' + await sendRes.text());
    const sendData = await sendRes.json();
    resendId = sendData.id || '';
  } catch (err: any) {
    status = 'failed';
    errorMsg = err.message;
  }

  // Log to EmailLog (non-fatal)
  try {
    await airtableRequest('EmailLog', '', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          'Email ID': `${type}-${invoiceId}-${Date.now()}`,
          'Sent At': new Date().toISOString(),
          'Type': type,
          'To Email': parentEmail,
          'Subject': subject,
          'Body HTML': html,
          'Related Invoice': [invoiceId],
          'Status': status,
          ...(errorMsg ? { 'Error': errorMsg } : {}),
          ...(resendId ? { 'Resend ID': resendId } : {}),
        },
      }),
    });
  } catch (logErr: any) {
    console.error('[send-receipt] EmailLog failed:', logErr.message);
  }

  if (status === 'failed') {
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
  return NextResponse.json({ success: true, resendId });
}
