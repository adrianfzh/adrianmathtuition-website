// GET /api/cron/math-practice-difficulty — nightly 3:45am SGT (45 19 * * * UTC), 15 Oct 2026.
//
// 🎚 Students' first tries correct the maths practice levels Adrian tapped (SPEC-TWINS §12,
// lib/practice-difficulty.ts maths section, pure/tested). Every maths practice attempt is a
// `student_attempts` row (attempted_via 'portal', question_id set, no marking_json.science);
// each student's first try per question is counted (wrong = under half marks, or any "Stuck?
// next step" help), the preview identity left out. With ≥ 20 first tries: under 25 % wrong →
// Core, over 55 % → Advanced, written to questions.difficulty (what practice_next and every
// count read). `math_practice_difficulty` keeps the starting level; a hand change after results
// pins the question; Challenge is never touched. Each move → math_practice_difficulty_changes.
//
// ?weekly=1 (Mondays 9am SGT via /api/cron/math-practice-difficulty-weekly, 0 1 * * 1 UTC): sends Adrian ONE Telegram line about the week's
// moves (nothing when none) and marks them reported. ?dry=1 = report only, no writes.
// Stamps job_runs 'math-practice-difficulty' (nightly) / 'math-practice-difficulty-weekly'.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { logJobRun } from '@/lib/job-log';
import { safeEqual } from '@/lib/safe-equal';
import { sendTelegram } from '@/lib/telegram';
import { SCIENCE_PREVIEW_IDENTITIES } from '@/lib/portal-beta';
import {
  tallyMathFirstAttempts, tallySummary, planMathLevel, mathWeeklyLine, MIN_FIRST_ATTEMPTS,
  type MathAttempt, type MathDifficultyStored, type MathChange,
} from '@/lib/practice-difficulty';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!bearer) return false;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return (!!cron && safeEqual(bearer, cron)) || (!!admin && safeEqual(bearer, admin));
}

type AttemptRow = {
  user_id: string | null; airtable_student_id: string | null; question_id: string; attempted_at: string;
  marking_verdict: string | null; score: string | null; out_of: string | null; revealed: string | null; science: unknown;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v: string | null) => (v == null || v === '' ? null : Number(v));
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const dry = params.get('dry') === '1';
  const sb = createServiceClient();
  if (params.get('weekly') === '1') return weekly(sb, dry);

  // Every maths practice attempt on a bank question, paged past PostgREST's 1000-row cap.
  const rows: AttemptRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('student_attempts')
      .select('user_id, airtable_student_id, question_id, attempted_at, marking_verdict, score:marking_json->>score, out_of:marking_json->>outOf, revealed:marking_json->ladder->>revealed, science:marking_json->science')
      .eq('attempted_via', 'portal').not('question_id', 'is', null)
      .order('id', { ascending: true }).range(from, from + 999);
    if (error) {
      await logJobRun('math-practice-difficulty', false, `read failed: ${error.message}`).catch(() => {});
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    rows.push(...((data ?? []) as AttemptRow[]));
    if (!data || data.length < 1000) break;
  }

  const exclude = new Set<string>(SCIENCE_PREVIEW_IDENTITIES);
  const attempts: MathAttempt[] = rows
    .filter(r => !r.science && !(r.airtable_student_id && exclude.has(r.airtable_student_id)))
    .map(r => ({
      student: r.user_id || r.airtable_student_id || '', questionId: r.question_id, attemptedAt: r.attempted_at,
      verdict: r.marking_verdict, score: num(r.score), outOf: num(r.out_of), helpSteps: num(r.revealed) ?? 0,
    }));
  const tallies = tallyMathFirstAttempts(attempts);
  const summary = tallySummary(tallies);

  // Current levels + what the table remembers, for every question tried.
  const ids = tallies.map(t => t.questionId);
  const current = new Map<string, string | null>();
  const stored = new Map<string, MathDifficultyStored>();
  for (const part of chunks(ids, 200)) {
    const [q, s] = await Promise.all([
      sb.from('questions').select('id, difficulty').in('id', part),
      sb.from('math_practice_difficulty').select('question_id, starting_level, level, source, pinned').in('question_id', part),
    ]);
    if (q.error || s.error) {
      const msg = (q.error || s.error)!.message;
      await logJobRun('math-practice-difficulty', false, `read failed: ${msg}`).catch(() => {});
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    for (const r of q.data ?? []) current.set(r.id, r.difficulty);
    for (const r of s.data ?? []) stored.set(r.question_id, r as MathDifficultyStored);
  }

  let moved = 0, pinned = 0, failed = 0;
  const now = new Date().toISOString();
  const tableRows: Record<string, unknown>[] = [];
  const changes: Record<string, unknown>[] = [];
  const planned: { id: string; to: string; from: string }[] = [];
  for (const t of tallies) {
    if (!current.has(t.questionId)) continue;                           // deleted question
    const plan = planMathLevel(current.get(t.questionId) ?? null, stored.get(t.questionId) ?? null, t);
    if (!plan.row) continue;
    if (plan.row.pinned && !stored.get(t.questionId)?.pinned) pinned++;
    if (plan.write && plan.change) planned.push({ id: t.questionId, to: plan.write, from: plan.change.from });
    if (dry) continue;
    if (plan.write && plan.change) {
      // The level first; the table row only once the level is written — otherwise next night
      // would read the mismatch as a hand change and pin the question.
      const { error } = await sb.from('questions').update({ difficulty: plan.write }).eq('id', t.questionId);
      if (error) { failed++; continue; }
      moved++;
      changes.push({ question_id: t.questionId, from_level: plan.change.from, to_level: plan.change.to, starting_level: plan.row.starting_level, attempts: t.attempts, wrong: t.wrong, wrong_share: plan.row.wrong_share });
    }
    const { changed, ...row } = plan.row;
    tableRows.push({ ...row, updated_at: now, ...(changed ? { changed_at: now } : {}) });
  }

  if (!dry) {
    for (const part of chunks(tableRows, 500)) {
      const { error } = await sb.from('math_practice_difficulty').upsert(part, { onConflict: 'question_id' });
      if (error) {
        await logJobRun('math-practice-difficulty', false, `write failed: ${error.message}`).catch(() => {});
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    if (changes.length) {
      const { error } = await sb.from('math_practice_difficulty_changes').insert(changes);
      if (error) console.error('[math-practice-difficulty] change log insert failed:', error.message);
    }
  }

  const line = `${summary.firstAttempts} first tries on ${summary.questionsTried} maths questions (most on one: ${summary.maxOnOne}); ${summary.enough} with ≥ ${MIN_FIRST_ATTEMPTS} → ${dry ? planned.length : moved} level${(dry ? planned.length : moved) === 1 ? '' : 's'} moved${pinned ? `, ${pinned} pinned by a hand change` : ''}${failed ? `, ${failed} writes FAILED` : ''}`;
  if (!dry) await logJobRun('math-practice-difficulty', failed === 0, line, { ...summary, moved, pinned, failed }).catch(() => {});
  return NextResponse.json({ ok: failed === 0, dry, attemptRows: rows.length, ...summary, moved, pinned, failed, planned: dry ? planned : undefined, line });
}

async function weekly(sb: ReturnType<typeof createServiceClient>, dry: boolean) {
  const { data, error } = await sb.from('math_practice_difficulty_changes')
    .select('id, question_id, from_level, to_level, starting_level, attempts, wrong, changed_at')
    .is('reported_at', null).order('changed_at', { ascending: true }).limit(1000);
  if (error) {
    await logJobRun('math-practice-difficulty-weekly', false, `read failed: ${error.message}`).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = data ?? [];
  // Keep only each question's latest move this week, and drop a question that moved back.
  const latest = new Map<string, (typeof list)[number] & { first: string }>();
  for (const c of list) {
    const prev = latest.get(c.question_id);
    latest.set(c.question_id, { ...c, first: prev?.first ?? c.from_level });
  }
  const net = [...latest.values()].filter(c => c.first !== c.to_level);
  const labels = new Map<string, string>();
  for (const part of chunks(net.map(c => c.question_id), 200)) {
    const { data: qs } = await sb.from('questions').select('id, level, topics, question_number').in('id', part);
    for (const q of qs ?? []) labels.set(q.id, `${q.level || '?'} · ${(q.topics as string[] | null)?.[0] || 'no topic'}${q.question_number ? ` · Q${q.question_number}` : ''}`);
  }
  const changes: MathChange[] = net.map(c => ({ from_level: c.first, to_level: c.to_level, starting_level: c.starting_level, attempts: c.attempts, wrong: c.wrong, label: esc(labels.get(c.question_id) || c.question_id.slice(0, 8)) }));
  const text = mathWeeklyLine(changes);
  let sent = false;
  if (!dry && text) sent = await sendTelegram(text, 'students').catch(() => false);
  if (!dry && list.length && (sent || !text)) {
    await sb.from('math_practice_difficulty_changes').update({ reported_at: new Date().toISOString() }).in('id', list.map(c => c.id));
  }
  const line = text ? `${changes.length} moved this week${sent ? ' — sent' : dry ? ' (dry)' : ' — send FAILED'}` : 'no moves this week';
  if (!dry) await logJobRun('math-practice-difficulty-weekly', !text || sent, line, { moves: changes.length }).catch(() => {});
  return NextResponse.json({ ok: true, dry, line, text });
}
