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

  const invoiceRecord = await at('Invoices', `/${recordId}`);
  const f = invoiceRecord.fields;

  let studentName = '';
  let parentEmail = '';
  const studentId = f['Student']?.[0];
  if (studentId) {
    const studentRecord = await at('Students', `/${studentId}`);
    studentName = studentRecord.fields['Student Name'] || '';
    parentEmail = studentRecord.fields['Parent Email'] || '';
  }

  const lineItems = f['Line Items'] ? JSON.parse(f['Line Items']) : [];
  const invoiceData = {
    studentName,
    parentEmail,
    month: f['Month'] || '',
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
    // Carry-over breakdown kept in Airtable Auto Notes for admin reference;
    // suppressed from the parent-facing PDF to avoid bot-section overflow.
    notes: '',
    lineItems,
    lineItemsExtra: (() => { try { return JSON.parse(f['Line Items Extra'] || '[]'); } catch { return []; } })(),
    registerUrl: buildRegisterUrl(studentId),
  };

  const pdfBuffer = await generateInvoicePDF(invoiceData);
  const filename = `AdrianMathTuition-Invoice-${(studentName || '').replace(/\s+/g, '-')}-${(f['Month'] || recordId).replace(/\s+/g, '-')}.pdf`;

  return new Response(pdfBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
}
