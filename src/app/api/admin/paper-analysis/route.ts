// /api/admin/paper-analysis?runId= — the front page of a marked paper.
//
//   → { headline, themes[], worstQuestions[], papersRead }
//
// Where the marks went on THIS paper, and which themes the marker's notes fall
// into. Adrian, 1 Sep 2026: "an analysis in the front page to say where in a
// paper did the student lose most marks and the topics/questions they need to
// work on".
//
// ONE RUN ONLY. The first version read the student's last 12 papers so a habit
// could be told from a bad day; Adrian, 2 Sep 2026: "we should just analyze that
// particular exam paper, not across 5 papers". So this reads the run it is
// asked about and nothing else — `papersRead` is always 1 now and stays in the
// response only so the shape does not change.
//
// The ranking is keyword-driven rather than model-driven on purpose: this runs on
// every paper, it has to be explainable when Adrian disagrees with it, and a
// theme that cannot be traced to the sentences that produced it is not evidence.
// Each theme carries its examples for exactly that reason.
//
// …UNLESS the self-study sheet has been written for this paper. Its worker read
// the student's working and ranked what to teach; that diagnosis is written back
// onto the run (`result_json.diagnosis`, sheet-jobs `done`) and, when present,
// the themes here ARE the sheet's sections in the sheet's order — the same
// mapping the PDF cover uses (lib/sheet-diagnosis.ts). `source` says which.
// Adrian, 2 Sep 2026: "the sheet's diagnosis should drive the cover, not the
// cover the sheet."
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { analyse, worstQuestions, headline, type LostPart } from '@/lib/paper-analysis';
import { readDiagnosis, themesFromDiagnosis } from '@/lib/sheet-diagnosis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    .select('id, student_name, paper_name, created_at, total_awarded, total_max, result_json')
    .eq('id', runId).maybeSingle();
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });

  // Just this run. Whether the paper is tagged to a student, archived or brand
  // new makes no difference: the analysis is of the script, not the student.
  const rows = [run as { id: string; paper_name: string | null; created_at: string; result_json: unknown }];

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

  const diagnosis = readDiagnosis(run.result_json);
  const themes = diagnosis
    ? themesFromDiagnosis(diagnosis, run.paper_name || 'this paper')
    : analyse(parts, runId);
  return NextResponse.json({
    studentName: run.student_name,
    paperName: run.paper_name,
    awarded: run.total_awarded,
    max: run.total_max,
    papersRead: 1,
    source: diagnosis ? 'sheet' : 'marker',
    sheetJobId: diagnosis?.sheetJobId || null,
    diagnosedAt: diagnosis?.at || null,
    headline: headline(themes, Number(run.total_awarded) || 0, Number(run.total_max) || 0),
    themes,
    worstQuestions: worstQuestions(parts, runId),
  });
}
