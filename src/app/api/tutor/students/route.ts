// 🧑‍🏫 A tutor's own students. Names stay in tutor_students and are read only here, by the
// tutor who added them (every query is filtered by the session's tutor id).
//   GET  → { tutor, usage, students: [{ id, name, level, papers }] }
//   POST { name, level? } → { student }
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { capState, cleanName, sgtMonthKey } from '@/lib/tutor-portal';
import { papersUsedThisMonth } from '@/lib/tutor-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_STUDENTS = 200;

export async function GET() {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const [{ data: students }, { data: papers }, used] = await Promise.all([
    sb.from('tutor_students').select('id, name, level, created_at').eq('tutor_id', tutor.id).is('archived_at', null).order('name'),
    sb.from('tutor_papers').select('tutor_student_id').eq('tutor_id', tutor.id),
    papersUsedThisMonth(sb, tutor.id, sgtMonthKey()),
  ]);
  const count = new Map<string, number>();
  for (const p of (papers ?? []) as { tutor_student_id: string }[]) count.set(p.tutor_student_id, (count.get(p.tutor_student_id) ?? 0) + 1);
  return NextResponse.json({
    tutor: { name: tutor.display_name, email: tutor.email },
    usage: capState(used, tutor.monthly_paper_cap),
    students: ((students ?? []) as { id: string; name: string; level: string | null }[]).map(s => ({ ...s, papers: count.get(s.id) ?? 0 })),
  });
}

export async function POST(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { name?: unknown; level?: unknown };
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: 'Type the student’s name.' }, { status: 400 });
  const level = cleanName(body.level, 30);
  const sb = getSupabaseAdmin();
  const { count } = await sb.from('tutor_students').select('id', { count: 'exact', head: true }).eq('tutor_id', tutor.id).is('archived_at', null);
  if ((count ?? 0) >= MAX_STUDENTS) return NextResponse.json({ error: `${MAX_STUDENTS} students at most.` }, { status: 400 });
  const { data, error } = await sb.from('tutor_students').insert({ tutor_id: tutor.id, name, level }).select('id, name, level').single();
  if (error || !data) return NextResponse.json({ error: 'Could not add — try again.' }, { status: 500 });
  return NextResponse.json({ student: { ...data, papers: 0 } });
}
