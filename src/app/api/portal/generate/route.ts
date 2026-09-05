// POST /api/portal/generate — nothing GENUINELY similar in the bank (the tier
// rule in /api/portal/find said so), so write a FRESH question seeded on what
// the student photographed / typed, via the bot's 4-gate generation worker
// (code-verify + blind-solve + skill + grade — the same gates behind
// ai_generated rows with solution_source='ai_opus', which is what makes the
// result gradable by the practice marker). The question goes STRAIGHT onto
// the student's Practice list (portal_assignments, source 'find', find_tier
// 'made-for-you' — SPEC-PORTAL-V2 §4) and the response carries the assignment
// id the card deep-links to. Student session only; anonymous 401 is
// health-check-probed.
//
// Cost brake: DAILY_GENERATE_CAP (10) successful generations per student per
// SGT day, counted from `portal_generation_log` rows where generated=true —
// failed attempts and bank hits never spend the allowance; bank finds stay
// generous (DAILY_FIND_CAP). Generation genuinely takes 1–3 min, hence
// maxDuration 300 and the client's staged progress screen; the bot contract is
// POST {BOT_BASE_URL}/api/portal-generate {level, topic?, seedText} → { id }.
// `findLogId` (the /find row that found nothing) links the two ledger rows for
// the nightly find-review.
import { NextResponse } from 'next/server';
import { sendPushToStudent } from '@/lib/portal-push';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import {
  parseGenerateBody, resolveQbLevel, extractQuestionId, countGenerationsToday,
  countFinderCallsToday, DAILY_FIND_CAP, FIND_CAP_MESSAGE,
  DAILY_GENERATE_CAP, CAP_MESSAGE, NOT_AVAILABLE_MESSAGE, GENERATE_FAILED_MESSAGE,
  FIND_TIER_LABEL, type GenerationCountingClient,
} from '@/lib/portal-find';
import { portalIdentity } from '@/lib/portal-auth';
import { requireActiveAccess } from '@/lib/portal-passes';
import { createFindAssignment, loadQuestionSummary, logFindRow } from '@/lib/find-assign';

export const runtime = 'nodejs';
export const maxDuration = 300; // the 4-gate worker takes 1–3 min

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id, level, subjects')
    .eq('id', user.id)
    .maybeSingle<{ id: string; airtable_student_id: string; level: string | null; subjects: string[] | null }>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // rec… for tuition, acct:<uuid> for strangers — keys the cap count, the
  // generation log, the Practice row and the "question ready" push below.
  const identity = portalIdentity(account);

  // 4-gate generation is the portal's most expensive call (1–3 min of model
  // time) — tuition short-circuits free; a stranger needs an active pass.
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = parseGenerateBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const ask = parsed.value;
  // The bot canonicalises whatever family code arrives (AM|EM|JC|S1|S2, or a
  // QB key like JC2/S3_AM); the account gate decides what may be searched.
  const level = resolveQbLevel(ask.level, account.level, account.subjects);

  const admin = createServiceClient();
  const used = await countGenerationsToday(
    admin as unknown as GenerationCountingClient,
    identity,
  );
  if (used >= DAILY_GENERATE_CAP) {
    return NextResponse.json({ error: CAP_MESSAGE }, { status: 429 });
  }
  // Total-attempts backstop (Phase G, 2026-08-28): the daily cap counts only
  // SUCCESSFUL generations, but a failed attempt still burns 1–3 min of 4-gate
  // model time and was previously unlimited. The shared finder ledger cap
  // (every /find call + every generate attempt = one row) bounds the failure
  // loop too.
  const attempts = await countFinderCallsToday(
    admin as unknown as GenerationCountingClient,
    identity,
  );
  if (attempts >= DAILY_FIND_CAP) {
    return NextResponse.json({ error: FIND_CAP_MESSAGE }, { status: 429 });
  }

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) {
    return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 503 });
  }

  // Every attempt logs a row; only generated=true rows spend the daily cap.
  const logFailure = () => logFindRow(admin, {
    identity, kind: ask.kind, qbHit: false, generated: false, questionId: null,
    seedText: ask.seedText, level, tier: null, assignmentId: null, parentLogId: ask.findLogId,
  });

  try {
    const r = await fetch(`${botBase}/api/portal-generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, ...(ask.topic ? { topic: ask.topic } : {}), seedText: ask.seedText }),
      signal: AbortSignal.timeout(280_000),
    });
    if (!r.ok) throw new Error(`bot HTTP ${r.status}`);
    const questionId = extractQuestionId(await r.json());
    if (!questionId) {
      // The bot answered but nothing survived its verification gates.
      await logFailure();
      return NextResponse.json({ error: GENERATE_FAILED_MESSAGE }, { status: 502 });
    }

    // Straight onto the Practice list (SPEC-PORTAL-V2 §4). The generated row
    // is verified + ai_opus, so it passes the eligibility bars the summary
    // applies; a failed insert still hands the question over by ?qid=.
    const summary = await loadQuestionSummary(admin, questionId).catch(() => null);
    const assignmentId = summary
      ? await createFindAssignment(admin, { identity, question: summary, level, tier: 'made-for-you' })
      : null;
    await logFindRow(admin, {
      identity, kind: ask.kind, qbHit: false, generated: true, questionId,
      seedText: ask.seedText, level, tier: 'made-for-you', assignmentId, parentLogId: ask.findLogId,
    });
    const url = assignmentId ? `/app/practice?assignment=${assignmentId}` : `/app/practice?qid=${questionId}&from=generated`;
    // Adrian, 2026-08-28: "generated questions — i want push too". If the
    // student wandered off during the 1–3 min wait, the notification brings
    // them straight back to the fresh question; with the tab still open it's
    // a harmless tap-in. Fire-and-forget — a push failure never fails the
    // generation.
    sendPushToStudent(identity, {
      title: 'Your question is ready ✨',
      body: 'Made for you — checked, and waiting in your Practice.',
      url,
    }).catch(() => {});
    return NextResponse.json({ questionId, assignmentId, label: FIND_TIER_LABEL['made-for-you'], question: summary, url });
  } catch (e) {
    console.error('[portal-generate] bot call failed:', e);
    await logFailure();
    return NextResponse.json({ error: GENERATE_FAILED_MESSAGE }, { status: 502 });
  }
}
