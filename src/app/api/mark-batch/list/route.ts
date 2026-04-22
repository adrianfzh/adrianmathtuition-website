import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status') || 'all';

  // ── Build Airtable filter ─────────────────────────────────────────────────

  let formula = '';
  if (statusFilter === 'to-mark') {
    formula = `OR({Status}="detected",{Status}="marking")`;
  } else if (statusFilter === 'marked') {
    formula = `OR({Status}="marked",{Status}="finalized")`;
  }
  // 'all' → no filter, but exclude deleted
  if (!formula) {
    formula = `NOT({Status}="deleted")`;
  } else {
    formula = `AND(${formula},NOT({Status}="deleted"))`;
  }

  const encodedFormula = encodeURIComponent(formula);
  const sort = encodeURIComponent(JSON.stringify([{ field: 'Created At', direction: 'desc' }]));

  // ── Fetch batches (cap 50) ────────────────────────────────────────────────

  let batchRecords: any[] = [];
  try {
    const data = await airtableRequest(
      'Batches',
      `?filterByFormula=${encodedFormula}&sort[0][field]=Created+At&sort[0][direction]=desc&maxRecords=50`
    );
    batchRecords = data.records || [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to fetch batches: ${msg}` }, { status: 500 });
  }

  // ── Map to response shape ────────────────────────────────────────────────

  const batches = batchRecords.map((r: any) => {
    const f = r.fields || {};
    return {
      batchId: f['Batch ID'] as string || r.id,
      airtableRecordId: r.id as string,
      studentName: f['Student Name'] as string || '',
      createdAt: f['Created At'] as string || '',
      status: f['Status'] as string || 'detected',
      totalQuestions: (f['Total Questions'] as number) || 0,
      totalPages: (f['Total Pages'] as number) || 0,
      totalMarksAwarded: typeof f['Total Marks Awarded'] === 'number' ? f['Total Marks Awarded'] as number : null,
      totalMarksMax: typeof f['Total Marks Max'] === 'number' ? f['Total Marks Max'] as number : null,
      finalPdfUrl: f['Final PDF URL'] as string || null,
      finalizedAt: f['Finalized At'] as string || null,
    };
  });

  return NextResponse.json({ batches });
}
