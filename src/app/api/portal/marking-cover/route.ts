// GET /api/portal/marking-cover?run=<id> — the paper's cover page as a PNG, for
// the logged-in student who owns the run, released runs only (the same gate as
// /api/portal/marking-pdf). Rendered once per release and cached in the run's
// private store (runs/<id>/cover-<release>.png); a paper with nothing lost has
// no cover and answers 404, which the page treats as "no cover to show".
import { NextRequest, NextResponse } from 'next/server';
import { currentStudent, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { downloadStudentFile, putStudentFile, runKey } from '@/lib/student-files';
import { buildFrontPage } from '@/lib/front-page-build';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Adrian's admin sign-in may fetch any released paper's cover (18 Sep 2026 —
  // the read-only paper view showed a broken image where the cover should be).
  const isAdmin = verifyAdminSession(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  const student = isAdmin ? null : await currentStudent();
  if (!isAdmin && !student) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const runId = req.nextUrl.searchParams.get('run') || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'run is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  let q = sb.from('paper_marking_runs')
    .select('id, paper_name, student_name, total_awarded, total_max, released_at, reissued_at:result_json->>reissued_at')
    .eq('id', runId).not('released_at', 'is', null);
  if (student) q = q.eq('student_id', portalIdentity(student.account));
  const { data: run } = await q.maybeSingle();
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // A re-issue after an override (8 Sep 2026) renders a fresh cover: the stamp
  // follows the latest of release and re-issue.
  const stampSrc = (run as { reissued_at?: string | null }).reissued_at || run.released_at;
  const stamp = String(stampSrc).replace(/[^0-9]/g, '').slice(0, 12);
  // "-subject": the look changed on 25 Sep 2026 (the subject frame — band + tag
  // in the paper's tone). A cover cached under the old name is rendered once
  // more, on its next view, so a student's list never mixes the two looks.
  // "-subject2": the maths tones changed later that day (A Math navy, E Math
  // amber, H2 plain) — the same rule, one more render on the next view.
  const key = runKey(runId, `cover-${stamp}-subject2.png`);
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
