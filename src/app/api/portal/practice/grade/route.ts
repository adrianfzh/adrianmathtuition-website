// POST /api/portal/practice/grade — the Phase E grading loop.
// Body: { questionId, lines: string[], previousAttemptId?, assignmentId? }
// Students only (grades persist to their attempt history). Daily cap applies —
// Opus grading costs real money and the cap also bounds abuse.
// `assignmentId` = a "From Adrian" question (SPEC-ASSIGN.md): must belong to
// this student and point at this question; exempt from the daily cap (Adrian
// chose to send it); on success the assignment flips to marked (latest re-mark
// wins) and Adrian gets a Telegram for the spot-check.
import { NextRequest, NextResponse } from 'next/server';
import { practiceAuth } from '@/lib/practice';
import { createServiceClient } from '@/lib/supabase-server';
import { gradeAttempt, upsertWeaknessTags, topWeaknessTags, DAILY_GRADE_CAP, GRADING_MODEL } from '@/lib/practice-grade';
import { sendTelegram } from '@/lib/telegram';
// Every notification from this file belongs in the students topic (6 Sept 2026; falls back to the DM when unbound).
const notify_students = (text: string) => sendTelegram(text, 'students');
import { canTransition, type AssignmentRow } from '@/lib/assignments';
import { portalIdentity } from '@/lib/portal-auth';
import { requireActiveAccess } from '@/lib/portal-passes';
import { loadTeachingKnowledge } from '@/lib/teaching-knowledge';
import { parseTimedMeta } from '@/lib/timed-set';
import { gradeMcq, isMcqAnswer, isScienceSubject, normaliseMcqChoice, scienceLevelForSubject, scienceLevelsFor } from '@/lib/science-levels';
import { scienceEligible, scienceQuestion } from '@/lib/science-bank';
import { sciencePracticeAccess } from '@/lib/portal-beta';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller || caller.kind !== 'student') {
    return NextResponse.json({ error: 'Student session required' }, { status: 401 });
  }
  const account = caller.account;
  // Opus grading costs real money: tuition rides free (zero-cost
  // short-circuit); a stranger needs an active pass or gets the 402 → /app/pass.
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  // rec… for tuition, acct:<uuid> for strangers — the key every attempt row,
  // weakness tag and assignment lookup below uses.
  const identity = portalIdentity(account);

  const body = await req.json().catch(() => ({}));
  const { questionId, lines, image, assignmentId, timed } = body as {
    questionId?: string;
    lines?: string[];
    image?: { data?: string; mediaType?: string };
    assignmentId?: string;
    timed?: unknown;
    subject?: unknown;
  };
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 });
  // Science practice (2026-09-02): `subject: 'physics'` marks a science-bank
  // question. Handled in full below — the math path is untouched.
  const scienceSubject = isScienceSubject(body.subject) ? body.subject : null;
  // Timed set (/app/practice/timed, 2026-09-02): the client tags each graded
  // question with the set + elapsed time; malformed → treated as ordinary
  // practice. The attempt row then carries duration_seconds + marking_json.timed
  // so Adrian can see pace, not just marks. Cap and grading are unchanged.
  const timedMeta = parseTimedMeta(timed);

  // Photo path (primary for students) or typed-lines path — exactly one.
  let attemptImage: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' } | undefined;
  let cleanLines: string[] | undefined;
  if (image?.data) {
    const mediaType = image.mediaType;
    if (mediaType !== 'image/jpeg' && mediaType !== 'image/png' && mediaType !== 'image/webp') {
      return NextResponse.json({ error: 'Photo must be JPEG, PNG or WebP' }, { status: 400 });
    }
    if (image.data.length > 4_000_000) { // ~3MB binary — client should downscale well below this
      return NextResponse.json({ error: 'Photo too large — try again (it will be resized automatically)' }, { status: 413 });
    }
    attemptImage = { data: image.data.replace(/^data:[^,]+,/, ''), mediaType };
  } else if (Array.isArray(lines)) {
    cleanLines = lines.map(l => String(l).slice(0, 500)).slice(0, 60);
    if (!cleanLines.some(l => l.trim())) {
      return NextResponse.json({ error: 'Write some working first' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'lines[] or image required' }, { status: 400 });
  }

  const admin = createServiceClient();

  if (scienceSubject) {
    // Gate: same access rule as the picker (closed to students until
    // SCIENCE_PRACTICE_OPEN_TO_STUDENTS; Adrian's admin cookie previews).
    const access = await sciencePracticeAccess();
    const sciLevel = scienceLevelForSubject(scienceSubject);
    if (!sciLevel || !scienceLevelsFor(account.subjects, access).some(l => l.key === sciLevel.key)) {
      return NextResponse.json({ error: 'Science practice isn’t open yet' }, { status: 403 });
    }
    let sq;
    try { sq = await scienceQuestion(scienceSubject, questionId); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
    if (!sq || !scienceEligible(sq)) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    const topics = Array.isArray(sq.topics) ? sq.topics : [];
    const scienceMeta = { subject: scienceSubject, questionId: sq.id };

    // MCQ: a bare-letter answer, marked deterministically — no model, no cap.
    if (isMcqAnswer(sq.answer)) {
      if (attemptImage) return NextResponse.json({ error: 'Pick an option (A–D) for this question' }, { status: 400 });
      const choice = normaliseMcqChoice((cleanLines || []).find(l => l.trim()));
      if (!choice) return NextResponse.json({ error: 'Answer with the option letter — A, B, C or D' }, { status: 400 });
      const result = gradeMcq(sq.answer.trim().toUpperCase() as 'A' | 'B' | 'C' | 'D', choice, sq.total_marks);
      const { data: ins, error: insErr } = await admin
        .from('student_attempts')
        .insert({
          user_id: account.id,
          airtable_student_id: identity,
          question_id: null,                 // FK points at the MATH bank
          attempted_via: 'portal-mcq',       // deterministic → outside the daily cap + digest
          answer_text: choice,
          marking_verdict: result.verdict,
          duration_seconds: timedMeta?.elapsedSec ?? null,
          marking_json: { ...result, model: 'rule:mcq', lines: [choice], source: 'typed', topics, science: { ...scienceMeta, mcq: true, choice }, ...(timedMeta ? { timed: timedMeta } : {}) },
        })
        .select('id').single();
      if (insErr) console.error('[practice-grade] science MCQ attempt insert failed:', insErr.message);
      return NextResponse.json({ attemptId: ins?.id ?? null, result, weaknessTags: [] });
    }

    // Structured: the ordinary Opus grader with the physics framing. Daily cap
    // applies (it costs the same as a math grade); math weakness tags and
    // pitfalls are not used — they are math vocabulary.
    const dayStartS = new Date(); dayStartS.setUTCHours(dayStartS.getUTCHours() - 24);
    const { count: usedS } = await admin
      .from('student_attempts').select('id', { count: 'exact', head: true })
      .eq('user_id', account.id).eq('attempted_via', 'portal').gte('attempted_at', dayStartS.toISOString());
    if ((usedS || 0) >= DAILY_GRADE_CAP) {
      return NextResponse.json({ error: `Daily limit reached (${DAILY_GRADE_CAP} graded attempts). Back tomorrow!` }, { status: 429 });
    }
    let sres;
    try {
      sres = await gradeAttempt({
        question: { ...sq, level: `O-Level ${sciLevel.label}` } as Record<string, unknown>,
        lines: cleanLines, image: attemptImage, weaknessTags: [], pitfalls: [], subject: scienceSubject,
      });
    } catch {
      return NextResponse.json({ error: 'Marking hiccup — try again in a moment' }, { status: 502 });
    }
    const storedS = sres.transcribedLines || cleanLines || [];
    const { data: insS, error: insSErr } = await admin
      .from('student_attempts')
      .insert({
        user_id: account.id,
        airtable_student_id: identity,
        question_id: null,
        attempted_via: 'portal',
        answer_text: storedS.join('\n'),
        marking_verdict: sres.verdict,
        duration_seconds: timedMeta?.elapsedSec ?? null,
        marking_json: { ...sres, model: GRADING_MODEL, lines: storedS, source: attemptImage ? 'photo' : 'typed', topics, science: scienceMeta, ...(timedMeta ? { timed: timedMeta } : {}) },
      })
      .select('id').single();
    if (insSErr) console.error('[practice-grade] science attempt insert failed:', insSErr.message);
    if (sres.parseRetried) {
      notify_students(`⚠️ ${sciLevel.label} practice grade needed a JSON retry — ${account.display_name || account.email}, ${topics[0] || '?'}, ${sres.score}/${sres.outOf}. Worth a spot-check.`).catch(() => {});
    }
    return NextResponse.json({ attemptId: insS?.id ?? null, result: sres, weaknessTags: [] });
  }

  // Assignment ownership — the id is client-supplied, so every claim is
  // re-checked server-side against the session's portal identity.
  let assignment: AssignmentRow | null = null;
  if (assignmentId) {
    const { data: a } = await admin
      .from('portal_assignments').select('*')
      .eq('id', String(assignmentId)).eq('airtable_student_id', identity)
      .maybeSingle();
    const row = a as AssignmentRow | null;
    // A bank question must be THE question. A `generated` question (SPEC-PORTAL-V2
    // §7 — the sheet worker wrote it, no bank row) is addressed by the assignment
    // id itself and must carry its text and answer. A `held` row is not the
    // student's yet: it goes live only with Adrian's Approve & release.
    const matches = !!row && (
      (row.kind === 'question' && row.question_id === questionId)
      || (row.kind === 'generated' && row.id === questionId && !!row.question_text && !!row.answer_latex)
    );
    if (!row || !matches || row.status === 'revoked' || row.status === 'held') {
      return NextResponse.json({ error: 'That assignment isn’t available' }, { status: 404 });
    }
    assignment = row;
  }

  // Daily cap — Adrian-initiated work is exempt (D3: the Send-work card, a
  // Practice Again item he released). A question the STUDENT found (source
  // 'find') is not: that is student-initiated volume, exactly what the cap brakes.
  const capExempt = !!assignment && assignment.source !== 'find';
  const dayStart = new Date(); dayStart.setUTCHours(dayStart.getUTCHours() - 24);
  const { count } = await admin
    .from('student_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', account.id)
    .eq('attempted_via', 'portal')
    .gte('attempted_at', dayStart.toISOString());
  if (!capExempt && (count || 0) >= DAILY_GRADE_CAP) {
    return NextResponse.json({ error: `Daily limit reached (${DAILY_GRADE_CAP} graded attempts). Back tomorrow!` }, { status: 429 });
  }

  // Question WITH mark scheme (service role; never sent to the client)
  type GradeQuestion = {
    id: string; level: string | null; question_text: string | null; parts: unknown; answer: string | null;
    solution: string | null; total_marks: number | null; topics: string[] | null;
    ai_generated?: boolean | null; solution_source?: string | null;
  };
  let q: GradeQuestion;
  const generated = assignment?.kind === 'generated' ? assignment : null;
  if (generated) {
    // The sheet worker wrote this one (SPEC-PORTAL-V2 §7): its text, verified
    // answer and marks live on the assignment row, and the grader marks against
    // them exactly as it would a bank row's OVERALL ANSWER. No bank lookup, and
    // the attempt row carries no question FK (below).
    q = {
      id: generated.id, level: generated.level, question_text: generated.question_text, parts: null,
      answer: generated.answer_latex, solution: null, total_marks: generated.marks,
      topics: generated.topic ? [generated.topic] : [],
    };
  } else {
    const { data } = await admin
      .from('questions')
      .select('id, level, question_text, parts, answer, solution, total_marks, topics, ai_generated, solution_source')
      .eq('id', questionId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    if (data.ai_generated === true && data.solution_source !== 'ai_opus') {
      // E7 rule (amended 2026-07-06): AI questions that passed the bot worker's
      // four verification gates (code/blind/skill/grade — solution_source='ai_opus',
      // written ONLY by the bot's generation worker) are gradable. Any other
      // ai_generated row (e.g. /similar's weaker-verified 'ai_generated_v1' cache)
      // stays ungraded until it goes through the gates.
      return NextResponse.json({ error: 'This AI practice question isn’t gradable yet — check the solution instead' }, { status: 409 });
    }
    q = data as GradeQuestion;
  }

  const weaknessTags = await topWeaknessTags(account.id, 3);
  // Adrian's method + curated traps for this question's topic, from the
  // teaching-knowledge layer (src/lib/teaching-knowledge.ts). Feedback-wording
  // help only. Fails soft to empty so a knowledge outage can never stop a
  // student being graded.
  const knowledge = await loadTeachingKnowledge(admin, {
    level: q.level as string, topics: q.topics,
    context: `${q.question_text || ''} ${q.answer || ''}`,
    methods: 2, pitfalls: 4,
  });

  let result;
  try {
    result = await gradeAttempt({ question: q as Record<string, unknown>, lines: cleanLines, image: attemptImage, weaknessTags, pitfalls: knowledge.pitfalls, methods: knowledge.methods });
  } catch {
    return NextResponse.json({ error: 'Marking hiccup — try again in a moment' }, { status: 502 });
  }

  // Persist attempt (feedback JSON includes the lines so history can replay it).
  // Photo attempts store the transcription, not the image — no student photos at rest.
  const storedLines = result.transcribedLines || cleanLines || [];
  const { data: inserted } = await admin
    .from('student_attempts')
    .insert({
      user_id: account.id,
      airtable_student_id: identity,
      // The FK points at the math bank; a generated question has no row there —
      // marking_json.generated names the assignment instead.
      question_id: generated ? null : q.id,
      attempted_via: 'portal',
      answer_text: storedLines.join('\n'),
      marking_verdict: result.verdict,
      duration_seconds: timedMeta?.elapsedSec ?? null,
      marking_json: {
        ...result, model: GRADING_MODEL, lines: storedLines, source: attemptImage ? 'photo' : 'typed', topics: q.topics,
        ...(timedMeta ? { timed: timedMeta } : {}),
        ...(generated ? { generated: { assignmentId: generated.id, source: generated.source, skillTitle: generated.skill_title } } : {}),
      },
    })
    .select('id')
    .single();

  const newTags = result.lineComments.filter(c => !c.ok && c.tag).map(c => c.tag!) ;
  await upsertWeaknessTags(account.id, identity, newTags);

  // "From Adrian": mark the assignment done (a re-mark overwrites the score)
  // and tell Adrian — D1's spot-check hook.
  if (assignment && canTransition(assignment.status, 'marked')) {
    const { error: flipErr } = await admin
      .from('portal_assignments')
      .update({
        status: 'marked',
        attempt_id: inserted?.id ?? null, // student_attempts.id is a bigint
        score: result.score,
        out_of: result.outOf,
        marked_at: new Date().toISOString(),
      })
      .eq('id', assignment.id);
    if (flipErr) console.error('[practice-grade] assignment flip failed:', flipErr.message);
    const who = account.display_name || account.email;
    const what = assignment.topic ? `${assignment.topic}${assignment.tier ? ` · ${assignment.tier}` : ''}` : assignment.title;
    // The wording names where the item came from (SPEC-PORTAL-V2 §3): Adrian's
    // own send, a Practice Again item from a marked paper, or a question the
    // student found — so the spot-check reads right.
    const lead = assignment.source === 'practice-again'
      ? `🔁 ${who} did a Practice Again question (${assignment.skill_title || what})`
      : assignment.source === 'find'
        ? `🔍 ${who} did a question they found (${what})`
        : `📬 ${who} did your assigned question (${what})`;
    notify_students(
      `${lead} — ${result.score}/${result.outOf}`
      + (assignment.status === 'marked' ? ' (re-marked)' : '')
      + `\nhttps://www.adrianmathtuition.com/admin/students/${account.airtable_student_id}`
    ).catch(() => {});
  }

  // Alerts: only true anomalies page Adrian in real time (a 9:30pm daily digest
  // covers normal grades — see /api/portal/practice-digest). Anomaly = the model
  // needed a retry to produce valid JSON, i.e. lower confidence in the grade.
  if (result.parseRetried) {
    notify_students(
      `⚠️ Portal grade needed a JSON retry (lower confidence) — ${account.display_name || account.email}, ${q.topics?.[0] || '?'}, ${result.score}/${result.outOf}. Worth a spot-check.`
    ).catch(() => {});
  }

  return NextResponse.json({
    attemptId: inserted?.id ?? null,
    result,
    weaknessTags: await topWeaknessTags(account.id, 3),
  });
}
