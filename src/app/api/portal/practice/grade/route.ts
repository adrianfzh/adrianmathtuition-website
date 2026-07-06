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
  const { questionId, lines, image } = body as {
    questionId?: string;
    lines?: string[];
    image?: { data?: string; mediaType?: string };
  };
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 });

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
    .select('id, level, question_text, parts, answer, solution, total_marks, topics, ai_generated, solution_source')
    .eq('id', questionId)
    .maybeSingle();
  if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  if (q.ai_generated === true && q.solution_source !== 'ai_opus') {
    // E7 rule (amended 2026-07-06): AI questions that passed the bot worker's
    // four verification gates (code/blind/skill/grade — solution_source='ai_opus',
    // written ONLY by the bot's generation worker) are gradable. Any other
    // ai_generated row (e.g. /similar's weaker-verified 'ai_generated_v1' cache)
    // stays ungraded until it goes through the gates.
    return NextResponse.json({ error: 'This AI practice question isn’t gradable yet — check the solution instead' }, { status: 409 });
  }

  const weaknessTags = await topWeaknessTags(account.id, 3);

  let result;
  try {
    result = await gradeAttempt({ question: q, lines: cleanLines, image: attemptImage, weaknessTags });
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
      airtable_student_id: account.airtable_student_id,
      question_id: q.id,
      attempted_via: 'portal',
      answer_text: storedLines.join('\n'),
      marking_verdict: result.verdict,
      marking_json: { ...result, model: GRADING_MODEL, lines: storedLines, source: attemptImage ? 'photo' : 'typed', topics: q.topics },
    })
    .select('id')
    .single();

  const newTags = result.lineComments.filter(c => !c.ok && c.tag).map(c => c.tag!) ;
  await upsertWeaknessTags(account.id, account.airtable_student_id, newTags);

  // Alerts: only true anomalies page Adrian in real time (a 9:30pm daily digest
  // covers normal grades — see /api/portal/practice-digest). Anomaly = the model
  // needed a retry to produce valid JSON, i.e. lower confidence in the grade.
  if (result.parseRetried) {
    sendTelegram(
      `⚠️ Portal grade needed a JSON retry (lower confidence) — ${account.display_name || account.email}, ${q.topics?.[0] || '?'}, ${result.score}/${result.outOf}. Worth a spot-check.`
    ).catch(() => {});
  }

  return NextResponse.json({
    attemptId: inserted?.id ?? null,
    result,
    weaknessTags: await topWeaknessTags(account.id, 3),
  });
}
