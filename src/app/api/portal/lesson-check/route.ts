// POST /api/portal/lesson-check — record one lesson check attempt.
// Body: { slug, qid, answer }.
//
// The player already graded the answer LOCALLY (lib/notebook.checkTypedAnswer
// against the server-resolved official answer) so the lesson never waits on
// this call; the route's job is the honest RECORD: it re-grades the typed
// answer server-side with the same pure checker against the live bank answer
// (a client can't forge a verdict) and writes a student_attempts row so
// mastery credit accrues — practice_overview averages score/outOf out of
// marking_json across ALL of a student's attempts, no attempted_via filter.
//
// Daily-cap posture mirrors the "From Adrian" assignment exemption in
// /api/portal/practice/grade: this route never blocks on DAILY_GRADE_CAP
// (there is nothing to meter — grading here is a pure function, no Opus
// spend). Like assignment attempts, the rows it inserts DO count in that
// route's daily tally (it counts attempted_via='portal' rows), so a lesson's
// two checks cost two of the student's 20 practice-grade slots — accepted
// deliberately to keep the money route untouched; revisit if lessons multiply.
//
// Ownership re-check, mirroring the assignment pattern: the qid is
// client-supplied, so it must be one of the CHECK QUESTIONS OF THIS LESSON'S
// COMMITTED SCRIPT — a request naming any other question is refused, so the
// route can't be used to stamp attempts on arbitrary bank rows.
//
// Verdict mapping into the row (student_attempts CHECK constraints):
//   correct → marking_verdict 'correct', marking_json score 1/1
//   wrong   → marking_verdict 'wrong',   marking_json score 0/1
//   unclear → marking_verdict 'unmarked', no score fields (mastery unaffected
//             — SQL avg() skips the NULL; the attempt still counts as one)
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';
import { lessonBySlug } from '@/lib/lesson-catalog';
import {
  loadLessonScript, usableCheckAnswer,
  CHECK_QUESTION_COLUMNS, type CheckQuestionRow,
} from '@/lib/lesson-load';
import { checkQids } from '@/lib/lesson-script';
import { checkTypedAnswer } from '@/lib/notebook';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id')
    .eq('id', user.id)
    .single<Pick<PortalAccount, 'id' | 'airtable_student_id'>>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { slug?: unknown; qid?: unknown; answer?: unknown } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const qid = typeof body.qid === 'string' ? body.qid : '';
  const answer = typeof body.answer === 'string' ? body.answer.trim().slice(0, 200) : '';
  if (!answer) return NextResponse.json({ error: 'answer required' }, { status: 400 });

  const script = lessonBySlug(slug) ? loadLessonScript(slug) : null;
  if (!script) return NextResponse.json({ error: 'Unknown lesson' }, { status: 404 });
  if (!checkQids(script).includes(qid)) {
    return NextResponse.json({ error: 'That question isn’t one of this lesson’s checks' }, { status: 404 });
  }

  const svc = createServiceClient();
  const { data: q } = await svc
    .from('questions')
    .select(`${CHECK_QUESTION_COLUMNS}, topics`)
    .eq('id', qid)
    .maybeSingle<CheckQuestionRow & { topics?: unknown }>();

  // The question drifted since the page render (deleted, flag-buried, answer
  // emptied): don't record against it, but don't error the player either.
  const official = usableCheckAnswer(q);
  if (!official) return NextResponse.json({ ok: true, verdict: 'unclear', recorded: false });

  const verdict = checkTypedAnswer(answer, official);
  const identity = portalIdentity(account);
  const { error: insertErr } = await svc.from('student_attempts').insert({
    user_id: account.id,
    airtable_student_id: identity,
    question_id: qid,
    attempted_via: 'portal',
    answer_text: answer,
    marking_verdict: verdict === 'unclear' ? 'unmarked' : verdict,
    marking_json: {
      source: 'lesson',
      lesson: slug,
      verdict,
      ...(verdict === 'unclear' ? {} : { score: verdict === 'correct' ? 1 : 0, outOf: 1 }),
      ...(q && Array.isArray(q.topics) ? { topics: q.topics } : {}),
    },
  });
  if (insertErr) {
    console.error('[lesson-check] attempt insert failed:', insertErr.message);
    return NextResponse.json({ ok: true, verdict, recorded: false });
  }
  return NextResponse.json({ ok: true, verdict, recorded: true });
}
