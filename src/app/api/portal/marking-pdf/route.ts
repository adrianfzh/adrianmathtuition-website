// GET /api/portal/marking-pdf?run=<paper_marking_runs.id>&kind=marked|full
//
// The student's own marked script, streamed same-origin with a proper filename
// (lib/marked-pdf-filename.ts): "Kassandra Lim — am tys 2021 p1 — 3 Sep 2026.pdf".
// Until 3 Sep 2026 /app/marking linked straight at Vercel Blob, so an opened or
// saved copy carried the Blob timestamp path as its name (Adrian: "the pdf should
// be properly named"). Nothing is stored: the bytes pass through.
//
// Access control mirrors /app/marking and practice-pdf exactly: the session
// student's Airtable identity, released runs only. `kind=marked` = Adrian's pen
// > the red-pen page images > the full report (the same precedence
// buildStudentMarking uses for `pdfUrl`); `kind=full` = the full report only.

import { NextRequest, NextResponse } from 'next/server';
import { currentStudent, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isOurFileUrl, fetchOurFile } from '@/lib/student-files';
import { markedPdfFilename, contentDisposition } from '@/lib/marked-pdf-filename';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, created_at, paper_name, annotated_pdf_url, photos_pdf_url, pdf_url, released_at';

export async function GET(req: NextRequest) {
  const { account } = await currentStudent(); // no session → redirect to /login

  const runId = (req.nextUrl.searchParams.get('run') || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'run is required' }, { status: 400 });
  const kind = req.nextUrl.searchParams.get('kind') === 'full' ? 'full' : 'marked';

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('paper_marking_runs')
    .select(COLUMNS)
    .eq('id', runId)
    .eq('student_id', portalIdentity(account))
    .not('released_at', 'is', null)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const row = data as { created_at: string; paper_name: string | null; annotated_pdf_url: string | null; photos_pdf_url: string | null; pdf_url: string | null };
  const url = kind === 'full'
    ? row.pdf_url
    : (row.annotated_pdf_url || row.photos_pdf_url || row.pdf_url);
  if (!url || !isOurFileUrl(url)) return NextResponse.json({ error: 'no pdf' }, { status: 404 });

  const filename = markedPdfFilename({
    studentName: account.display_name, paperName: row.paper_name, dateISO: row.created_at, kind,
  });

  const r = await fetchOurFile(url);
  if (!r.ok) return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
  return new NextResponse(r.body, {
    headers: {
      'Content-Type': 'application/pdf',
      // inline: it still opens in the tab the link targets; the name is what
      // Safari's Share / "Save to Files" and a desktop download use.
      'Content-Disposition': contentDisposition(filename, 'inline'),
      'Cache-Control': 'private, no-store',
    },
  });
}
