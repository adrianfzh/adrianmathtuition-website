import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth } from '@/lib/practice';
import { isScienceSubject } from '@/lib/science-levels';
import { proofLadderAllowedFor } from '@/lib/portal-beta';
import { sgtDayStart } from '@/lib/sgt';
import { NEXT_STEP_MODEL, DAILY_NEXT_STEP_CAP, ladderSteps, buildNextStepPrompt, parseNextStep } from '@/lib/proof-ladder';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/portal/practice/next-step  { questionId, image: { data, mediaType } }
// 🪜 "Next step from my line" (1 Oct 2026): reads the student's photo of their
// working so far and gives the one or two lines that follow from where they
// stopped — the red pen's "From your line" continuation, before marking. One
// sentence names a wrong line if there is one. Never the whole proof. The
// photo is not stored; each ask is one `portal_event_log` row (kind
// `practice:next-step`) for the daily cap.
// Auth: portal student session (the flag or a preview identity) OR admin Bearer.
export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (caller.kind === 'student' && !proofLadderAllowedFor(caller.account.airtable_student_id)) {
    return NextResponse.json({ error: 'Not open yet' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { questionId, image, subject } = body as { questionId?: string; image?: { data?: string; mediaType?: string }; subject?: string };
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 });
  if (isScienceSubject(subject)) return NextResponse.json({ error: 'Maths questions only for now' }, { status: 400 });
  const mediaType = image?.mediaType;
  if (!image?.data || (mediaType !== 'image/jpeg' && mediaType !== 'image/png' && mediaType !== 'image/webp')) {
    return NextResponse.json({ error: 'A photo of your working is required' }, { status: 400 });
  }
  if (image.data.length > 4_000_000) return NextResponse.json({ error: 'Photo too large — retake it' }, { status: 413 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const admin = getSupabaseAdmin();
  if (caller.kind === 'student') {
    const { count } = await admin
      .from('portal_event_log')
      .select('id', { count: 'exact', head: true })
      .eq('identity', caller.account.airtable_student_id)
      .eq('kind', 'practice:next-step')
      .gte('created_at', sgtDayStart().toISOString());
    if ((count ?? 0) >= DAILY_NEXT_STEP_CAP) {
      return NextResponse.json({ error: `That's ${DAILY_NEXT_STEP_CAP} next-steps today — check the solution instead, or come back tomorrow.` }, { status: 429 });
    }
  }

  const { data: q, error } = await admin
    .from('questions')
    .select('id, level, question_text, solution, answer, parts')
    .eq('id', questionId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const prompt = buildNextStepPrompt({ level: q.level, question_text: String(q.question_text || ''), steps: ladderSteps(q) });
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: NEXT_STEP_MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image.data.replace(/^data:[^,]+,/, '') } },
          { type: 'text', text: prompt },
        ],
      }],
    });
    const text = msg.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n');
    const step = parseNextStep(text);
    if (caller.kind === 'student') {
      await admin.from('portal_event_log').insert({
        identity: caller.account.airtable_student_id,
        kind: 'practice:next-step', detail: { questionId, lines: step.lines.length, wrong: !!step.wrong },
      }).then(({ error: e }) => { if (e) console.warn('[next-step] event log skipped:', e.message); });
    }
    return NextResponse.json({ wrong: step.wrong, lines: step.lines });
  } catch (e) {
    console.error('[practice/next-step] failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not read that — try a clearer photo' }, { status: 502 });
  }
}
