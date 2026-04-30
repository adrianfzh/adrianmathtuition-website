import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { generateInvoicePDF } from '@/lib/generate-pdf';
import { buildRegisterUrl } from '@/lib/invoice-register-url';

export const runtime = 'nodejs';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  return req.headers.get('authorization') === `Bearer ${adminPassword}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const recordId = searchParams.get('id');
  if (!recordId) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const at = (table: string, path: string, options?: RequestInit) =>
    airtableRequest(table, path, options);

  let invoiceRecord: any;
  try {
    invoiceRecord = await at('Invoices', `/${recordId}`);
  } catch (err: any) {
    return NextResponse.json({ error: `Airtable fetch failed: ${err.message ?? err}` }, { status: 502 });
  }
  const f = invoiceRecord.fields;

  let studentName = '';
  let parentEmail = '';
  const studentId = f['Student']?.[0];
  if (studentId) {
    try {
      const studentRecord = await at('Students', `/${studentId}`);
      studentName = studentRecord.fields['Student Name'] || '';
      parentEmail = studentRecord.fields['Parent Email'] || '';
    } catch { /* non-fatal — render without student name */ }
  }

  let lineItems: any[] = [];
  try { lineItems = f['Line Items'] ? JSON.parse(f['Line Items']) : []; }
  catch { lineItems = []; }

  // If line items span an earlier month than the stored Month field
  // (e.g. combined April+May invoice stored as "May 2026"), show the full
  // range "April–May 2026" in the PDF so the parent sees the complete period.
  const storedMonth: string = f['Month'] || '';
  let displayMonth = storedMonth;
  if (lineItems.length > 0) {
    const firstItemDate = lineItems[0].date as string | undefined;
    if (firstItemDate) {
      const firstDate = new Date(firstItemDate + 'T00:00:00');
      const storedDateRef = new Date(`1 ${storedMonth}`);
      if (
        !isNaN(firstDate.getTime()) &&
        !isNaN(storedDateRef.getTime()) &&
        (firstDate.getFullYear() < storedDateRef.getFullYear() ||
          (firstDate.getFullYear() === storedDateRef.getFullYear() &&
            firstDate.getMonth() < storedDateRef.getMonth()))
      ) {
        const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        displayMonth = `${MONTHS[firstDate.getMonth()]}–${storedMonth}`;
      }
    }
  }

  const invoiceData = {
    studentName,
    parentEmail,
    month: displayMonth,
    invoiceId: recordId,
    issueDate: f['Issue Date'] || '',
    dueDate: f['Due Date'] || '',
    lessonsCount: f['Lessons Count'] || 0,
    ratePerLesson: f['Rate Per Lesson'] || 0,
    baseAmount: f['Base Amount'] || 0,
    adjustmentAmount: f['Adjustment Amount'] || 0,
    adjustmentNotes: f['Adjustment Notes'] || '',
    finalAmount: f['Final Amount'] || 0,
    status: f['Status'] || 'Draft',
    makeupCredits: 0,
    notes: (f['Auto Notes'] || '') as string,
    lineItems,
    lineItemsExtra: (() => { try { return JSON.parse(f['Line Items Extra'] || '[]'); } catch { return []; } })(),
    registerUrl: buildRegisterUrl(studentId),
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInvoicePDF(invoiceData);
  } catch (err: any) {
    console.error('[preview-invoice] PDF generation failed:', err);
    return NextResponse.json({ error: `PDF generation failed: ${err.message ?? err}` }, { status: 500 });
  }

  const filename = `AdrianMathTuition-Invoice-${(studentName || '').replace(/\s+/g, '-')}-${(displayMonth || recordId).replace(/[\s–]/g, '-')}.pdf`;

  return new Response(pdfBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
}
