// GET /api/tutor/paper-cover?paper=<tutor_papers.id> — the "where the marks went" cover
// (lib/front-page-build), drawn with the student's name for the tutor's eyes only and
// never cached in our store (the name must not be kept beside the marked data).
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { buildFrontPage } from '@/lib/front-page-build';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('paper') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'paper is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: p } = await sb.from('tutor_papers').select('run_id, paper_name, tutor_student_id').eq('id', id).eq('tutor_id', tutor.id).maybeSingle();
  if (!p?.run_id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const [{ data: run }, { data: s }] = await Promise.all([
    sb.from('paper_marking_runs').select('total_awarded, total_max').eq('id', p.run_id).maybeSingle(),
    sb.from('tutor_students').select('name').eq('id', p.tutor_student_id).eq('tutor_id', tutor.id).maybeSingle(),
  ]);
  if (!run || run.total_max == null) return NextResponse.json({ error: 'not marked yet' }, { status: 404 });
  const png = await buildFrontPage(p.run_id, {
    paperName: p.paper_name, awarded: Number(run.total_awarded) || 0, max: Number(run.total_max) || 0, studentName: s?.name ?? null,
  });
  if (!png) return NextResponse.json({ error: 'no cover' }, { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } });
}
