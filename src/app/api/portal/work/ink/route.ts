// GET  /api/portal/work/ink?assignment=<id>              → { pages, pageCount }
// POST /api/portal/work/ink {assignmentId, pages, pageCount} → { ok }
//
// ✍️ Doing an assigned sheet IN the app (17 Sep 2026, SPEC-STUDENT-FIRST §12
// use 2): the student's in-progress ink on the sheet's pages, saved as they
// go in `student_work_ink` (assignment × identity). Only while the sheet is
// still theirs to do ('assigned'); once handed in the draft is read-only.
// Same shape and caps as the marked-paper ink (lib/student-ink).
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getStudentAssignment } from '@/lib/portal-assignments';
import { validateInkPages, inkIsEmpty } from '@/lib/student-ink';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);
  const id = req.nextUrl.searchParams.get('assignment') || '';
  const a = await getStudentAssignment(id, sid);
  if (!a) return NextResponse.json({ error: 'Not your sheet' }, { status: 404 });
  const { data } = await getSupabaseAdmin().from('student_work_ink').select('pages, page_count, updated_at').eq('assignment_id', a.id).eq('identity', sid).maybeSingle();
  return NextResponse.json({ pages: data?.pages ?? {}, pageCount: data?.page_count ?? null, updatedAt: data?.updated_at ?? null });
}

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);
  const body = await req.json().catch(() => ({} as { assignmentId?: unknown; pages?: unknown; pageCount?: unknown }));
  const id = typeof body.assignmentId === 'string' ? body.assignmentId : '';
  const a = await getStudentAssignment(id, sid);
  if (!a) return NextResponse.json({ error: 'Not your sheet' }, { status: 404 });
  if (a.status !== 'assigned') return NextResponse.json({ error: 'This sheet has already been handed in.' }, { status: 409 });
  const v = validateInkPages(body.pages ?? {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const pageCount = Number.isInteger(body.pageCount) ? (body.pageCount as number) : null;
  const sb = getSupabaseAdmin();
  if (inkIsEmpty(v.pages)) {
    const { error } = await sb.from('student_work_ink').delete().eq('assignment_id', a.id).eq('identity', sid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, empty: true });
  }
  const { error } = await sb.from('student_work_ink')
    .upsert({ assignment_id: a.id, identity: sid, pages: v.pages, page_count: pageCount, updated_at: new Date().toISOString() }, { onConflict: 'assignment_id,identity' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
