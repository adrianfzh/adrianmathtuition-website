import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${adminPassword}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  // Auth-only ping
  if (searchParams.get('auth') === 'check') {
    return NextResponse.json({ ok: true });
  }

  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const at = (table: string, path: string, options?: RequestInit) =>
    airtableRequest(table, path, options);

  const formula = encodeURIComponent(`OR({Status}='Draft',{Status}='Approved',{Status}='Sent')`);
  const invoicesData = await at(
    'Invoices',
    `?filterByFormula=${formula}&sort[0][field]=Student&sort[0][direction]=asc`
  );
  const invoices = invoicesData.records || [];

  const studentIds = [
    ...new Set(invoices.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)),
  ] as string[];

  let studentsById: Record<string, any> = {};
  if (studentIds.length) {
    const studentsData = await at(
      'Students',
      `?filterByFormula=OR(${studentIds.map((id) => `RECORD_ID()='${id}'`).join(',')})` +
        `&fields[]=Student Name&fields[]=Parent Email`
    );
    studentsById = Object.fromEntries(studentsData.records.map((r: any) => [r.id, r.fields]));
  }

  const result = invoices.map((r: any) => {
    const f = r.fields;
    const studentId = f['Student']?.[0];
    const studentFields = studentsById[studentId] || {};
    return {
      id: r.id,
      studentName: studentFields['Student Name'] || '',
      parentEmail: studentFields['Parent Email'] || '',
      month: f['Month'] || '',
      lessonsCount: f['Lessons Count'] || 0,
      ratePerLesson: f['Rate Per Lesson'] || 0,
      baseAmount: f['Base Amount'] || 0,
      adjustmentAmount: f['Adjustment Amount'] ?? null,
      adjustmentNotes: f['Adjustment Notes'] || null,
      finalAmount: f['Final Amount'] || 0,
      autoNotes: f['Auto Notes'] || '',
      invoiceType: f['Invoice Type'] || '',
      status: f['Status'] || '',
      issueDate: f['Issue Date'] || '',
      dueDate: f['Due Date'] || '',
      sentAt: f['Sent At'] || null,
      amountPaid: f['Amount Paid'] || 0,
      isPaid: f['Is Paid'] || false,
      pdfUrl: f['PDF URL'] || null,
      lineItems: f['Line Items'] ? JSON.parse(f['Line Items']) : [],
      lineItemsExtra: f['Line Items Extra'] ? JSON.parse(f['Line Items Extra']) : [],
    };
  });

  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const { recordId, fields } = await req.json();
  if (!recordId || !fields) {
    return NextResponse.json({ error: 'Missing recordId or fields' }, { status: 400 });
  }

  const updated = await airtableRequest('Invoices', `/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });

  return NextResponse.json(updated);
}
