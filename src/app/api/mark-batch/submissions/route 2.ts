import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';

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

  const batchId = new URL(req.url).searchParams.get('batchId');
  if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

  // Find Batch Airtable record ID first
  const batchFormula = encodeURIComponent(`{Batch ID}="${batchId}"`);
  let batchAirtableId: string | null = null;
  try {
    const batchData = await airtableRequestAll('Batches', `?filterByFormula=${batchFormula}&maxRecords=1`);
    batchAirtableId = batchData.records?.[0]?.id || null;
  } catch { /* ignore */ }

  if (!batchAirtableId) {
    return NextResponse.json({ submissions: [] });
  }

  // Fetch submissions linked to this batch
  const subFormula = encodeURIComponent(`FIND("${batchAirtableId}", ARRAYJOIN({Batches}))`);
  let subRecords: any[] = [];
  try {
    const data = await airtableRequestAll('Submissions', `?filterByFormula=${subFormula}`);
    subRecords = data.records || [];
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  subRecords.sort((a, b) => {
    const la = a.fields?.['Question Number'] || '';
    const lb = b.fields?.['Question Number'] || '';
    return la.localeCompare(lb, undefined, { numeric: true });
  });

  const submissions = subRecords.map(r => {
    const f = r.fields || {};
    let annotatedSliceUrls: string[] = [];
    try { annotatedSliceUrls = JSON.parse(f['Annotated Slice URLs'] || '[]'); } catch { /**/ }
    return {
      questionLabel: f['Question Number'] || '?',
      annotatedSliceUrls,
      awarded: (f['Bot Mark Awarded'] as number) || 0,
      max: (f['Bot Mark Max'] as number) || 0,
      feedback: f['Bot Feedback'] as string || '',
      submissionId: r.id,
    };
  });

  return NextResponse.json({ submissions });
}
