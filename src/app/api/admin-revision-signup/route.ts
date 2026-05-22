import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

// ── Lesson schedule config ─────────────────────────────────────────────────────

const EM_DATES = [
  '2026-06-02', '2026-06-05', '2026-06-09', '2026-06-12', '2026-06-16', '2026-06-19',
];
const AM_DATES = [
  '2026-06-02', '2026-06-05', '2026-06-09', '2026-06-12', '2026-06-16', '2026-06-19',
  '2026-06-23', '2026-06-26',
];
const JC_DATES = [
  '2026-06-01', '2026-06-04', '2026-06-08', '2026-06-11', '2026-06-15', '2026-06-18',
  '2026-06-22', '2026-06-25',
];

const EM_DAY = 'Tue/Fri 10am-12pm';
const AM_DAY = 'Tue/Fri 1pm-3pm';
const JC_DAY = 'Mon/Thu 12pm-2.30pm';

interface LineItem {
  description: string;
  amount: number;
  rate: number;
  day: string;
}

function buildLineItems(subjects: string[]): { lineItems: LineItem[]; totalLessons: number } {
  const lineItems: LineItem[] = [];
  let totalLessons = 0;

  if (subjects.includes('EM')) {
    lineItems.push({
      description: 'Sec 4 EM June Holiday Revision Sprint (6 lessons)',
      amount: 420,
      rate: 420,
      day: '',
    });
    totalLessons += 6;
  }
  if (subjects.includes('AM')) {
    lineItems.push({
      description: 'Sec 4 AM June Holiday Revision Sprint (8 lessons)',
      amount: 560,
      rate: 560,
      day: '',
    });
    totalLessons += 8;
  }
  if (subjects.includes('JC')) {
    lineItems.push({
      description: 'JC2 H2 Math June Holiday Revision Sprint (8 lessons)',
      amount: 640,
      rate: 640,
      day: '',
    });
    totalLessons += 8;
  }

  return { lineItems, totalLessons };
}

function buildLessonRecords(subjects: string[], studentId: string, level: string, invoiceId: string) {
  const records: Array<{ fields: Record<string, unknown> }> = [];
  if (subjects.includes('EM')) {
    for (const date of EM_DATES) {
      records.push({ fields: { Student: [studentId], Date: date, Type: 'Revision Sprint', Status: 'Scheduled', 'Source Invoice': [invoiceId], Level: level, Day: EM_DAY } });
    }
  }
  if (subjects.includes('AM')) {
    for (const date of AM_DATES) {
      records.push({ fields: { Student: [studentId], Date: date, Type: 'Revision Sprint', Status: 'Scheduled', 'Source Invoice': [invoiceId], Level: level, Day: AM_DAY } });
    }
  }
  if (subjects.includes('JC')) {
    for (const date of JC_DATES) {
      records.push({ fields: { Student: [studentId], Date: date, Type: 'Revision Sprint', Status: 'Scheduled', 'Source Invoice': [invoiceId], Level: level, Day: JC_DAY } });
    }
  }
  return records;
}

// Split array into batches of max N
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { studentId: string; level: string; subjects: string[]; total: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { studentId, level, subjects, total } = body;
  if (!studentId || !level || !subjects?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Idempotency check
  let studentRecord: { fields: Record<string, unknown> };
  try {
    studentRecord = await airtableRequest('Students', `/${studentId}`);
  } catch (e: unknown) {
    return NextResponse.json({ error: `Failed to fetch student: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  // If already signed up, check if they want to ADD subjects (not re-sign-up from scratch)
  if (studentRecord.fields['June Revision 2026'] === 'Signed Up') {
    // Find existing revision invoice to check what they already have
    const existingRevFormula = encodeURIComponent(`AND({Month}='June 2026',{Invoice Type}='Revision Sprint',{Status}!='Voided')`);
    const existingRevInvoices = await airtableRequestAll('Invoices', `?filterByFormula=${existingRevFormula}&fields[]=Student&fields[]=Line+Items&fields[]=Final+Amount`);
    const existingInv = existingRevInvoices.records.find((r: { fields: Record<string, unknown[]> }) => r.fields['Student']?.[0] === studentId);
    if (!existingInv) {
      return NextResponse.json({ error: 'Student already signed up but no revision invoice found' }, { status: 409 });
    }
    // Parse existing subjects
    let existingItems: Array<{description?: string}> = [];
    try { existingItems = JSON.parse(existingInv.fields['Line Items'] as string || '[]'); } catch { /* ignore */ }
    const existingSubjects = new Set<string>();
    for (const item of existingItems) {
      const d = item.description || '';
      if (d.includes('E Math') || d.includes('EM')) existingSubjects.add('EM');
      else if (d.includes('A Math') || d.includes('AM')) existingSubjects.add('AM');
      else if (d.includes('H2') || d.includes('JC')) existingSubjects.add('JC');
    }
    // Only allow adding new subjects
    const newSubjects = subjects.filter(s => !existingSubjects.has(s));
    if (newSubjects.length === 0) {
      return NextResponse.json({ error: 'All selected subjects are already signed up' }, { status: 409 });
    }
    // Add new subjects: update invoice and create new lesson records
    const { lineItems: newItems, totalLessons: newLessons } = buildLineItems(newSubjects);
    const existingAmount = (existingInv.fields['Final Amount'] as number) || 0;
    const addAmount = newItems.reduce((s, i) => s + i.amount, 0);
    const allItems = [...existingItems, ...newItems];
    await airtableRequest('Invoices', `/${existingInv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: {
        'Line Items': JSON.stringify(allItems),
        'Base Amount': existingAmount + addAmount,
        'Final Amount': existingAmount + addAmount,
        'Lessons Count': (existingInv.fields['Lessons Count'] as number || 0) + newLessons,
      }}),
    });
    // Create lesson records for new subjects only
    const lessonRecords = buildLessonRecords(newSubjects, studentId, level, existingInv.id);
    const batches = chunk(lessonRecords, 10);
    let lessonsCreated = 0;
    for (const batch of batches) {
      await airtableRequest('Lessons', '', { method: 'POST', body: JSON.stringify({ records: batch }) });
      lessonsCreated += batch.length;
    }
    return NextResponse.json({ success: true, invoiceId: existingInv.id, lessonsCreated, added: newSubjects });
  }

  const today = localToday();
  const { lineItems, totalLessons } = buildLineItems(subjects);

  // Track what we've done for rollback
  let studentPatched = false;
  let originalInvoiceId: string | null = null;
  let originalInvoiceStatus: string | null = null;
  let revisionInvoiceId: string | null = null;

  try {
    // ── Step 1: Mark student as Signed Up ─────────────────────────────────────
    await airtableRequest('Students', `/${studentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'June Revision 2026': 'Signed Up' } }),
    });
    studentPatched = true;

    // ── Step 2: Find and void original June 2026 regular invoice ─────────────
    const regularFormula = encodeURIComponent(
      `AND({Month}='June 2026',{Invoice Type}='Regular',{Status}!='Voided')`
    );
    const regularInvoices = await airtableRequestAll(
      'Invoices',
      `?filterByFormula=${regularFormula}&fields[]=Student&fields[]=Status&fields[]=Adjustment%20Notes`
    );

    const regularInvoice = regularInvoices.records.find(
      (r: { fields: Record<string, unknown[]> }) => r.fields['Student']?.[0] === studentId
    );

    if (regularInvoice) {
      originalInvoiceId = regularInvoice.id;
      originalInvoiceStatus = (regularInvoice.fields['Status'] as string) || 'Draft';
      const noteText = `Original status: ${originalInvoiceStatus}; voided for revision sign-up on ${today}`;
      await airtableRequest('Invoices', `/${originalInvoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            Status: 'Voided',
            'Adjustment Notes': noteText,
          },
        }),
      });
    }

    // ── Step 3: Create revision sprint invoice ────────────────────────────────
    const revisionInvoice = await airtableRequest('Invoices', '', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Student: [studentId],
          Month: 'June 2026',
          'Invoice Type': 'Revision Sprint',
          Status: 'Draft',
          'Issue Date': today,
          'Due Date': '2026-06-01',
          'Line Items': JSON.stringify(lineItems),
          'Base Amount': total,
          'Final Amount': total,
          'Lessons Count': totalLessons,
        },
      }),
    });
    revisionInvoiceId = revisionInvoice.id;

    // ── Step 4: Create lesson records ─────────────────────────────────────────
    const lessonRecords = buildLessonRecords(subjects, studentId, level, revisionInvoiceId!);
    const batches = chunk(lessonRecords, 10);
    let lessonsCreated = 0;
    for (const batch of batches) {
      await airtableRequest('Lessons', '', {
        method: 'POST',
        body: JSON.stringify({ records: batch }),
      });
      lessonsCreated += batch.length;
    }

    return NextResponse.json({ success: true, invoiceId: revisionInvoiceId, lessonsCreated });
  } catch (e: unknown) {
    console.error('[admin-revision-signup] Error:', e);

    // Best-effort rollback
    try {
      if (revisionInvoiceId) {
        await airtableRequest('Invoices', `/${revisionInvoiceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { Status: 'Voided' } }),
        });
      }
      if (originalInvoiceId && originalInvoiceStatus) {
        await airtableRequest('Invoices', `/${originalInvoiceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { Status: originalInvoiceStatus, 'Adjustment Notes': '' } }),
        });
      }
      if (studentPatched) {
        await airtableRequest('Students', `/${studentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { 'June Revision 2026': 'No Response' } }),
        });
      }
    } catch (rollbackErr) {
      console.error('[admin-revision-signup] Rollback error:', rollbackErr);
    }

    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
