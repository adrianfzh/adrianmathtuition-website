// GET /api/tutor/paper-pdf?paper=<tutor_papers.id>[&kind=full] — the marked script.
// The tutor's own row is the ownership proof; the file comes from the private store.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { isOurFileUrl, fetchOurFile } from '@/lib/student-files';
import { contentDisposition } from '@/lib/marked-pdf-filename';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('paper') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'paper is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: p } = await sb.from('tutor_papers').select('run_id, paper_name').eq('id', id).eq('tutor_id', tutor.id).maybeSingle();
  if (!p?.run_id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data: run } = await sb.from('paper_marking_runs').select('annotated_pdf_url, photos_pdf_url, pdf_url, total_max').eq('id', p.run_id).maybeSingle();
  if (!run || run.total_max == null) return NextResponse.json({ error: 'not marked yet' }, { status: 404 });
  const full = req.nextUrl.searchParams.get('kind') === 'full';
  const url = full ? run.pdf_url : (run.annotated_pdf_url || run.photos_pdf_url || run.pdf_url);
  if (!url || !isOurFileUrl(url)) return NextResponse.json({ error: 'no pdf' }, { status: 404 });
  const r = await fetchOurFile(url);
  if (!r.ok) return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
  const name = `${String(p.paper_name).replace(/[^\w .()-]+/g, ' ').trim() || 'paper'}${full ? ' (full report)' : ' (marked)'}.pdf`;
  return new NextResponse(r.body, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(name, 'inline'), 'Cache-Control': 'private, no-store' },
  });
}
