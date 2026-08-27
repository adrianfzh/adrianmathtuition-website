// POST /api/portal/generate — no bank match (or none the student liked), so
// write a FRESH question seeded on what they photographed / described, via the
// bot's 4-gate generation worker (code-verify + blind-solve + skill + grade —
// the same gates behind ai_generated rows with solution_source='ai_opus', which
// is what makes the result loadable at /app/practice?qid= AND gradable by the
// practice marker). Student session only; anonymous 401 is health-check-probed.
//
// Cost brake: DAILY_GENERATE_CAP (5) successful generations per student per SGT
// day, counted from `portal_generation_log` rows where generated=true — failed
// attempts and bank hits never spend the allowance; bank questions stay
// unlimited. Generation genuinely takes 1–3 min, hence maxDuration 300 and the
// client's staged progress screen; the bot contract (POST
// {BOT_BASE_URL}/api/portal-generate {level, topic?, seedText} → a question id)
// is being built in the bot repo — until then this degrades to a friendly 503/502.
import { NextResponse } from 'next/server';
import { sendPushToStudent } from '@/lib/portal-push';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import {
  parseGenerateBody, resolveQbLevel, extractQuestionId, countGenerationsToday,
  DAILY_GENERATE_CAP, CAP_MESSAGE, NOT_AVAILABLE_MESSAGE, GENERATE_FAILED_MESSAGE,
  type GenerationCountingClient,
} from '@/lib/portal-find';

export const runtime = 'nodejs';
export const maxDuration = 300; // the 4-gate worker takes 1–3 min

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('airtable_student_id, level, subjects')
    .eq('id', user.id)
    .maybeSingle<{ airtable_student_id: string; level: string | null; subjects: string[] | null }>();
  if (!account?.airtable_student_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseGenerateBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const ask = parsed.value;
  const level = resolveQbLevel(ask.level, account.level, account.subjects);

  const admin = createServiceClient();
  const used = await countGenerationsToday(
    admin as unknown as GenerationCountingClient,
    account.airtable_student_id,
  );
  if (used >= DAILY_GENERATE_CAP) {
    return NextResponse.json({ error: CAP_MESSAGE }, { status: 429 });
  }

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) {
    return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 503 });
  }

  // Every attempt logs a row; only generated=true rows spend the daily cap.
  const log = async (questionId: string | null) => {
    try {
      await admin.from('portal_generation_log').insert({
        airtable_student_id: account.airtable_student_id,
        kind: ask.kind,
        qb_hit: false,
        generated: questionId !== null,
        question_id: questionId,
      });
    } catch (e) {
      console.error('[portal-generate] log failed:', e);
    }
  };

  try {
    const r = await fetch(`${botBase}/api/portal-generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, ...(ask.topic ? { topic: ask.topic } : {}), seedText: ask.seedText }),
      signal: AbortSignal.timeout(280_000),
    });
    if (!r.ok) throw new Error(`bot HTTP ${r.status}`);
    const questionId = extractQuestionId(await r.json());
    await log(questionId);
    if (!questionId) {
      // The bot answered but nothing survived its verification gates.
      return NextResponse.json({ error: GENERATE_FAILED_MESSAGE }, { status: 502 });
    }
    // Adrian, 2026-08-28: "generated questions — i want push too". If the
    // student wandered off during the 1–3 min wait, the notification brings
    // them straight back to the fresh question; with the tab still open it's
    // a harmless tap-in. Fire-and-forget — a push failure never fails the
    // generation.
    sendPushToStudent(account.airtable_student_id, {
      title: 'Your question is ready ✨',
      body: 'Fresh practice question — written for you, checked, and gradable.',
      url: `/app/practice?qid=${questionId}&from=generated`,
    }).catch(() => {});
    return NextResponse.json({ questionId });
  } catch (e) {
    console.error('[portal-generate] bot call failed:', e);
    await log(null);
    return NextResponse.json({ error: GENERATE_FAILED_MESSAGE }, { status: 502 });
  }
}
