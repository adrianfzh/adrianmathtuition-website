// GET /api/portal/marking-cover?run=<id> — the paper's cover page as a PNG, for
// the logged-in student who owns the run, released runs only (the same gate as
// /api/portal/marking-pdf). Rendered once per release and cached in the run's
// private store (runs/<id>/cover-<release>.png); a paper with nothing lost has
// no cover and answers 404, which the page treats as "no cover to show".
import { NextRequest, NextResponse } from 'next/server';
import { currentStudent, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { downloadStudentFile, putStudentFile, runKey } from '@/lib/student-files';
import { buildFrontPage } from '@/lib/front-page-build';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const student = await currentStudent();
  if (!student) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const account = student.account;
  const runId = req.nextUrl.searchParams.get('run') || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'run is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: run } = await sb.from('paper_marking_runs')
    .select('id, paper_name, student_name, total_awarded, total_max, released_at')
    .eq('id', runId).eq('student_id', portalIdentity(account)).not('released_at', 'is', null).maybeSingle();
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const stamp = String(run.released_at).replace(/[^0-9]/g, '').slice(0, 12);
  const key = runKey(runId, `cover-${stamp}.png`);
  const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' };
  try {
    const cached = await downloadStudentFile(key);
    if (cached) return new NextResponse(await cached.arrayBuffer(), { headers });
  } catch { /* not cached yet */ }
  const png = await buildFrontPage(runId, {
    paperName: run.paper_name, awarded: Number(run.total_awarded) || 0, max: Number(run.total_max) || 0, studentName: run.student_name,
  });
  if (!png) return NextResponse.json({ error: 'no cover' }, { status: 404 });
  try { await putStudentFile({ key, body: png, contentType: 'image/png' }); } catch (e) { console.warn('[marking-cover] cache skipped:', (e as Error).message); }
  return new NextResponse(new Uint8Array(png), { headers });
}
