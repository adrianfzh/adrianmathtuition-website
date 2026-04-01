import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 300;

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const validCron = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const validAdmin = !!(adminPassword && authHeader === `Bearer ${adminPassword}`);
  return isVercelCron || validCron || validAdmin;
}

function buildEmailHtml(invoice: {
  studentName: string;
  month: string;
  finalAmount: number;
  dueDate: string;
  paymentRef: string;
}) {
  return `
    <p>Dear Parent/Student,</p>
    <p>Please find attached the invoice for ${invoice.studentName} for ${invoice.month} — <strong>$${invoice.finalAmount}</strong>, due by <strong>${invoice.dueDate}</strong>.</p>
    <p>To pay, PayNow to <strong>91397985</strong> with reference <strong>${invoice.paymentRef}</strong>.</p>
    <p>Please feel free to reach out if you have any questions.</p>
    <p>Best regards,<br>Adrian</p>
  `;
}

function buildAmendedEmailHtml(invoice: {
  studentName: string;
  month: string;
  finalAmount: number;
  dueDate: string;
  paymentRef: string;
}) {
  return `
    <p>Dear Parent/Student,</p>
    <p>Please find attached the <strong>amended invoice</strong> for ${invoice.studentName} for ${invoice.month} — <strong>${invoice.finalAmount.toFixed(2)}</strong>, due by <strong>${invoice.dueDate}</strong>.</p>
    <p>This replaces the previously sent invoice. Please disregard the earlier email.</p>
    <p>To pay, PayNow to <strong>91397985</strong> with reference <strong>${invoice.paymentRef}</strong>.</p>
    <p>Please feel free to reach out if you have any questions.</p>
    <p>Best regards,<br>Adrian</p>
  `;
}

async function downloadPdf(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PDF download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (err: any) {
    console.error('[send-invoices] PDF download error:', err.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, RESEND_API_KEY } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !RESEND_API_KEY) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const at = (table: string, path: string, options?: RequestInit) =>
    airtableRequest(table, path, options);

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const { recordId: singleRecordId, recordIds } = body;

  try {
    let invoiceRecords: any[];
    if (Array.isArray(recordIds) && recordIds.length) {
      invoiceRecords = await Promise.all(recordIds.map((id: string) => at('Invoices', `/${id}`)));
    } else if (singleRecordId) {
      invoiceRecords = [await at('Invoices', `/${singleRecordId}`)];
    } else {
      const data = await at('Invoices', `?filterByFormula=${encodeURIComponent(`{Status}='Approved'`)}`);
      invoiceRecords = data.records || [];
    }

    if (!invoiceRecords.length) {
      return NextResponse.json({ sent: 0, failed: 0, errors: [] });
    }

    const studentIds = [
      ...new Set(invoiceRecords.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)),
    ] as string[];
    const studentsData = studentIds.length
      ? await at('Students', `?filterByFormula=OR(${studentIds.map((id) => `RECORD_ID()='${id}'`).join(',')})`)
      : { records: [] };
    const studentsById: Record<string, any> = Object.fromEntries(
      studentsData.records.map((r: any) => [r.id, r.fields])
    );

    const pdfBuffers = await Promise.all(
      invoiceRecords.map((record: any) => {
        const pdfUrl = record.fields['PDF URL'];
        return pdfUrl ? downloadPdf(pdfUrl) : Promise.resolve(null);
      })
    );

    const emails: any[] = [];
    const invoiceMap = new Map<string, any>();

    for (let i = 0; i < invoiceRecords.length; i++) {
      const invoiceRecord = invoiceRecords[i];
      const studentId = invoiceRecord.fields['Student']?.[0];
      const student = studentsById[studentId];
      if (!student) continue;

      const invoice = {
        id: invoiceRecord.id,
        studentName: student['Student Name'],
        parentEmail: student['Parent Email'],
        month: invoiceRecord.fields['Month'],
        finalAmount: invoiceRecord.fields['Final Amount'] || 0,
        dueDate: invoiceRecord.fields['Due Date'],
        paymentRef: `${(student['Student Name'] || '').toUpperCase()} \u2013 ${(invoiceRecord.fields['Month'] || '').toUpperCase()}`,
      };

      const pdfBuffer = pdfBuffers[i];
      const isAmended = !!invoiceRecord.fields['Sent At'];
      const subject = isAmended
        ? `AMENDED Invoice for ${invoice.month} \u2013 ${invoice.studentName}`
        : `Invoice for ${invoice.month} \u2013 ${invoice.studentName}`;
      const html = isAmended ? buildAmendedEmailHtml(invoice) : buildEmailHtml(invoice);

      const emailData: any = {
        from: "Adrian's Math Tuition <invoices@adrianmathtuition.com>",
        to: invoice.parentEmail,
        subject,
        html,
      };
      if (pdfBuffer) {
        emailData.attachments = [{
          filename: `AdriansMathTuition-Invoice-${(invoice.studentName || '').replace(/\s+/g, '-')}-${(invoice.month || '').replace(/\s+/g, '-')}.pdf`,
          content: pdfBuffer.toString('base64'),
          type: 'application/pdf',
          disposition: 'attachment',
        }];
      }
      emails.push(emailData);
      invoiceMap.set(invoice.id, invoiceRecord);
    }

    if (!emails.length) {
      return NextResponse.json({ sent: 0, failed: 0, errors: [] });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: any[] = [];
    const invoiceIds = Array.from(invoiceMap.keys());

    for (let i = 0; i < invoiceIds.length; i++) {
      const invoiceId = invoiceIds[i];
      const emailData = emails[i];
      try {
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData),
        });
        if (!sendRes.ok) throw new Error('Resend send failed: ' + await sendRes.text());

        await at('Invoices', `/${invoiceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { 'Status': 'Sent', 'Sent At': new Date().toISOString() } }),
        });
        sentCount++;
      } catch (err: any) {
        failedCount++;
        errors.push({ invoiceId, error: err.message });
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    const currentMonth = emails[0]?.subject?.match(/for (.+) \u2013/)?.[1] ?? '';
    await sendTelegram(
      `\u2705 <b>Invoices Sent \u2014 ${currentMonth}</b>\n\n` +
        `Sent: ${sentCount}\nFailed: ${failedCount}\n` +
        (failedCount > 0
          ? `\u26a0\ufe0f ${failedCount} invoice${failedCount !== 1 ? 's' : ''} failed to send. Please check the admin panel.`
          : `All invoices processed successfully.`)
    );

    return NextResponse.json({ sent: sentCount, failed: failedCount, errors, total: emails.length });
  } catch (err: any) {
    console.error('[send-invoices] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
