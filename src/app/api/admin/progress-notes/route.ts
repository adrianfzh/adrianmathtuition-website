// /api/admin/progress-notes — the progress note on the student card (5 Oct 2026).
// Admin (cookie or Bearer ADMIN_PASSWORD — the Fly worker's MARKER_API_TOKEN).
//
// GET ?student=recXXX              → { notes } newest first (the card + its history)
// GET ?student=recXXX&facts=1      → { facts, factsText } — the computed facts, nothing stored (dry run)
// GET ?due=1[&limit=10]            → { due: [{ student, facts, factsText, items, lastNote }] }
//                                    who needs a note now (lib/progress-note noteDue), each with
//                                    the facts to write from and the card's ready-to-print items
// POST { student, note, model? }   → the worker's note. The facts are RECOMPUTED here (the
//                                    worker's are never trusted); a number in the prose that the
//                                    facts do not contain → 422 { strays } so the writer fixes it.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadStudent, materialsFor } from '@/lib/next-lesson-store';
import { dueStudents, loadNoteInputs } from '@/lib/progress-note-store';
import { buildProgressFacts, checkNoteNumbers, parseProgressNote, renderProgressFacts } from '@/lib/progress-note';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SID_RE = /^rec[A-Za-z0-9]{14}$/;

async function factsFor(sid: string) {
  const sb = getSupabaseAdmin();
  const student = await loadStudent(sid);
  if (!student) return null;
  const facts = buildProgressFacts(await loadNoteInputs(sb, student));
  return { student, facts, factsText: renderProgressFacts(facts) };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const sb = getSupabaseAdmin();
  try {
    if (sp.get('due') === '1') {
      const limit = Math.min(25, Math.max(1, Number(sp.get('limit')) || 10));
      const due = (await dueStudents(sb)).slice(0, limit);
      const out = [];
      for (const d of due) {
        const f = await factsFor(d.student.id);
        if (!f) continue;
        const items = (await materialsFor(sb, d.student.id, 15)).filter((m) => m.status === 'ready' && !m.printed_at)
          .map((m) => ({ id: m.id, title: m.title, label: m.label, kind: m.kind }));
        const { data: last } = await sb.from('student_progress_notes').select('written_at, note').eq('airtable_student_id', d.student.id).order('written_at', { ascending: false }).limit(1);
        out.push({ student: d.student, lessonSoon: d.lessonSoon, facts: f.facts, factsText: f.factsText, items, lastNote: last?.[0] ?? null });
      }
      return NextResponse.json({ due: out });
    }
    const sid = sp.get('student') ?? '';
    if (!SID_RE.test(sid)) return NextResponse.json({ error: 'student or due=1 is required' }, { status: 400 });
    if (sp.get('facts') === '1') {
      const f = await factsFor(sid);
      return f ? NextResponse.json(f) : NextResponse.json({ error: 'no such student' }, { status: 404 });
    }
    const { data } = await sb.from('student_progress_notes').select('id, written_at, period_from, period_to, facts_text, note, checks, model')
      .eq('airtable_student_id', sid).order('written_at', { ascending: false }).limit(20);
    return NextResponse.json({ notes: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { student?: string; note?: unknown; model?: string };
  if (!SID_RE.test(body.student ?? '')) return NextResponse.json({ error: 'student is required' }, { status: 400 });
  const note = parseProgressNote(body.note);
  if ('error' in note) return NextResponse.json({ error: note.error }, { status: 422 });
  const f = await factsFor(body.student!);
  if (!f) return NextResponse.json({ error: 'no such student' }, { status: 404 });
  const strays = checkNoteNumbers(note, f.factsText);
  if (strays.length) return NextResponse.json({ error: `numbers not in the facts: ${strays.join(', ')}`, strays, factsText: f.factsText }, { status: 422 });
  const { data, error } = await getSupabaseAdmin().from('student_progress_notes').insert({
    airtable_student_id: f.student.id, student_name: f.student.name,
    period_from: f.facts.from, period_to: f.facts.to, facts: f.facts, facts_text: f.factsText,
    note, checks: { numbers: 'ok' }, model: String(body.model ?? '').slice(0, 60) || null, source: 'fly',
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
