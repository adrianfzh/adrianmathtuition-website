import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { getSupabase } from '@/lib/supabase';

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

  // Fetch from Supabase (live state) and Airtable (finalization fields) in parallel
  const atFormula = encodeURIComponent(`{Batch ID}="${batchId}"`);
  const [sbResult, atResult] = await Promise.allSettled([
    getSupabase().from('marking_batches').select('*').eq('id', batchId).single(),
    airtableRequestAll('Batches', `?filterByFormula=${atFormula}&maxRecords=1`),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbRow: any = sbResult.status === 'fulfilled' ? sbResult.value.data : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const atRec: any = atResult.status === 'fulfilled' ? atResult.value.records?.[0] : null;

  if (!sbRow && !atRec) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  // Merge: Supabase wins for live state; Airtable fills in finalization fields
  const atFields = atRec?.fields || {};

  let pageImageUrls: string[] = [];
  if (sbRow?.page_image_urls?.length) {
    pageImageUrls = sbRow.page_image_urls;
  } else {
    try { pageImageUrls = (atFields['Page Image URLs'] as string || '').split('\n').filter(Boolean); } catch { /**/ }
  }

  let detectionJson: unknown = null;
  if (sbRow?.detection_json) {
    detectionJson = sbRow.detection_json;
  } else {
    try { detectionJson = JSON.parse(atFields['Detection JSON'] as string || 'null'); } catch { /**/ }
  }

  // marking_json: set by Fly execute-batch when status='marked'
  let markingJson: unknown = null;
  if (sbRow?.marking_json) {
    markingJson = sbRow.marking_json;
  }

  const batch = {
    batchId,
    airtableRecordId: atRec?.id as string | undefined,
    studentName: sbRow?.student_name || (atFields['Student Name'] as string) || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    studentId: (detectionJson as any)?.studentId as string | null ?? null,
    createdAt: sbRow?.created_at || (atFields['Created At'] as string) || '',
    status: sbRow?.status || (atFields['Status'] as string) || 'detected',
    totalQuestions: sbRow?.total_questions ?? (atFields['Total Questions'] as number) ?? 0,
    totalPages: sbRow?.total_pages ?? (atFields['Total Pages'] as number) ?? 0,
    errorMessage: sbRow?.error_message || null,
    totalMarksAwarded: typeof atFields['Total Marks Awarded'] === 'number' ? atFields['Total Marks Awarded'] as number : null,
    totalMarksMax: typeof atFields['Total Marks Max'] === 'number' ? atFields['Total Marks Max'] as number : null,
    finalPdfUrl: (sbRow?.final_pdf_url as string) || (atFields['Final PDF URL'] as string) || null,
    finalizedAt: (sbRow?.status === 'finalized' ? sbRow?.finished_at : null) || (atFields['Finalized At'] as string) || null,
    pageImageUrls,
    detectionJson,
    markingJson,
  };

  // Fetch linked submissions from Airtable (unchanged — scope guard)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let submissions: any[] = [];
  if (atRec?.id) {
    const subFormula = encodeURIComponent(`FIND("${atRec.id}", ARRAYJOIN({Batches}))`);
    try {
      const subData = await airtableRequestAll('Submissions', `?filterByFormula=${subFormula}`);
      const recs = subData.records || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recs.sort((a: any, b: any) => {
        const la = a.fields?.['Question Number'] || '';
        const lb = b.fields?.['Question Number'] || '';
        return la.localeCompare(lb, undefined, { numeric: true });
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }

  return NextResponse.json({ batch, submissions });
}
