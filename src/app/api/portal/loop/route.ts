// POST /api/portal/loop — the learning loop (SPEC-LEARN-LOOP.md, 31 Oct 2026).
// Body: { topic: 'am-binomial', action: 'state' }
//    or { topic, action: 'next', subgroupId, exclude?: string[] }
// 'state' = the question types in teaching order with the student's progress.
// 'next'  = one question of that type the student has not answered before
//           (practice_next by sub-skill, excluding their loop answers and `exclude`).
// The answer goes through POST /api/portal/practice/grade with `loop: { topic, subgroupId }`.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth, practiceLevelAllowed, bankScope, rpcAudience } from '@/lib/practice';
import { portalIdentity } from '@/lib/portal-auth';
import { learnLoopOpenFor } from '@/lib/portal-beta';
import { loopTopic, LOOP_MISSES_BEFORE_HELP } from '@/lib/learn-loop';
import { loopState, studentLoopLevel } from '@/lib/learn-loop-store';
import { questionMarkdown, questionStructured, totalMarksOf, type BankQuestion } from '@/lib/bank-question-markdown';
import { studentRow } from '@/lib/part-syllabus';
import { gradableRow } from '@/lib/fix-one';
import { mcqKey } from '@/lib/science-levels';

export const runtime = 'nodejs';
export const maxDuration = 30;

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller || caller.kind !== 'student') return NextResponse.json({ error: 'Student session required' }, { status: 401 });
  const account = caller.account;
  if (!learnLoopOpenFor(portalIdentity(account))) return NextResponse.json({ error: 'Not available' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { topic?: unknown; action?: unknown; subgroupId?: unknown; exclude?: unknown };
  const topic = loopTopic(body.topic);
  if (!topic) return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });
  const level = studentLoopLevel(topic, account);
  if (!level || !(await practiceLevelAllowed(caller, level))) return NextResponse.json({ error: 'Not your level' }, { status: 403 });

  const progress = await loopState(topic, level, account);

  if (body.action === 'state') {
    return NextResponse.json({ level, types: progress, missesBeforeHelp: LOOP_MISSES_BEFORE_HELP });
  }
  if (body.action !== 'next') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  const sg = Number(body.subgroupId);
  const type = progress.find(p => p.id === sg);
  if (!type) return NextResponse.json({ error: 'Unknown question type' }, { status: 400 });

  const scope = bankScope(level);
  const skip = [
    ...type.seen,
    ...(Array.isArray(body.exclude) ? body.exclude.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 100) : []),
  ];
  const sb = getSupabaseAdmin();
  type Picked = BankQuestion & { id: string; total_marks: number | null; figure_url: string | null; has_solution: boolean };
  // A few draws at most: a row the grader cannot mark, or with too little left after
  // part-syllabus hiding, is skipped and drawn again.
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await sb.rpc('practice_next', {
      p_level: scope.level, p_qlevel: scope.qlevel, p_topic: topic.topic,
      p_exclude: skip, p_tier: null, p_subgroup: sg, ...rpcAudience(caller),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const raw = (data?.[0] ?? null) as Picked | null;
    if (!raw) return NextResponse.json({ question: null });
    const { data: meta } = await sb.from('questions').select('ai_generated, solution_source, verified, twin_of, answer').eq('id', raw.id).maybeSingle();
    const q = meta && gradableRow(meta) ? studentRow(raw) : null;
    if (!q) { skip.push(raw.id); continue; }
    const { stem, parts } = questionStructured(q);
    return NextResponse.json({
      question: {
        id: q.id, markdown: questionMarkdown(q), stem, parts,
        marks: q.total_marks ?? totalMarksOf(parts), figureUrl: q.figure_url ?? null,
        source: null, hasSolution: !!q.has_solution,
      },
      ...(mcqKey(meta?.answer ?? null) ? { mcq: ['A', 'B', 'C', 'D'] } : {}),
    });
  }
  return NextResponse.json({ question: null });
}
