// POST /api/portal/marking/fix-one — "Fix one" on the marked-paper screen
// (SPEC-STUDENT-FIRST.md §Fix one, 22 Oct 2026).
// Body: { runId, next?: boolean }
// The one practice question for the question that lost the most marks on this
// paper: a question from the same sub-skill the student has not attempted (short
// ones first), else a twin of the failed question. The pick is kept on the run
// (paper_marking_runs.fix_one), so a reload shows the same question; `next` adds
// another, up to FIX_ONE_MAX, once the current one is answered.
// The answer goes through POST /api/portal/practice/grade with `fix: { runId }`.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth, bankScope, rpcAudience, accountIpContent } from '@/lib/practice';
import { portalIdentity } from '@/lib/portal-auth';
import { fixOneOpenFor } from '@/lib/portal-beta';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import { bankQuestionsForRun } from '@/lib/question-clip-store';
import { FIX_ONE_MAX, fixTarget, rankFixCandidates, readFixCache, type FixCandidate, type FixPick } from '@/lib/fix-one';
import { questionMarkdown, questionStructured, totalMarksOf, type BankQuestion } from '@/lib/bank-question-markdown';
import { studentRow } from '@/lib/part-syllabus';
import { qbLevelsFor } from '@/lib/qb-levels';
import { practiceQLevels } from '@/lib/serve-gate';
import { mcqKey } from '@/lib/science-levels';

export const runtime = 'nodejs';
export const maxDuration = 30;

const RUN_COLUMNS = 'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, student_label, student_starred_at, student_archived_at, student_note, paper_subject, superseded_by, subject, student_id, fix_one';
const ROW_COLUMNS = 'id, level, school, national, deleted_at, ai_generated, verified, flagged_count, legacy_syllabus, ip_syllabus, parts, total_marks, answer, solution, solution_source, twin_of, question_text, has_image, image_url, images, figure_url, difficulty';
const UUID = /^[0-9a-f-]{36}$/i;

type BankRow = FixCandidate & BankQuestion & { figure_url?: string | null };

function payload(q: BankRow, n: number, answered: { correct: boolean } | null) {
  const view = studentRow(q) ?? q;
  const { stem, parts } = questionStructured(view);
  const marks = view.total_marks != null ? Number(view.total_marks) : totalMarksOf(parts);
  return {
    question: {
      id: q.id,
      markdown: questionMarkdown(view),
      stem,
      parts,
      marks,
      figureUrl: q.figure_url ?? null,
      source: null,
      hasSolution: !!(q.solution && q.solution.trim()),
    },
    questionId: q.id,
    ...(mcqKey(q.answer) ? { mcq: ['A', 'B', 'C', 'D'] } : {}),
    marks,
    n,
    max: FIX_ONE_MAX,
    answered,
  };
}

export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller || caller.kind !== 'student') return NextResponse.json({ error: 'Student session required' }, { status: 401 });
  const account = caller.account;
  const identity = portalIdentity(account);
  if (!fixOneOpenFor(identity)) return NextResponse.json({ question: null });

  const body = (await req.json().catch(() => ({}))) as { runId?: unknown; next?: unknown };
  const runId = typeof body.runId === 'string' && UUID.test(body.runId) ? body.runId : null;
  if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: run } = await sb.from('paper_marking_runs').select(RUN_COLUMNS)
    .eq('id', runId).eq('student_id', identity).not('released_at', 'is', null).maybeSingle();
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const r = run as unknown as MarkingRunRow & { subject?: string | null; superseded_by?: string | null; fix_one?: unknown; result_json?: unknown };
  if (String(r.subject ?? 'math') !== 'math' || r.superseded_by) return NextResponse.json({ question: null });
  const paper = buildStudentMarking([r], {}).papers[0];
  if (!paper || paper.tutorMarked || !paper.dropped.length) return NextResponse.json({ question: null });

  const cache = readFixCache(r.fix_one);
  const last = cache.picks[cache.picks.length - 1] ?? null;

  // Has the student answered a pick? (their portal-fix attempts on this run)
  const answeredOf = async (ids: string[]) => {
    if (!ids.length) return new Map<string, boolean>();
    const { data } = await sb.from('student_attempts').select('question_id, marking_verdict, marking_json')
      .eq('user_id', account.id).eq('attempted_via', 'portal-fix').in('question_id', ids);
    const m = new Map<string, boolean>();
    for (const a of data ?? []) {
      if ((a.marking_json as { fix?: { runId?: string } } | null)?.fix?.runId !== runId) continue;
      m.set(a.question_id as string, a.marking_verdict === 'correct');
    }
    return m;
  };

  const serve = async (pick: FixPick, n: number) => {
    const { data } = await sb.from('questions').select(ROW_COLUMNS).eq('id', pick.id).maybeSingle();
    if (!data) return NextResponse.json({ question: null });
    const answered = await answeredOf([pick.id]);
    return NextResponse.json(payload({ ...(data as BankRow), from: pick.from }, n, answered.has(pick.id) ? { correct: answered.get(pick.id)! } : null));
  };

  const wantNext = body.next === true;
  if (last && (!wantNext || cache.picks.length >= FIX_ONE_MAX)) return serve(last, cache.picks.length);
  if (last && wantNext) {
    // Another one only once the one on screen is answered.
    const answered = await answeredOf([last.id]);
    if (!answered.has(last.id)) return serve(last, cache.picks.length);
  }

  // ── A new pick ───────────────────────────────────────────────────────────
  const top = paper.dropped[0].questionNumber;
  const bankIds = await bankQuestionsForRun(r.result_json, [top]).catch(() => ({} as Record<string, string>));
  const target = fixTarget(paper.dropped, (r.result_json as { revise?: unknown } | null)?.revise, bankIds);
  if (!target || (!target.subgroupId && !target.bankId)) return NextResponse.json({ question: null });

  const audience = rpcAudience(caller);
  const skillIds: string[] = [];
  let inPool = new Set<string>();
  if (target.subgroupId && target.level && target.topic) {
    const { data: qs } = await sb.from('question_subgroups').select('question_id').eq('subgroup_id', target.subgroupId).limit(500);
    skillIds.push(...(qs ?? []).map((x) => x.question_id as string));
    if (skillIds.length) {
      // practice_pool = what the Practice tab would serve this student on the topic
      // (sub-skill audience, school rows on/off) — a filed row outside it is not shown.
      const { data: pool } = await sb.rpc('practice_pool', { p_level: bankScope(target.level).level, p_topic: target.topic, ...audience })
        .in('question_id', skillIds.slice(0, 300));
      inPool = new Set(((pool ?? []) as { question_id: string }[]).map((p) => p.question_id));
    }
  }
  const twinIds: string[] = [];
  if (target.bankId) {
    const { data: tw } = await sb.from('questions').select('id').eq('twin_of', target.bankId).is('deleted_at', null).limit(50);
    twinIds.push(...(tw ?? []).map((x) => x.id as string));
  }
  const ids = [...new Set([...skillIds.slice(0, 300), ...twinIds])];
  if (!ids.length) return NextResponse.json({ question: null });

  const [{ data: rows }, { data: flags }, { data: tried }] = await Promise.all([
    sb.from('questions').select(ROW_COLUMNS).in('id', ids),
    sb.from('figure_flags').select('question_id').eq('status', 'open').in('question_id', ids),
    sb.from('student_attempts').select('question_id').eq('user_id', account.id).in('question_id', ids),
  ]);
  const flagged = new Set((flags ?? []).map((f) => f.question_id as string));
  const twinSet = new Set(twinIds);
  const candidates: BankRow[] = ((rows ?? []) as BankRow[]).map((q) => {
    const from: 'skill' | 'twin' = inPool.has(q.id) ? 'skill' : twinSet.has(q.id) ? 'twin' : 'skill';
    return { ...q, from, figureFlagged: flagged.has(q.id), outOfPool: from === 'skill' && !inPool.has(q.id) };
  });

  const keys = qbLevelsFor(account.level ?? null, account.subjects ?? null).map((l) => bankScope(l.key));
  const allowed = [...new Set(keys.flatMap((s) => [...practiceQLevels(s.level), ...(s.qlevel ? [s.qlevel] : [])]))];
  const ranked = rankFixCandidates(candidates, {
    attempted: new Set((tried ?? []).map((t) => t.question_id as string)),
    shown: new Set(cache.picks.map((p) => p.id)),
    failedId: target.bankId,
    gate: { allowedQLevels: allowed, isIp: !!account.is_ip, ipContent: accountIpContent(account), assigned: false },
    seed: runId,
  });
  const best = ranked[0] as BankRow | undefined;
  if (!best) return last ? serve(last, cache.picks.length) : NextResponse.json({ question: null });

  const pick: FixPick = { id: best.id, q: top, from: best.from, at: new Date().toISOString() };
  const { error } = await sb.from('paper_marking_runs').update({ fix_one: { picks: [...cache.picks, pick] } }).eq('id', runId);
  if (error) console.error('[fix-one] cache write failed:', error.message);
  return NextResponse.json(payload(best, cache.picks.length + 1, null));
}
