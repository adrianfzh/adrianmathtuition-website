// POST /api/portal/learn/explain — "explain it back" judge.
//
// After an example/core unit the student writes one sentence on when/why the
// idea is used. We judge it ONLY against that unit's own payload content (never
// outside knowledge) and return a warm, Adrian-style verdict. Records an
// explain_pass/explain_fail event.
//
// Auth: portal student session OR admin Bearer (Adrian testing — no rate limit).
// Rate limit: 20 judged sentences/day per student, counted on unit_events
// explain_* rows in the last 24h.
import { NextRequest, NextResponse } from 'next/server';
import { judgeExplanation, explainSystem, EXPLAIN_MAX_ANSWER, type ExplainVerdict } from '@/lib/explain-judge';
import { practiceAuth } from '@/lib/practice';
import { learnClosedResponse } from '@/lib/learn-gate';
import { getSupabaseAdmin } from '@/lib/supabase';
import { learnSubjectsForLevel } from '@/lib/learn';
import { getFixtureUnit, isFixtureId } from '@/lib/learn-fixture';
import type { UnitPayload } from '@/lib/learn-types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DAILY_CAP = 20;
const MAX_ANSWER = EXPLAIN_MAX_ANSWER;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Verdict = ExplainVerdict;

// Flatten a unit payload into the plain text the judge is allowed to use.
function payloadText(kind: string, payload: UnitPayload): string {
  const p = payload as unknown as Record<string, unknown>;
  const parts: string[] = [];
  const add = (v: unknown) => { if (typeof v === 'string' && v.trim()) parts.push(v.trim()); };
  add(p.summary_md); add(p.formula_md); add(p.remember_md);
  add(p.problem_md); add(p.answer_md); add(p.note_md); add(p.why_md); add(p.fix_md);
  if (Array.isArray(p.steps)) for (const s of p.steps as Record<string, unknown>[]) { add(s.label); add(s.math); add(s.annotation_md); }
  if (Array.isArray(p.working)) for (const w of p.working) add(w);
  return parts.join('\n').slice(0, 4000);
}

export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const closed = await learnClosedResponse(caller);
  if (closed) return closed; // Learn not released to students yet

  const body = await req.json().catch(() => ({}));
  const unitId = String(body?.unitId || '');
  const answer = String(body?.answer || '').slice(0, MAX_ANSWER).trim();
  if (!unitId) return NextResponse.json({ error: 'unitId required' }, { status: 400 });
  if (!answer) return NextResponse.json({ error: 'answer required' }, { status: 400 });

  const isStudent = caller.kind === 'student';
  const supabase = getSupabaseAdmin();

  // Rate limit (students only).
  if (isStudent) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('unit_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', caller.account.id)
      .in('event', ['explain_pass', 'explain_fail'])
      .gte('created_at', dayAgo);
    if ((count || 0) >= DAILY_CAP) {
      return NextResponse.json(
        { error: `Daily limit reached (${DAILY_CAP}). Back tomorrow!` },
        { status: 429 },
      );
    }
  }

  // Load the unit payload (fixture or DB), applying the same visibility rules
  // as the /unit route for students.
  let kind = '', topic = '', subject = '', payload: UnitPayload | null = null;
  if (isFixtureId(unitId)) {
    const fx = getFixtureUnit(unitId);
    if (!fx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    kind = fx.unit.kind; topic = fx.unit.topic; subject = fx.unit.subject; payload = fx.unit.payload;
  } else {
    if (!UUID.test(unitId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: unit } = await supabase
      .from('learning_units')
      .select('kind, topic, subject, status, payload')
      .eq('id', unitId)
      .single();
    if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (isStudent) {
      if (unit.status !== 'approved') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (!learnSubjectsForLevel(caller.account.level).includes(unit.subject)) {
        return NextResponse.json({ error: 'Not available' }, { status: 403 });
      }
    }
    kind = unit.kind; topic = unit.topic; subject = unit.subject; payload = unit.payload as UnitPayload;
  }

  const notes = payloadText(kind, payload);

  let verdict: Verdict;
  let feedback: string;
  try {
    ({ verdict, feedback } = await judgeExplanation(
      explainSystem('finished a lesson unit on', topic, notes),
      answer,
      'Not quite — take another look at the lesson.',
    ));
  } catch {
    return NextResponse.json({ error: 'Could not check that right now — try again in a moment.' }, { status: 502 });
  }

  // Record the outcome (pass/close → explain_pass, miss → explain_fail).
  // Students only — admin (Adrian testing) has no account to attribute it to.
  if (isStudent) {
    const event = verdict === 'miss' ? 'explain_fail' : 'explain_pass';
    try {
      await supabase.from('unit_events').insert({
        user_id: caller.account.id,
        unit_id: UUID.test(unitId) ? unitId : null,
        subject, topic, kind, event,
      });
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ verdict, feedback });
}
