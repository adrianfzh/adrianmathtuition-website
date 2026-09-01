// /api/admin/paper-analysis?runId= — the front page of a marked paper.
//
//   → { headline, themes[], worstQuestions[], papersRead }
//
// Where the marks went on THIS paper, and — the part that needs every paper —
// which of it is a habit rather than a bad day. Adrian, 1 Sep 2026: "an analysis
// in the front page to say where in a paper did the student lose most marks and
// the topics/questions they need to work on".
//
// It reads every marked paper the student has, because a single script cannot
// tell those apart: on Eva's newest paper she left nothing blank, while the four
// before it gave away 37 marks that way. And it lets the newest paper VETO,
// because her blanks then ran to zero — summed they looked like her biggest
// problem, in date order like one she had solved.
//
// The ranking is keyword-driven rather than model-driven on purpose: this runs on
// every paper, it has to be explainable when Adrian disagrees with it, and a
// theme that cannot be traced to the sentences that produced it is not evidence.
// Each theme carries its examples for exactly that reason.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { analyse, worstQuestions, headline, type LostPart } from '@/lib/paper-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How far back a habit is still evidence. Older than this and the student has
 *  usually been taught since, so it says more about the past than the present. */
const LOOKBACK_DAYS = 120;
const MAX_PAPERS = 12;

type ResultJson = {
  results?: { question_number?: string; marking_output?: {
    marks?: { awarded?: number; max?: number };
    parts?: { label?: string; awarded?: number; max?: number; not_attempted?: boolean; error_summary?: string }[];
  } }[];
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const runId = req.nextUrl.searchParams.get('runId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: run } = await sb
    .from('paper_marking_runs')
    .select('id, student_id, student_name, paper_name, total_awarded, total_max')
    .eq('id', runId).maybeSingle();
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });

  // Every marked paper this student has. Untagged papers have no history to read,
  // so they analyse from themselves alone — which is honest, not a failure.
  let rows: { id: string; paper_name: string | null; created_at: string; result_json: unknown }[] = [];
  if (run.student_id) {
    const { data } = await sb
      .from('paper_marking_runs')
      .select('id, paper_name, created_at, result_json')
      .eq('student_id', run.student_id)
      // ARCHIVED PAPERS COUNT. Archive means Adrian dealt with that script
      // outside the system — marked it by hand, handed it back in class. It says
      // nothing about the marking's quality, and a paper she sat and lost marks
      // on is evidence whether or not it went through triage. Filtering them out
      // read only 2 of Eva's 5 papers on the first live run, which is the same
      // blind spot this whole analysis exists to close.
      .gte('created_at', new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(MAX_PAPERS);
    rows = (data ?? []) as typeof rows;
  }
  if (!rows.some(r => r.id === runId)) {
    const { data } = await sb.from('paper_marking_runs')
      .select('id, paper_name, created_at, result_json').eq('id', runId).limit(1);
    rows = [...(data ?? []) as typeof rows, ...rows];
  }

  const parts: LostPart[] = [];
  for (const r of rows) {
    const rj = (r.result_json || {}) as ResultJson;
    if (!Array.isArray(rj.results)) continue;
    for (const res of rj.results) {
      for (const p of (res.marking_output?.parts ?? [])) {
        const max = Number(p.max), aw = Number(p.awarded);
        if (!Number.isFinite(max) || !Number.isFinite(aw) || aw >= max) continue;
        parts.push({
          paperId: r.id,
          paperName: r.paper_name || 'a paper',
          createdAt: r.created_at,
          question: String(res.question_number ?? '?'),
          label: String(p.label ?? ''),
          lost: max - aw,
          max,
          blank: p.not_attempted === true,
          why: String(p.error_summary ?? ''),
        });
      }
    }
  }

  const themes = analyse(parts, runId);
  return NextResponse.json({
    studentName: run.student_name,
    paperName: run.paper_name,
    awarded: run.total_awarded,
    max: run.total_max,
    papersRead: rows.length,
    headline: headline(themes, Number(run.total_awarded) || 0, Number(run.total_max) || 0),
    themes,
    worstQuestions: worstQuestions(parts, runId),
  });
}
