// POST /api/portal/practice/grade — the Phase E grading loop.
// Body: { questionId, lines: string[], previousAttemptId? }
// Students only (grades persist to their attempt history). Daily cap applies —
// Opus grading costs real money and the cap also bounds abuse.
import { NextRequest, NextResponse } from 'next/server';
import { practiceAuth } from '@/lib/practice';
import { createServiceClient } from '@/lib/supabase-server';
import { gradeAttempt, upsertWeaknessTags, topWeaknessTags, DAILY_GRADE_CAP, GRADING_MODEL } from '@/lib/practice-grade';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller || caller.kind !== 'student') {
    return NextResponse.json({ error: 'Student session required' }, { status: 401 });
  }
  const account = caller.account;

  const body = await req.json().catch(() => ({}));
  const { questionId, lines } = body as { questionId?: string; lines?: string[] };
  if (!questionId || !Array.isArray(lines)) {
    return NextResponse.json({ error: 'questionId and lines[] required' }, { status: 400 });
  }
  const cleanLines = lines.map(l => String(l).slice(0, 500)).slice(0, 60);
  if (!cleanLines.some(l => l.trim())) {
    return NextResponse.json({ error: 'Write some working first' }, { status: 400 });
  }

  const admin = createServiceClient();

  // Daily cap
  const dayStart = new Date(); dayStart.setUTCHours(dayStart.getUTCHours() - 24);
  const { count } = await admin
    .from('student_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', account.id)
    .eq('attempted_via', 'portal')
    .gte('attempted_at', dayStart.toISOString());
  if ((count || 0) >= DAILY_GRADE_CAP) {
    return NextResponse.json({ error: `Daily limit reached (${DAILY_GRADE_CAP} graded attempts). Back tomorrow!` }, { status: 429 });
  }

  // Question WITH mark scheme (service role; never sent to the client)
  const { data: q } = await admin
    .from('questions')
    .select('id, level, question_text, parts, answer, solution, total_marks, topics, ai_generated')
    .eq('id', questionId)
    .maybeSingle();
  if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  if (q.ai_generated === true) {
    // E7 rule: AI-generated questions stay ungraded until Adrian spot-checks them.
    return NextResponse.json({ error: 'This AI practice question isn’t gradable yet — check the solution instead' }, { status: 409 });
  }

  const weaknessTags = await topWeaknessTags(account.id, 3);

  let result;
  try {
    result = await gradeAttempt({ question: q, lines: cleanLines, weaknessTags });
  } catch {
    return NextResponse.json({ error: 'Marking hiccup — try again in a moment' }, { status: 502 });
  }

  // Persist attempt (feedback JSON includes the lines so history can replay it)
  const { data: inserted } = await admin
    .from('student_attempts')
    .insert({
      user_id: account.id,
      airtable_student_id: account.airtable_student_id,
      question_id: q.id,
      attempted_via: 'portal',
      answer_text: cleanLines.join('\n'),
      marking_verdict: result.verdict,
      marking_json: { ...result, model: GRADING_MODEL, lines: cleanLines, topics: q.topics },
    })
    .select('id')
    .single();

  const newTags = result.lineComments.filter(c => !c.ok && c.tag).map(c => c.tag!) ;
  await upsertWeaknessTags(account.id, account.airtable_student_id, newTags);

  // Beta trust backstop: Adrian sees every grade and can spot-check (no student work in the message).
  sendTelegram(
    `🎓 Portal grade: ${account.display_name || account.email} · ${q.topics?.[0] || '?'} · ${result.score}/${result.outOf} (${result.verdict})`
  ).catch(() => {});

  return NextResponse.json({
    attemptId: inserted?.id ?? null,
    result,
    weaknessTags: await topWeaknessTags(account.id, 3),
  });
}
