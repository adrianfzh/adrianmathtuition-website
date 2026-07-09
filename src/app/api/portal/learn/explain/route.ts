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
import Anthropic from '@anthropic-ai/sdk';
import { practiceAuth } from '@/lib/practice';
import { getSupabaseAdmin } from '@/lib/supabase';
import { learnSubjectsForLevel } from '@/lib/learn';
import { getFixtureUnit, isFixtureId } from '@/lib/learn-fixture';
import type { UnitPayload } from '@/lib/learn-types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-opus-4-8';
const DAILY_CAP = 20;
const MAX_ANSWER = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Verdict = 'pass' | 'close' | 'miss';

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

  const system = `You are Adrian, a warm and encouraging Singapore maths tutor. A student has just finished a lesson unit on "${topic}" and is telling you, in one sentence, when or why you use this idea.

Judge their sentence ONLY against the lesson content below — do not use outside knowledge, and do not penalise them for anything the lesson didn't teach. Reward the core intuition; small imprecision is fine.

Return STRICT JSON only, no prose, no code fences:
{"verdict":"pass"|"close"|"miss","feedback":"<25 words, warm, second-person, Adrian's voice>"}

- "pass": they've got the key idea.
- "close": right instinct, missing or muddling one thing — nudge them.
- "miss": not the right idea — point them gently back.

--- LESSON CONTENT (the ONLY thing you may judge against) ---
${notes}
--- END LESSON CONTENT ---`;

  let verdict: Verdict = 'close';
  let feedback = '';
  try {
    const msg = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: answer }],
    });
    const text = msg.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')
      .trim();
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
    const v = String(parsed.verdict || '').toLowerCase();
    verdict = v === 'pass' || v === 'miss' ? (v as Verdict) : 'close';
    feedback = String(parsed.feedback || '').slice(0, 200).trim();
  } catch {
    return NextResponse.json({ error: 'Could not check that right now — try again in a moment.' }, { status: 502 });
  }
  if (!feedback) feedback = verdict === 'miss' ? 'Not quite — take another look at the lesson.' : 'Good thinking.';

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
