// 🧑‍🏫 A tutor's shared boards (SPEC-TUTOR-TOOLS §8).
//   GET    ?student=<id>                     the student's boards, newest first
//   POST   { studentId, paperId?, templateId?, title? }   a new board — blank, on a marked paper's pages, or from one of the tutor's templates
//   PATCH  { id, action: 'new-link' | 'link-off' | 'link-on' | 'rename', title? }
// Every query is filtered by the tutor id from the signed cookie, never from the request.
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import { boardLink, newLinkKey } from '@/lib/board-store';
import { boardTitle, MAX_BOARD_PAGES, type BoardPage } from '@/lib/shared-board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const student = new URL(req.url).searchParams.get('student') || '';
  if (!UUID.test(student)) return NextResponse.json({ error: 'student is required' }, { status: 400 });
  const { data } = await getSupabaseAdmin().from('shared_boards')
    .select('id, title, source_paper_id, link_on, created_at, updated_at')
    .eq('tutor_id', tutor.id).eq('tutor_student_id', student)
    .order('updated_at', { ascending: false }).limit(50);
  return NextResponse.json({ boards: data ?? [] });
}

export async function POST(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { studentId?: string; paperId?: string; templateId?: string; title?: string };
  if (!body.studentId || !UUID.test(body.studentId)) return NextResponse.json({ error: 'student is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: s } = await sb.from('tutor_students').select('id').eq('id', body.studentId).eq('tutor_id', tutor.id).maybeSingle();
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let pages: BoardPage[] = [];
  let paperName: string | null = null;
  let paperId: string | null = null;
  let ink: Record<string, unknown> = {};
  let stickers: unknown[] = [];
  if (body.templateId) {
    if (!UUID.test(body.templateId)) return NextResponse.json({ error: 'bad template' }, { status: 400 });
    const { data: t } = await sb.from('board_templates').select('title, pages, ink, stickers').eq('id', body.templateId).eq('tutor_id', tutor.id).maybeSingle();
    if (!t) return NextResponse.json({ error: 'template not found' }, { status: 404 });
    pages = (t.pages ?? []) as BoardPage[]; ink = (t.ink ?? {}) as Record<string, unknown>; stickers = (t.stickers ?? []) as unknown[];
    paperName = t.title as string;
  }
  if (body.paperId && !body.templateId) {
    if (!UUID.test(body.paperId)) return NextResponse.json({ error: 'bad paper' }, { status: 400 });
    const { data: p } = await sb.from('tutor_papers').select('id, run_id, paper_name')
      .eq('id', body.paperId).eq('tutor_id', tutor.id).eq('tutor_student_id', body.studentId).maybeSingle();
    if (!p?.run_id) return NextResponse.json({ error: 'paper not found' }, { status: 404 });
    const { data: run } = await sb.from('paper_marking_runs')
      .select('id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json')
      .eq('id', p.run_id).maybeSingle();
    if (!run || (run as MarkingRunRow).total_max == null) return NextResponse.json({ error: 'That paper is not marked yet.' }, { status: 409 });
    const marked = buildStudentMarking([run as MarkingRunRow]).papers[0];
    pages = (marked?.pages ?? []).map(pg => ({ url: pg.url })).slice(0, MAX_BOARD_PAGES - 1);
    paperName = p.paper_name as string;
    paperId = p.id as string;
  }
  const { data, error } = await sb.from('shared_boards').insert({
    tutor_id: tutor.id, tutor_student_id: body.studentId, title: boardTitle(body.title, paperName),
    source_paper_id: paperId, pages, link_key: newLinkKey(), tutor_ink: ink, stickers,
  }).select('id').single();
  if (error || !data) { console.error('[tutor boards] create failed:', error?.message); return NextResponse.json({ error: 'Could not make the board — try again.' }, { status: 500 }); }
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: string; action?: string; title?: string };
  if (!body.id || !UUID.test(body.id)) return NextResponse.json({ error: 'board is required' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.action === 'new-link') { patch.link_key = newLinkKey(); patch.link_on = true; }
  else if (body.action === 'link-off') patch.link_on = false;
  else if (body.action === 'link-on') patch.link_on = true;
  else if (body.action === 'rename') patch.title = boardTitle(body.title, null);
  else return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  const { data } = await getSupabaseAdmin().from('shared_boards').update(patch)
    .eq('id', body.id).eq('tutor_id', tutor.id).select('link_key, link_on, title').maybeSingle();
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ link: boardLink(req, data.link_key as string), linkOn: data.link_on, title: data.title });
}
