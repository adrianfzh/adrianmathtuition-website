import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { airtableRequest } from '@/lib/airtable';
import { generateReceiptPDF } from '@/lib/generate-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { ADMIN_PASSWORD, AIRTABLE_TOKEN, AIRTABLE_BASE_ID, RESEND_API_KEY } = process.env;

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { invoiceId, password, preview, paymentDate } = body;

  if (!invoiceId || !password) {
    return NextResponse.json({ error: 'Missing invoiceId or password' }, { status: 400 });
  }

  if (ADMIN_PASSWORD && password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const at = (table: string, path: string, options?: RequestInit) =>
    airtableRequest(table, path, options);

  const invoiceRecord = await at('Invoices', `/${invoiceId}`);
  const f = invoiceRecord.fields;

  const studentId = f['Student']?.[0];
  let studentName = '';
  let parentEmail = '';
  if (studentId) {
    const studentRecord = await at('Students', `/${studentId}`);
    studentName = studentRecord.fields['Student Name'] || '';
    parentEmail = studentRecord.fields['Parent Email'] || '';
  }

  const lineItems = f['Line Items'] ? JSON.parse(f['Line Items']) : [];
  const lineItemsExtra = (() => {
    try { return JSON.parse(f['Line Items Extra'] || '[]'); } catch { return []; }
  })();

  const receiptData = {
    studentName,
    parentEmail,
    month: f['Month'] || '',
    receiptId: invoiceId,
    paymentDate: paymentDate || f['Paid At'] || '',
    finalAmount: f['Final Amount'] || 0,
    notes: f['Auto Notes'] || '',
    lineItems,
    lineItemsExtra,
    ratePerLesson: f['Rate Per Lesson'] || 0,
  };

  const pdfBuffer = await generateReceiptPDF(receiptData);

  const safeName = studentName.replace(/\s+/g, '-');
  const safeMonth = (f['Month'] || '').replace(/\s+/g, '-');
  const blob = await put(
    `receipts/AdrianMathTuition-Receipt-${safeName}-${safeMonth}.pdf`,
    pdfBuffer,
    { access: 'public', contentType: 'application/pdf', allowOverwrite: true }
  );

  if (!preview && parentEmail && RESEND_API_KEY) {
    const finalAmount = parseFloat(String(f['Final Amount'] || 0)).toFixed(2);
    const emailHtml = `
      <p>Dear Parent/Student,</p>
      <p>Please find attached the payment receipt for ${studentName} for ${f['Month'] || ''} — <strong>$${finalAmount}</strong>.</p>
      <p>This receipt confirms that payment has been received. Thank you for your support!</p>
      <p>Best regards,<br>Adrian</p>
    `;

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: "Adrian's Math Tuition <invoices@adrianmathtuition.com>",
        to: parentEmail,
        subject: `Payment Receipt for ${f['Month'] || ''} \u2013 ${studentName}`,
        html: emailHtml,
        attachments: [{
          filename: `AdrianMathTuition-Receipt-${safeName}-${safeMonth}.pdf`,
          content: pdfBuffer.toString('base64'),
          type: 'application/pdf',
          disposition: 'attachment',
        }],
      }),
    });

    if (!sendRes.ok) {
      throw new Error('Resend send failed: ' + await sendRes.text());
    }
  }

  return NextResponse.json({ success: true, receiptUrl: blob.url, parentEmail, studentName });
}
