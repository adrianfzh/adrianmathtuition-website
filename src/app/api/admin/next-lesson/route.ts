// /api/admin/next-lesson — the Next lesson card (5 Oct 2026, the student
// profile's Overview + /admin/students/<id>/next). Admin only.
//
// GET ?student=recXXX
//   → { student, lesson, pack, plan, materials, lastLog }
//     lesson    = their next Scheduled lesson (Airtable)
//     pack      = the night-before row for that lesson, when the job made one
//     plan      = the pack's plan, or one worked out now (no items made)
//     materials = everything made for them (newest first)
//     lastLog   = the newest pack with an auto log (what the last lesson logged itself as)
// POST { student, action: 'prepare' }
//   → make the pack for the next lesson now (plan + PDFs), the same work the
//     night job does — for a lesson booked today, or after a change.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildPackFor, buildPlan, loadStudent, materialsFor, nextLessonFor, type PackRow } from '@/lib/next-lesson-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SID_RE = /^rec[A-Za-z0-9]{14}$/;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sid = req.nextUrl.searchParams.get('student') ?? '';
  if (!SID_RE.test(sid)) return NextResponse.json({ error: 'student is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const student = await loadStudent(sid);
  if (!student) return NextResponse.json({ error: 'no such student' }, { status: 404 });
  try {
    const lesson = await nextLessonFor(student).catch(() => null);
    const [{ data: packs }, materials] = await Promise.all([
      sb.from('lesson_packs').select('*').eq('airtable_student_id', sid).order('lesson_date', { ascending: false }).limit(12),
      materialsFor(sb, sid),
    ]);
    const rows = (packs ?? []) as PackRow[];
    const pack = lesson ? rows.find((p) => p.lesson_id === lesson.id) ?? null : null;
    const plan = pack?.plan ?? await buildPlan(sb, student, lesson);
    const lastLog = rows.find((p) => p.auto_log && p.log_written_at) ?? null;
    return NextResponse.json({ student, lesson, pack, plan, materials, lastLog });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { student?: string; action?: string };
  if (!SID_RE.test(body.student ?? '')) return NextResponse.json({ error: 'student is required' }, { status: 400 });
  if (body.action !== 'prepare') return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const student = await loadStudent(body.student!);
  if (!student) return NextResponse.json({ error: 'no such student' }, { status: 404 });
  const lesson = await nextLessonFor(student).catch(() => null);
  if (!lesson) return NextResponse.json({ error: 'no lesson booked in the next 45 days' }, { status: 409 });
  try {
    const { pack, items } = await buildPackFor(sb, student, lesson);
    return NextResponse.json({ ok: true, pack, made: items.length, failed: items.filter((i) => i.status !== 'ready').map((i) => ({ title: i.title, error: i.error })) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
