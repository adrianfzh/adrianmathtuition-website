// GET /api/tutor/papers[?student=<id>] — a tutor's hand-ins, newest first, with the score
// and weak topics once marked. Opening the list also gives the waiting room a nudge
// (lib/tutor-store releaseWaitingTutorPapers), so a paper never depends on the cron alone.
import { NextResponse, after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import { STATE_WORDS, tutorPaperState, weakTopics } from '@/lib/tutor-portal';
import { releaseWaitingTutorPapers } from '@/lib/tutor-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PaperRow = { id: string; tutor_student_id: string; run_id: string | null; paper_name: string; paper_subject: string | null; pages: number; status: string; created_at: string };

export async function GET(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const student = new URL(req.url).searchParams.get('student');
  let q = sb.from('tutor_papers').select('id, tutor_student_id, run_id, paper_name, paper_subject, pages, status, created_at')
    .eq('tutor_id', tutor.id).order('created_at', { ascending: false }).limit(50);
  if (student) {
    if (!/^[0-9a-f-]{36}$/i.test(student)) return NextResponse.json({ error: 'bad student' }, { status: 400 });
    q = q.eq('tutor_student_id', student);
  }
  const { data } = await q;
  const papers = (data ?? []) as PaperRow[];
  const runIds = papers.map(p => p.run_id).filter(Boolean) as string[];
  const runs = new Map<string, MarkingRunRow>();
  if (runIds.length) {
    const { data: rr } = await sb.from('paper_marking_runs')
      .select('id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json')
      .in('id', runIds);
    for (const r of (rr ?? []) as MarkingRunRow[]) runs.set(r.id, r);
  }
  after(async () => { try { await releaseWaitingTutorPapers(sb); } catch (e) { console.warn('[tutor-papers] release check failed:', (e as Error).message); } });
  return NextResponse.json({
    papers: papers.map(p => {
      const run = p.run_id ? runs.get(p.run_id) : undefined;
      const marked = !!run && run.total_max != null && !!(run.annotated_pdf_url || run.photos_pdf_url || run.pdf_url);
      const state = tutorPaperState({ status: p.status, marked });
      let weak: { topic: string; lost: number }[] = [];
      if (marked && run) {
        const sp = buildStudentMarking([run]).papers[0];
        weak = sp ? weakTopics(sp.dropped) : [];
      }
      return {
        id: p.id, studentId: p.tutor_student_id, name: p.paper_name, subject: p.paper_subject, pages: p.pages,
        handedIn: p.created_at, state, stateWords: STATE_WORDS[state],
        awarded: marked ? Number(run!.total_awarded) || 0 : null, max: marked ? Number(run!.total_max) || 0 : null,
        weak,
      };
    }),
  });
}
