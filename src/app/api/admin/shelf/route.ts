// /api/admin/shelf — 🧺 the student shelf: topics deliberately deferred from a
// wave, each carrying the evidence needed to decide later without archaeology
// (SPEC-TEACHING-CYCLE step 4).
//
//   GET ?studentId=recXXX        → { shelf } (waiting first, newest first)
//   GET                          → { shelf } across all students (60)
//   POST { studentId, topic, … } → { item }   shelve one topic
//   PATCH { id, status|note }    → { item }   started / done / dropped
//   DELETE ?id=                  → { ok }
//
// Admin-only, service-role: the shelf is Adrian's planning surface and is never
// visible to a student.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['waiting', 'started', 'done', 'dropped'];

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get('studentId');
  const sb = getSupabaseAdmin();
  let q = sb.from('student_shelf').select('*').order('created_at', { ascending: false }).limit(studentId ? 100 : 60);
  if (studentId) q = q.eq('airtable_student_id', studentId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Waiting first — the shelf is a to-decide list, not a history.
  const order: Record<string, number> = { waiting: 0, started: 1, done: 2, dropped: 3 };
  const shelf = (data ?? []).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return NextResponse.json({ shelf });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const studentId = String(body.studentId ?? '').trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(studentId)) return NextResponse.json({ error: 'studentId must be an Airtable record id' }, { status: 400 });
  const topic = String(body.topic ?? '').trim().slice(0, 120);
  if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 });

  const evidence = Array.isArray(body.evidence)
    ? (body.evidence as Array<Record<string, unknown>>).slice(0, 12).map(e => ({
        q: String(e?.q ?? '').slice(0, 20),
        prompt: String(e?.prompt ?? '').slice(0, 600),
        awarded: Number(e?.awarded) || 0,
        max: Number(e?.max) || 0,
        error: String(e?.error ?? '').slice(0, 400),
        annotated_url: String(e?.annotated_url ?? '').slice(0, 500),
      }))
    : [];

  const { data, error } = await getSupabaseAdmin().from('student_shelf').insert({
    airtable_student_id: studentId,
    student_name: String(body.studentName ?? '').slice(0, 120),
    topic,
    skill: String(body.skill ?? '').slice(0, 200),
    source_run_id: /^[0-9a-f-]{36}$/i.test(String(body.sourceRunId ?? '')) ? String(body.sourceRunId) : null,
    paper_name: String(body.paperName ?? '').slice(0, 160),
    marks_lost: Number.isFinite(Number(body.marksLost)) ? Math.round(Number(body.marksLost)) : null,
    evidence,
    note: body.note ? String(body.note).slice(0, 600) : null,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { id?: string; status?: string; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join('/')}` }, { status: 400 });
    patch.status = body.status;
    patch.done_at = body.status === 'done' || body.status === 'dropped' ? new Date().toISOString() : null;
  }
  if (typeof body.note === 'string') patch.note = body.note.slice(0, 600);

  const { data, error } = await getSupabaseAdmin().from('student_shelf').update(patch).eq('id', body.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await getSupabaseAdmin().from('student_shelf').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
