import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { generateInvoicePDF } from '@/lib/generate-pdf';
import { buildRegisterUrl } from '@/lib/invoice-register-url';

export const runtime = 'nodejs';
export const maxDuration = 300;

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  return req.headers.get('authorization') === `Bearer ${adminPassword}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const at = (table: string, path: string, options?: RequestInit) =>
    airtableRequest(table, path, options);

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const { recordId: singleRecordId, recordIds, force } = body;

  let invoices: any[];
  if (singleRecordId) {
    invoices = [await at('Invoices', `/${singleRecordId}`)];
  } else if (recordIds?.length) {
    // Explicit list of IDs (e.g. month-filtered bulk generate from admin panel)
    invoices = await Promise.all((recordIds as string[]).map((id: string) => at('Invoices', `/${id}`)));
  } else {
    // Paginate (Airtable caps at 100/page) — otherwise drafts past page 1
    // silently get no PDF.
    const data = await airtableRequestAll('Invoices', `?filterByFormula=${encodeURIComponent(`{Status}='Draft'`)}`);
    invoices = data.records || [];
  }

  let generated = 0;
  let skipped = 0;
  const errors: any[] = [];

  for (const record of invoices) {
    const id = record.id;
    const f = record.fields;
    let studentName = '';
    try {
      if (!force && !singleRecordId && f['PDF URL']) {
        skipped++;
        continue;
      }

      const studentId = f['Student']?.[0];
      if (studentId) {
        const studentRecord = await at('Students', `/${studentId}`);
        studentName = studentRecord.fields['Student Name'] || '';
      }

      const lineItems = f['Line Items'] ? JSON.parse(f['Line Items']) : [];
      const invoiceData = {
        studentName,
        month: f['Month'] || '',
        invoiceId: id,
        issueDate: f['Issue Date'] || '',
        dueDate: f['Due Date'] || '',
        lessonsCount: f['Lessons Count'] || 0,
        ratePerLesson: f['Rate Per Lesson'] || 0,
        baseAmount: f['Base Amount'] || 0,
        finalAmount: f['Final Amount'] || 0,
        status: f['Status'] || 'Draft',
        makeupCredits: 0,
        // Carry-over breakdown lives in Airtable Auto Notes for admin reference only —
        // suppressed from the parent-facing PDF (same as the cron flow) so the bot
        // section doesn't overflow to page 2.
        notes: '',
        lineItems,
        lineItemsExtra: (() => { try { return JSON.parse(f['Line Items Extra'] || '[]'); } catch { return []; } })(),
        registerUrl: buildRegisterUrl(studentId),
      };

      const pdfBuffer = await generateInvoicePDF(invoiceData);

      const blob = await put(
        `invoices/AdrianMathTuition-Invoice-${studentName.replace(/\s+/g, '-')}-${(f['Month'] || '').replace(/\s+/g, '-')}.pdf`,
        pdfBuffer,
        { access: 'public', contentType: 'application/pdf', allowOverwrite: true }
      );

      const issueDate = new Date();
      issueDate.setDate(15);
      const issueDateStr = issueDate.toISOString().split('T')[0];
      await at('Invoices', `/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'PDF URL': blob.url, 'Issue Date': issueDateStr } }),
      });

      generated++;
    } catch (err: any) {
      console.error(`[generate-pdf-batch] Error for ${id}:`, err.message);
      errors.push({ studentName, error: err.message });
    }
  }

  return NextResponse.json({ generated, skipped, errors });
}
