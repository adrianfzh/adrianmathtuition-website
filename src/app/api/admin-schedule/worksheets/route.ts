import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// Revision worksheets Adrian plans for a student ahead of an exam — the
// "Worksheets" section of the /admin/schedule exam dialog. Backing store:
// Supabase (math project) table student_worksheets — RLS on, no policies,
// service-role only (same posture as admin_todos). Silent: no Telegram.
//
//   GET    ?studentId=recXXX            → { worksheets: [...] } (oldest first)
//   POST   { studentId, topic, examType? } → { worksheet }
//   PATCH  { id, given?, completed? }     → { ok }  (timestamps stamped/cleared)
//   DELETE { id }                         → { ok }

type Row = {
  id: string; student_id: string; exam_type: string | null; topic: string;
  given: boolean; completed: boolean; given_at: string | null; completed_at: string | null; created_at: string;
};

function shape(r: Row) {
  return { id: r.id, studentId: r.student_id, examType: r.exam_type, topic: r.topic, given: r.given, completed: r.completed,
    givenAt: r.given_at, completedAt: r.completed_at, createdAt: r.created_at };
}

const isRec = (s: unknown) => typeof s === 'string' && /^rec[A-Za-z0-9]{14}$/.test(s);

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = new URL(req.url).searchParams.get('studentId');
  if (!isRec(studentId)) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  try {
    const supa = createServiceClient();
    const { data, error } = await supa.from('student_worksheets').select('*')
      .eq('student_id', studentId).order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ worksheets: (data as Row[]).map(shape) });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message || 'Supabase error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { studentId, topic, examType } = await req.json().catch(() => ({}));
  const t = String(topic ?? '').trim().slice(0, 200);
  if (!isRec(studentId)) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  if (!t) return NextResponse.json({ error: 'topic required' }, { status: 400 });
  try {
    const supa = createServiceClient();
    const { data, error } = await supa.from('student_worksheets')
      .insert({ student_id: studentId, topic: t, exam_type: examType ? String(examType).slice(0, 20) : null })
      .select('*').single();
    if (error) throw error;
    return NextResponse.json({ worksheet: shape(data as Row) });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message || 'Supabase error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, given, completed } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const fields: Record<string, unknown> = {};
  const now = new Date().toISOString();
  if (typeof given === 'boolean') { fields.given = given; fields.given_at = given ? now : null; }
  if (typeof completed === 'boolean') { fields.completed = completed; fields.completed_at = completed ? now : null; }
  if (!Object.keys(fields).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  try {
    const supa = createServiceClient();
    const { error } = await supa.from('student_worksheets').update(fields).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message || 'Supabase error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const supa = createServiceClient();
    const { error } = await supa.from('student_worksheets').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message || 'Supabase error' }, { status: 500 });
  }
}
