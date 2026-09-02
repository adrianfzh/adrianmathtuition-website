// POST /api/portal/practice/timed-set — build a timed set, or log its finish.
//
// Build:  { level?, topics?: string[], tier?: 'Standard'|'Advanced', count?: 3|5 }
//   → { setId, level, tier, mixed, topics, count, totalMarks, timeLimitSec, questions[] }
//   Questions come from the SAME `practice_next` RPC the picker uses (one call
//   per slot with a growing exclude list), so a timed set can never surface a
//   question the ordinary flow would refuse — deleted / flag-buried /
//   unverified-AI / figure-flagged rows stay out, and no solution or
//   originating school leaves the server. `topics` empty = mixed across every
//   topic of the level (an exam's tested-topics list arrives prefilled from the
//   Home countdown card). The time limit is exam pace (lib/timed-set).
//
// Finish: { action: 'finish', blank, … }
//   → telemetry only: `timed:finish` + one `timed:blank` per blank question
//   into portal_event_log (bounded kinds — the ask-log/lesson-event pattern;
//   the table has no payload column, so only `blank` is used — the client's
//   setId/elapsed fields are accepted and ignored). The grades themselves went
//   through /api/portal/practice/grade with the `timed` tag, which is where
//   pace lands (duration_seconds + marking_json.timed); blank questions never
//   hit the grader.
//
// Auth: portal student session (level-gated) OR admin Bearer (testing —
// admin can build a set, only students can grade one). Anonymous POST must
// 401 — probed by /api/health-check.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createServiceClient } from '@/lib/supabase-server';
import { questionMarkdown, questionStructured, totalMarksOf, type BankQuestion } from '@/lib/bank-question-markdown';
import { practiceAuth, practiceLevelAllowed, practiceLevelsFor, bankScope, rpcAudience, type PracticeCaller } from '@/lib/practice';
import { isScienceLevel, scienceSubjectOf } from '@/lib/science-levels';
import { scienceNext, scienceTopicCounts, toPayload } from '@/lib/science-bank';
import { portalIdentity } from '@/lib/portal-auth';
import { examPrepVisible } from '@/lib/portal-beta';
import { DAILY_GRADE_CAP } from '@/lib/practice-grade';
import {
  MAX_TOPICS_PER_SET, TIMED_SET_COUNTS, marksForTiming, normaliseCount, planSlots, timeLimitSeconds,
} from '@/lib/timed-set';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_COUNT = Math.max(...TIMED_SET_COUNTS);

/** One row of the `practice_next` RPC (the columns the picker route reads). */
type PracticeNextRow = BankQuestion & {
  id: string;
  total_marks: number | null;
  figure_url: string | null;
  has_solution: boolean;
};

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === 'finish') return finish(caller, body);
  return build(caller, body);
}

async function build(caller: NonNullable<PracticeCaller>, body: Record<string, unknown>) {
  // In prod but not student-facing yet (EXAM_PREP_OPEN_TO_STUDENTS, lib/portal-beta):
  // the page already bounces students, and the builder refuses them too so a
  // hand-crafted POST can't spend the grader budget through the back door.
  // Adrian's admin cookie (on his test-student login) passes; admin Bearer is
  // testing and passes by construction.
  if (caller.kind === 'student' && !(await examPrepVisible())) {
    return NextResponse.json({ error: 'Timed sets aren’t open yet' }, { status: 403 });
  }
  const levels = caller.kind === 'student' ? await practiceLevelsFor(caller) : null;
  const level = typeof body.level === 'string' && body.level ? body.level : levels?.[0]?.key;
  if (!level) return NextResponse.json({ error: 'level required' }, { status: 400 });
  if (!(await practiceLevelAllowed(caller, level))) return NextResponse.json({ error: 'Level not available' }, { status: 403 });
  const tier = body.tier === 'Advanced' || body.tier === 'Standard' ? body.tier : null;
  const count = normaliseCount(body.count);
  const scope = bankScope(level);
  const sb = getSupabaseAdmin();
  // Sub-group audience: an exam's tested-topics list may name a topic this
  // student cannot practise (e.g. Modulus for a non-IP A-Math student) — the
  // RPCs then simply return no question for it and the slot borrows a sibling.
  const audience = rpcAudience(caller);

  // Daily grading cap, checked up front: a set that starts with fewer marked
  // attempts left than questions would end half-unmarked (the grade route's
  // own check is per question). Same 24-hour window as grade/route.ts.
  if (caller.kind === 'student') {
    const dayStart = new Date(); dayStart.setUTCHours(dayStart.getUTCHours() - 24);
    const { count: used } = await createServiceClient()
      .from('student_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', caller.account.id)
      .eq('attempted_via', 'portal')
      .gte('attempted_at', dayStart.toISOString());
    const left = DAILY_GRADE_CAP - (used || 0);
    if (left < count) {
      return NextResponse.json({
        error: left <= 0
          ? `Daily limit reached (${DAILY_GRADE_CAP} marked attempts). Back tomorrow!`
          : `Only ${left} marked attempt${left === 1 ? '' : 's'} left today — ${left >= 3 ? 'pick the 3-question set' : 'practise one question at a time'} or come back tomorrow.`,
      }, { status: 429 });
    }
  }

  let topics = Array.isArray(body.topics)
    ? (body.topics as unknown[]).filter((t): t is string => typeof t === 'string' && !!t.trim()).map(t => t.trim()).slice(0, MAX_TOPICS_PER_SET)
    : [];
  const mixed = topics.length === 0;
  const science = isScienceLevel(level);
  if (mixed) {
    if (science) {
      try { topics = (await scienceTopicCounts(level)).map(t => t.topic); }
      catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
    } else {
      const { data, error } = await sb.rpc('practice_topics', { p_level: scope.level, p_qlevel: scope.qlevel, ...audience });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      topics = ((data || []) as { topic: string }[]).map(r => r.topic).filter(Boolean);
    }
  }
  if (!topics.length) return NextResponse.json({ error: 'No questions available for that level yet' }, { status: 409 });

  // Science levels: same slot plan, the science bank's picker per slot.
  if (science) {
    const planS = planSlots(topics, count);
    const pickedS: string[] = [];
    const qs: ReturnType<typeof toPayload>[] = [];
    for (const slotTopic of planS) {
      const order = [slotTopic, ...topics.filter(t => t !== slotTopic)];
      let row = null;
      for (const t of order) {
        try { row = await scienceNext({ levelKey: level, topic: t, exclude: pickedS, tier }); }
        catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
        if (row) break;
      }
      if (!row) break;
      pickedS.push(row.id);
      qs.push(toPayload(row));
    }
    if (!qs.length) return NextResponse.json({ error: 'No questions left for those topics at that tier — widen the topics or switch tier' }, { status: 409 });
    const totalMarksS = qs.reduce((a, q) => a + marksForTiming(q.marks), 0);
    await logEvents(caller, ['timed:start']);
    return NextResponse.json({
      setId: randomUUID(), level, tier, mixed, topics: mixed ? [] : topics, count: qs.length,
      subject: scienceSubjectOf(level), totalMarks: totalMarksS, timeLimitSec: timeLimitSeconds(level, totalMarksS), questions: qs,
    });
  }

  const plan = planSlots(topics, count);
  const pickedIds: string[] = [];
  const questions: Array<{
    id: string; markdown: string; stem: string; parts: unknown; marks: number | null;
    figureUrl: string | null; source: null; hasSolution: boolean; topic: string;
  }> = [];
  for (const slotTopic of plan) {
    // The planned topic first, then the rest of the rotation — an exhausted
    // topic (all its questions already drawn, or none at this tier) borrows a
    // slot from a sibling instead of shortening the set.
    const order = [slotTopic, ...topics.filter(t => t !== slotTopic)];
    let found: { q: PracticeNextRow; topic: string } | null = null;
    for (const t of order) {
      const { data, error } = await sb.rpc('practice_next', {
        p_level: scope.level,
        p_qlevel: scope.qlevel,
        p_topic: t,
        p_exclude: pickedIds,
        p_tier: tier,
        p_subgroup: null,
        ...audience,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const q = (data?.[0] ?? null) as PracticeNextRow | null;
      if (q) { found = { q, topic: t }; break; }
    }
    if (!found) break;
    pickedIds.push(found.q.id);
    const { stem, parts } = questionStructured(found.q);
    questions.push({
      id: found.q.id,
      markdown: questionMarkdown(found.q),
      stem,
      parts,
      marks: found.q.total_marks ?? totalMarksOf(parts),
      figureUrl: found.q.figure_url ?? null,
      source: null,
      hasSolution: !!found.q.has_solution,
      topic: found.topic,
    });
  }
  if (!questions.length) {
    return NextResponse.json({ error: 'No questions left for those topics at that tier — widen the topics or switch tier' }, { status: 409 });
  }

  const totalMarks = questions.reduce((a, q) => a + marksForTiming(q.marks), 0);
  const timeLimitSec = timeLimitSeconds(level, totalMarks);
  const setId = randomUUID();
  await logEvents(caller, ['timed:start']);
  return NextResponse.json({
    setId, level, tier, mixed, topics: mixed ? [] : topics, count: questions.length,
    totalMarks, timeLimitSec, questions,
  });
}

async function finish(caller: NonNullable<PracticeCaller>, body: Record<string, unknown>) {
  const blank = clampInt(body.blank, 0, MAX_COUNT);
  const kinds = ['timed:finish', ...Array.from({ length: blank }, () => 'timed:blank')];
  await logEvents(caller, kinds);
  return NextResponse.json({ ok: true });
}

// Fail-soft telemetry: a logging hiccup must never stop a set being built or
// finished. Admin (testing) writes nothing — there is no student identity.
async function logEvents(caller: NonNullable<PracticeCaller>, kinds: string[]) {
  if (caller.kind !== 'student' || !kinds.length) return;
  const identity = portalIdentity(caller.account);
  try {
    await createServiceClient().from('portal_event_log').insert(kinds.map(kind => ({ identity, kind })));
  } catch (e) {
    console.error('[timed-set] event log write failed:', (e as Error).message);
  }
}
