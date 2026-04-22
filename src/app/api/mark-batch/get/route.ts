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
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const batchId = new URL(req.url).searchParams.get('batchId');
  if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

  // Fetch batch record
  const formula = encodeURIComponent(`{Batch ID}="${batchId}"`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let batchRecord: any = null;
  try {
    const data = await airtableRequestAll('Batches', `?filterByFormula=${formula}&maxRecords=1`);
    batchRecord = data.records?.[0] || null;
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  if (!batchRecord) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

  const f = batchRecord.fields || {};

  let pageImageUrls: string[] = [];
  try { pageImageUrls = (f['Page Image URLs'] as string || '').split('\n').filter(Boolean); } catch { /**/ }

  let detectionJson: unknown = null;
  try { detectionJson = JSON.parse(f['Detection JSON'] as string || 'null'); } catch { /**/ }

  const batch = {
    batchId: (f['Batch ID'] as string) || batchRecord.id,
    airtableRecordId: batchRecord.id as string,
    studentName: (f['Student Name'] as string) || '',
    createdAt: (f['Created At'] as string) || '',
    status: (f['Status'] as string) || 'detected',
    totalQuestions: (f['Total Questions'] as number) || 0,
    totalPages: (f['Total Pages'] as number) || 0,
    totalMarksAwarded: typeof f['Total Marks Awarded'] === 'number' ? f['Total Marks Awarded'] as number : null,
    totalMarksMax: typeof f['Total Marks Max'] === 'number' ? f['Total Marks Max'] as number : null,
    finalPdfUrl: (f['Final PDF URL'] as string) || null,
    finalizedAt: (f['Finalized At'] as string) || null,
    pageImageUrls,
    detectionJson,
  };

  // Fetch linked submissions
  const subFormula = encodeURIComponent(`FIND("${batchRecord.id}", ARRAYJOIN({Batches}))`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let submissions: any[] = [];
  try {
    const subData = await airtableRequestAll('Submissions', `?filterByFormula=${subFormula}`);
    const recs = subData.records || [];
    recs.sort((a: any, b: any) => {
      const la = a.fields?.['Question Number'] || '';
      const lb = b.fields?.['Question Number'] || '';
      return la.localeCompare(lb, undefined, { numeric: true });
    });
    submissions = recs.map((r: any) => {
      const sf = r.fields || {};
      let annotatedSliceUrls: string[] = [];
      try { annotatedSliceUrls = JSON.parse(sf['Annotated Slice URLs'] || '[]'); } catch { /**/ }
      let pageIndices: number[] = [];
      try { pageIndices = JSON.parse(sf['Page Indices'] || '[]'); } catch { /**/ }
      return {
        submissionId: r.id,
        questionLabel: (sf['Question Number'] as string) || '?',
        pageIndices,
        marksAwarded: (sf['Bot Mark Awarded'] as number) || 0,
        marksMax: (sf['Bot Mark Max'] as number) || 0,
        annotatedSliceUrls,
        botFeedback: (sf['Bot Feedback'] as string) || '',
      };
    });
  } catch (err) {
    console.error('[get] submissions fetch failed:', err);
  }

  return NextResponse.json({ batch, submissions });
}
