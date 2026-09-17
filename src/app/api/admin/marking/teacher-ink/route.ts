// GET  /api/admin/marking/teacher-ink?run=<id>       → { pages }
// POST /api/admin/marking/teacher-ink {runId, pages}  → { ok }
//
// ✍️ Adrian's notes on a student's marked pages (18 Sep 2026 — "i would like to
// draw on it to show annotations to students physically … save to student's
// app"). A SECOND layer over the marked copy, stored in `student_ink` under the
// identity 'adrian' beside the student's own layer, shown to the student as
// "From Adrian" (they can hide it, never erase it). Nothing here touches the
// marking, the PDF, the marks or the student's own ink; no message is sent.
// Admin session or bearer only. Shape and limits: lib/student-ink.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateInkPages, inkIsEmpty, TEACHER_INK_IDENTITY } from '@/lib/student-ink';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const runId = req.nextUrl.searchParams.get('run') || '';
  if (!UUID.test(runId)) return NextResponse.json({ error: 'run required' }, { status: 400 });
  const { data } = await getSupabaseAdmin().from('student_ink').select('pages, updated_at').eq('run_id', runId).eq('identity', TEACHER_INK_IDENTITY).maybeSingle();
  return NextResponse.json({ pages: data?.pages ?? {}, updatedAt: data?.updated_at ?? null });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as { runId?: unknown; pages?: unknown }));
  const runId = typeof body.runId === 'string' ? body.runId : '';
  if (!UUID.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const v = validateInkPages(body.pages ?? {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: run } = await sb.from('paper_marking_runs').select('id').eq('id', runId).not('released_at', 'is', null).maybeSingle();
  if (!run) return NextResponse.json({ error: 'not a released paper' }, { status: 404 });
  if (inkIsEmpty(v.pages)) {
    const { error } = await sb.from('student_ink').delete().eq('run_id', runId).eq('identity', TEACHER_INK_IDENTITY);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, empty: true });
  }
  const { error } = await sb.from('student_ink')
    .upsert({ run_id: runId, identity: TEACHER_INK_IDENTITY, pages: v.pages, updated_at: new Date().toISOString() }, { onConflict: 'run_id,identity' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
