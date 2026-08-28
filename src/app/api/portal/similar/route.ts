// POST /api/portal/similar — "find me a question like this" for the practice tab.
//
// Two doors, one route: a photo of a question ({imageBase64} — client-downscaled
// ≤1600px JPEG) or a typed description ({text}). Either way the bot extracts /
// embeds it and answers with bank matches the student can practise straight away
// (`/app/practice?qid=…`). Student session ONLY (like /api/portal/assignments —
// anonymous 401 is health-check-probed); the student's account gates which QB
// level the bot searches (lib/portal-find.resolveQbLevel).
//
// The bot side (POST {BOT_BASE_URL}/api/portal-similar, Bearer
// BOT_INTERNAL_SECRET → { extractedText, matches:[{id, preview, topics,
// total_marks}] }) is being built in the bot repo to this contract — until it
// deploys, or whenever it's down, this degrades to a friendly 502/503, never a
// broken screen. Every call logs one `portal_generation_log` row (kind
// 'photo'|'search', qb_hit) — the same ledger the /generate cap counts.
import { NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import {
  parseSimilarBody, normalizeMatches, resolveQbLevel, NOT_AVAILABLE_MESSAGE,
  countFinderCallsToday, DAILY_FIND_CAP, FIND_CAP_MESSAGE,
  type GenerationCountingClient,
} from '@/lib/portal-find';
import { portalIdentity } from '@/lib/portal-auth';
import { requireActiveAccess } from '@/lib/portal-passes';

export const runtime = 'nodejs';
export const maxDuration = 60; // vision extraction + embedding match, not generation

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
  const identity = portalIdentity(account); // rec… / acct:<uuid> — keys the log

  // Vision extraction + embedding search cost model time — tuition rides free;
  // a stranger needs an active pass (402 → /app/pass otherwise).
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Daily finder cap (Phase G, 2026-08-28): /generate always had its 5/day
  // brake but /similar — vision extraction + embedding, model money per call —
  // had none. Counts every finder-ledger row today (similar hits, misses AND
  // generation attempts each log exactly one), bounding total finder spend.
  const used = await countFinderCallsToday(
    createServiceClient() as unknown as GenerationCountingClient,
    identity,
  );
  if (used >= DAILY_FIND_CAP) {
    return NextResponse.json({ error: FIND_CAP_MESSAGE }, { status: 429 });
  }

  const parsed = parseSimilarBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const ask = parsed.value;
  const level = resolveQbLevel(ask.level, account.level, account.subjects);

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) {
    return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 503 });
  }

  // One row per call, hit or miss — the /admin analytics read on this table
  // depends on misses being visible too. Best-effort: a logging hiccup must
  // never eat the student's matches.
  const log = async (qbHit: boolean) => {
    try {
      await createServiceClient().from('portal_generation_log').insert({
        airtable_student_id: identity,
        kind: ask.mode,
        qb_hit: qbHit,
        generated: false,
        question_id: null,
      });
    } catch (e) {
      console.error('[portal-similar] log failed:', e);
    }
  };

  try {
    const r = await fetch(`${botBase}/api/portal-similar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        ask.mode === 'photo' ? { imageBase64: ask.imageBase64, level } : { text: ask.text, level }
      ),
      signal: AbortSignal.timeout(50_000),
    });
    if (!r.ok) throw new Error(`bot HTTP ${r.status}`);
    const d = await r.json() as { extractedText?: unknown; matches?: unknown };
    const matches = normalizeMatches(d.matches);
    const extractedText = typeof d.extractedText === 'string' ? d.extractedText.slice(0, 4000) : '';
    await log(matches.length > 0);
    return NextResponse.json({ extractedText, matches });
  } catch (e) {
    console.error('[portal-similar] bot call failed:', e);
    await log(false);
    return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 502 });
  }
}
