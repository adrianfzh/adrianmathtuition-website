// GET /api/cron/practice-difficulty — nightly 03:30 SGT (30 19 * * * UTC), 5 Oct 2026.
//
// 🎚 Sorts science practice MCQs into Core / Exam / Challenge from REAL student results
// (lib/practice-difficulty.ts, pure/tested): every science MCQ attempt is a
// `student_attempts` row in the MATH project (attempted_via 'portal-mcq',
// marking_json.science.questionId); each student's first try per question is counted, and a
// question with ≥ MIN_FIRST_ATTEMPTS first tries gets its level from the share wrong, written
// to the SCIENCE project's `practice_difficulty` (source 'results', replacing any estimate).
// The preview / demo identity is left out. Nothing a student sees reads the table yet.
// Stamps job_runs 'practice-difficulty' every run (a quiet night still stamps). ?dry=1 = report only.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getScienceClient, scienceConfigured } from '@/lib/science-bank';
import { logJobRun } from '@/lib/job-log';
import { safeEqual } from '@/lib/safe-equal';
import { SCIENCE_PREVIEW_IDENTITIES } from '@/lib/portal-beta';
import { tallyFirstAttempts, resultsRows, tallySummary, MIN_FIRST_ATTEMPTS, type McqAttempt } from '@/lib/practice-difficulty';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!bearer) return false;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return (!!cron && safeEqual(bearer, cron)) || (!!admin && safeEqual(bearer, admin));
}

type Row = { user_id: string | null; airtable_student_id: string | null; attempted_at: string; marking_verdict: string | null; qid: string | null };

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  if (!scienceConfigured()) return NextResponse.json({ error: 'science bank not configured' }, { status: 500 });

  // Every science MCQ attempt, paged past PostgREST's 1000-row cap.
  const sb = createServiceClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('student_attempts')
      .select('user_id, airtable_student_id, attempted_at, marking_verdict, qid:marking_json->science->>questionId')
      .eq('attempted_via', 'portal-mcq')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) {
      await logJobRun('practice-difficulty', false, `read failed: ${error.message}`).catch(() => {});
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }

  const exclude = new Set<string>(SCIENCE_PREVIEW_IDENTITIES);
  const attempts: McqAttempt[] = [];
  for (const r of rows) {
    if (!r.qid) continue;
    if (r.airtable_student_id && exclude.has(r.airtable_student_id)) continue;
    attempts.push({ student: r.user_id || r.airtable_student_id || '', questionId: r.qid, attemptedAt: r.attempted_at, correct: r.marking_verdict === 'correct' });
  }
  const tallies = tallyFirstAttempts(attempts);
  const summary = tallySummary(tallies);
  const upserts = resultsRows(tallies).map(r => ({ ...r, updated_at: new Date().toISOString() }));

  let written = 0;
  if (!dry && upserts.length) {
    const { error } = await getScienceClient().from('practice_difficulty').upsert(upserts, { onConflict: 'question_id' });
    if (error) {
      await logJobRun('practice-difficulty', false, `write failed: ${error.message}`).catch(() => {});
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    written = upserts.length;
  }

  const line = `${summary.firstAttempts} first tries on ${summary.questionsTried} questions (most on one: ${summary.maxOnOne}); ${summary.enough} with ≥ ${MIN_FIRST_ATTEMPTS} → ${written} sorted by results`;
  if (!dry) await logJobRun('practice-difficulty', true, line, { ...summary, written }).catch(() => {});
  return NextResponse.json({ ok: true, dry, attemptRows: rows.length, ...summary, written, line });
}
