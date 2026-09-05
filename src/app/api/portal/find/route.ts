// POST /api/portal/find — "Find a question" (SPEC-PORTAL-V2 §4, /app/find).
//
// A photo of a question ({imageBase64}, client-downscaled JPEG) or a typed one
// ({text}), plus the level family to search ({level}: EM|AM|JC|S1|S2, one of
// the student's own — lib/portal-find.resolveFindLevel). The bot extracts /
// embeds it (POST {BOT_BASE_URL}/api/portal-similar → { extractedText,
// matches }); the route then enriches every match from the bank's filing and
// applies THE tier rule (lib/portal-find.classifyFindCandidates — same topic
// AND same sub-skill, corroborated, marks within one; never "same chapter"):
//
//   · a similar bank question → straight onto the student's Practice list
//     (portal_assignments, source 'find', find_tier 'similar') →
//     { tier:'similar', assignmentId, question }
//   · nothing similar → { tier:null, findLogId, generate:{allowed, remaining,
//     message} } and the client continues to POST /api/portal/generate, which
//     writes a made-for-you question and lists it the same way.
//
// Every call logs ONE portal_generation_log row (the find ledger): the caps
// count rows (DAILY_FIND_CAP over every row, DAILY_GENERATE_CAP over
// generated=true), and the nightly find-review reads seed_text / tier /
// candidates back to judge how similar the match really was. Student session
// only — anonymous 401 is health-check-probed ('portal-find').
import { NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import {
  parseSimilarBody, normalizeMatches, resolveFindLevel, parseMarksFromText,
  subjectGateCandidates, classifyFindCandidates, candidateTopic,
  countFinderCallsToday, countGenerationsToday,
  DAILY_FIND_CAP, FIND_CAP_MESSAGE, DAILY_GENERATE_CAP, CAP_MESSAGE, NOT_AVAILABLE_MESSAGE,
  FIND_TIER_LABEL, type GenerationCountingClient,
} from '@/lib/portal-find';
import { allowedSubjects } from '@/lib/portal-subjects';
import { qbLevelsFor, bankScope } from '@/lib/qb-levels';
import { portalIdentity } from '@/lib/portal-auth';
import { requireActiveAccess } from '@/lib/portal-passes';
import {
  enrichCandidates, summarise, createFindAssignment, logFindRow, ledgerCandidates,
} from '@/lib/find-assign';

export const runtime = 'nodejs';
export const maxDuration = 60; // vision extraction + embedding match; generation is its own route

type Account = { id: string; airtable_student_id: string; level: string | null; subjects: string[] | null; is_ip: boolean | null };

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id, level, subjects, is_ip')
    .eq('id', user.id)
    .maybeSingle<Account>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const identity = portalIdentity(account); // rec… / acct:<uuid> — keys every row below

  // Vision extraction + embedding search cost model time — tuition rides free;
  // a stranger needs an active pass (402 → /app/pass otherwise).
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const admin = createServiceClient();
  const counting = admin as unknown as GenerationCountingClient;
  const used = await countFinderCallsToday(counting, identity);
  if (used >= DAILY_FIND_CAP) {
    return NextResponse.json({ error: FIND_CAP_MESSAGE }, { status: 429 });
  }

  const parsed = parseSimilarBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const ask = parsed.value;
  const level = resolveFindLevel(ask.level, account);

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) {
    return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 503 });
  }

  let bot: { extractedText?: unknown; matches?: unknown };
  try {
    const r = await fetch(`${botBase}/api/portal-similar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(ask.mode === 'photo' ? { imageBase64: ask.imageBase64, level } : { text: ask.text, level }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!r.ok) throw new Error(`bot HTTP ${r.status}`);
    bot = await r.json();
  } catch (e) {
    console.error('[portal-find] bot call failed:', e);
    // The call still spent model time (or tried to) — it counts against the brake.
    await logFindRow(admin, {
      identity, kind: ask.mode, qbHit: false, generated: false, questionId: null,
      seedText: ask.mode === 'search' ? ask.text : null, level, tier: null, assignmentId: null,
    });
    return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 502 });
  }

  const matches = normalizeMatches(bot.matches);
  const extractedText = typeof bot.extractedText === 'string' ? bot.extractedText.slice(0, 4000) : '';
  const seedText = (extractedText.trim() || (ask.mode === 'search' ? ask.text : '')).trim();

  // Enrich + judge. A read failure here must not eat the student's turn — it
  // degrades to "nothing similar" and the generate door.
  const viewer = {
    levels: qbLevelsFor(account.level, account.subjects).map((l) => bankScope(l.key).level),
    isIp: Boolean(account.is_ip),
  };
  let pool: unknown = null;
  let best: ReturnType<typeof summarise> | null = null;
  let topicHint: string | null = null;
  try {
    const { candidates, dropped } = await enrichCandidates(admin, matches, viewer);
    const gate = subjectGateCandidates(candidates, allowedSubjects(account));
    const verdict = classifyFindCandidates(gate.kept, { studentMarks: parseMarksFromText(seedText) });
    pool = ledgerCandidates({ candidates: gate.kept, verdicts: verdict.verdicts, reference: verdict.reference, dropped: [...dropped, ...gate.dropped] });
    best = verdict.similar[0] ? summarise(verdict.similar[0]) : null;
    topicHint = gate.kept[0] ? candidateTopic(gate.kept[0]) : null;
  } catch (e) {
    console.error('[portal-find] enrich/classify failed:', e);
  }

  if (best) {
    const assignmentId = await createFindAssignment(admin, { identity, question: best, level, tier: 'similar' });
    if (assignmentId) {
      const findLogId = await logFindRow(admin, {
        identity, kind: ask.mode, qbHit: matches.length > 0, generated: false, questionId: best.id,
        seedText, level, tier: 'similar', assignmentId, candidates: pool,
      });
      return NextResponse.json({
        tier: 'similar', label: FIND_TIER_LABEL.similar, assignmentId, findLogId, extractedText: seedText, question: best,
      });
    }
    // The Practice insert failed: fall through as "nothing similar" rather than
    // hand out a question the list does not know about.
  }

  const genUsed = await countGenerationsToday(counting, identity);
  const remaining = Math.max(0, DAILY_GENERATE_CAP - genUsed);
  const unreadable = !seedText;
  // +1: this call's own ledger row lands below, and the generate attempt will be one more.
  const allowed = !unreadable && remaining > 0 && used + 1 < DAILY_FIND_CAP;
  const findLogId = await logFindRow(admin, {
    identity, kind: ask.mode, qbHit: matches.length > 0, generated: false, questionId: null,
    seedText: seedText || null, level, tier: null, assignmentId: null, candidates: pool,
  });
  return NextResponse.json({
    tier: null,
    extractedText: seedText,
    findLogId,
    unreadable,
    topicHint,
    generate: {
      allowed,
      remaining,
      message: unreadable ? null : remaining <= 0 ? CAP_MESSAGE : allowed ? null : FIND_CAP_MESSAGE,
    },
  });
}
