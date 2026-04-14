import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';
export const maxDuration = 300;

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
        `&fields[]=Student Name&fields[]=Parent Email&fields[]=Parent Name&fields[]=Payment Alias`
    );
    studentsById = Object.fromEntries(studentsData.records.map((r: any) => [r.id, r.fields]));
  }

  const result = invoices.map((r: any) => {
    const f = r.fields;
    const studentId = f['Student']?.[0];
    const studentFields = studentsById[studentId] || {};
    return {
      id: r.id,
      studentId: studentId || '',
      studentName: studentFields['Student Name'] || '',
      parentEmail: studentFields['Parent Email'] || '',
      parentName: studentFields['Parent Name'] || '',
      paymentAlias: studentFields['Payment Alias'] || '',
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

  const body = await req.json();

  // Save payment alias to Students table
  if (body.studentId && body.paymentAlias !== undefined) {
    const updated = await airtableRequest('Students', `/${body.studentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Payment Alias': body.paymentAlias } }),
    });
    return NextResponse.json({ ok: true, updated });
  }

  // Standard invoice PATCH
  const { recordId, fields } = body;
  if (!recordId || !fields) {
    return NextResponse.json({ error: 'Missing recordId or fields' }, { status: 400 });
  }

  const updated = await airtableRequest('Invoices', `/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });

  return NextResponse.json(updated);
}

// DELETE /api/admin-invoices
//
// Body shapes:
//   Individual:   { recordId: 'recXXX', scope: 'invoice' | 'pdf' }
//   Bulk:         { month?: string, status?: string, scope: 'invoice' | 'pdf' }
//
// scope='invoice' deletes the Airtable row AND its PDF blob (if any).
// scope='pdf'     deletes only the PDF blob and clears the PDF URL field.
//
// Bulk mode REQUIRES the caller to pass `confirmAll: true` when no `month`
// is supplied, to guard against accidental wipe of every invoice ever.
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const scope: 'invoice' | 'pdf' = body.scope === 'pdf' ? 'pdf' : 'invoice';

  // Resolve the target record list.
  let records: any[] = [];
  if (body.recordId) {
    try {
      const rec = await airtableRequest('Invoices', `/${body.recordId}`);
      records = [rec];
    } catch (err: any) {
      return NextResponse.json({ error: `Invoice not found: ${err.message}` }, { status: 404 });
    }
  } else {
    if (!body.month && !body.confirmAll) {
      return NextResponse.json(
        { error: 'Bulk delete without a month filter requires confirmAll:true' },
        { status: 400 }
      );
    }
    const clauses: string[] = [];
    if (body.month) clauses.push(`{Month}='${String(body.month).replace(/'/g, "\\'")}'`);
    if (body.status) clauses.push(`{Status}='${String(body.status).replace(/'/g, "\\'")}'`);
    // For PDF-only scope, no point touching rows without a PDF URL.
    if (scope === 'pdf') clauses.push(`{PDF URL}!=''`);
    const formula = clauses.length
      ? `?filterByFormula=${encodeURIComponent(clauses.length === 1 ? clauses[0] : `AND(${clauses.join(',')})`)}`
      : '';
    // Paginate through all matching records (Airtable caps at 100/page).
    let offset: string | undefined;
    do {
      const sep = formula ? '&' : '?';
      const path = `${formula}${offset ? `${sep}offset=${offset}` : ''}`;
      const page = await airtableRequest('Invoices', path);
      records = records.concat(page.records || []);
      offset = page.offset;
    } while (offset);
  }

  if (!records.length) {
    return NextResponse.json({ deletedInvoices: 0, deletedPdfs: 0, errors: [] });
  }

  const errors: { id: string; error: string }[] = [];
  let deletedPdfs = 0;
  let deletedInvoices = 0;

  // 1) Delete PDF blobs from Vercel Blob storage wherever present.
  //    (Safe to call `del` on a URL that doesn't exist — it no-ops.)
  const blobDeletes = records
    .map((r) => ({ id: r.id, url: r.fields?.['PDF URL'] as string | undefined }))
    .filter((x) => !!x.url);

  await Promise.all(
    blobDeletes.map(async ({ id, url }) => {
      try {
        await del(url!);
        deletedPdfs++;
      } catch (err: any) {
        // Missing-blob errors are fine; surface anything else.
        const msg = String(err?.message || err);
        if (!/not found|404/i.test(msg)) errors.push({ id, error: `blob: ${msg}` });
      }
    })
  );

  if (scope === 'pdf') {
    // Clear the PDF URL + Issue Date on the Airtable rows we just nuked blobs for.
    // Airtable batch PATCH supports 10 records per request.
    const toPatch = blobDeletes.map(({ id }) => ({ id, fields: { 'PDF URL': '' } }));
    for (let i = 0; i < toPatch.length; i += 10) {
      const chunk = toPatch.slice(i, i + 10);
      try {
        await airtableRequest('Invoices', '', {
          method: 'PATCH',
          body: JSON.stringify({ records: chunk }),
        });
      } catch (err: any) {
        chunk.forEach((c) => errors.push({ id: c.id, error: `airtable: ${err.message}` }));
      }
    }
    return NextResponse.json({ deletedInvoices: 0, deletedPdfs, errors });
  }

  // 2) scope='invoice' — delete the Airtable rows themselves (batch of 10 via query params).
  const ids = records.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const qs = chunk.map((id) => `records[]=${encodeURIComponent(id)}`).join('&');
    try {
      await airtableRequest('Invoices', `?${qs}`, { method: 'DELETE' });
      deletedInvoices += chunk.length;
    } catch (err: any) {
      chunk.forEach((id) => errors.push({ id, error: `airtable: ${err.message}` }));
    }
  }

  return NextResponse.json({ deletedInvoices, deletedPdfs, errors });
}
