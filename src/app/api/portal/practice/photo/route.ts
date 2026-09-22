// POST /api/portal/practice/photo — 📷 the Practice tab's photo page
// (SPEC-PRACTICE-PHOTO.md §3, 23 Sep 2026). Session-scoped.
//
//   { imageBase64 | text, level? }   (the finder's body shape, lib/portal-find parseSimilarBody)
//
// 1. the daily cap (DAILY_PRACTICE_PHOTO_CAP, counted on the finder ledger, tier 'practice-photo')
// 2. the bot files the photo under ONE sub-skill (POST /api/portal-classify — no embeddings)
// 3. a bank SEED filed under that sub-skill, servable to this student (lib/practice-photo pickSeed)
// 4. one `generation_requests` row (priority 1, intent_json) the bot's worker re-skins
// 5. a "Writing…" `portal_assignments` row on the student's list + one ledger row
//
// The done webhook (./done) flips the row when the worker has written the
// question. An unreadable or unfiled photo spends nothing.
import { NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { parseSimilarBody, resolveFindLevel, practiceEligibility, NOT_AVAILABLE_MESSAGE } from '@/lib/portal-find';
import { qbLevelsFor, bankScope } from '@/lib/qb-levels';
import { portalIdentity } from '@/lib/portal-auth';
import { requireActiveAccess } from '@/lib/portal-passes';
import { practicePhotoOpen } from '@/lib/portal-beta';
import { logFindRow } from '@/lib/find-assign';
import { questionServableTo, type SubgroupAudienceRow } from '@/lib/subgroup-visibility';
import {
  countPracticePhotosToday, parseClassification, pickSeed, buildPhotoRequest, writingTitle,
  DAILY_PRACTICE_PHOTO_CAP, PHOTO_CAP_MESSAGE, PHOTO_UNREADABLE_MESSAGE, PHOTO_UNFILED_MESSAGE,
  type PhotoCountingClient, type SeedCandidate,
} from '@/lib/practice-photo';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Account = { id: string; airtable_student_id: string; level: string | null; subjects: string[] | null; is_ip: boolean | null };

type SeedRow = SeedCandidate & {
  deleted_at: string | null; school: string | null; national: boolean | null; legacy_syllabus: boolean | null;
  flagged_count: number | null; verified: boolean | null; question_text: string | null; has_image: boolean | null;
  image_url: string | null; parts: unknown;
};

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
  const identity = portalIdentity(account);

  if (!(await practicePhotoOpen())) return NextResponse.json({ error: 'Not open yet' }, { status: 403 });
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const admin = createServiceClient();
  const used = await countPracticePhotosToday(admin as unknown as PhotoCountingClient, identity);
  if (used >= DAILY_PRACTICE_PHOTO_CAP) return NextResponse.json({ error: PHOTO_CAP_MESSAGE }, { status: 429 });

  const parsed = parseSimilarBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const ask = parsed.value;
  const level = resolveFindLevel(ask.level, account);

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 503 });

  let raw: unknown;
  try {
    const r = await fetch(`${botBase}/api/portal-classify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(ask.mode === 'photo' ? { imageBase64: ask.imageBase64, level } : { text: ask.text, level }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!r.ok) throw new Error(`bot HTTP ${r.status}`);
    raw = await r.json();
  } catch (e) {
    console.error('[practice-photo] classify failed:', e);
    return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 502 });
  }
  const c = parseClassification(raw);
  if (!c) return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 502 });
  if (!c.extractedText.trim() && ask.mode === 'photo') return NextResponse.json({ error: PHOTO_UNREADABLE_MESSAGE }, { status: 422 });
  if (!c.subgroup) {
    // Not filed: nothing is queued and the day is not spent, but the miss is on the ledger for the nightly review.
    await logFindRow(admin, { identity, kind: ask.mode, qbHit: false, generated: false, questionId: null, seedText: c.extractedText || (ask.mode === 'search' ? ask.text : null), level, tier: null, assignmentId: null, candidates: { practicePhoto: true, reason: c.reason } });
    return NextResponse.json({ error: PHOTO_UNFILED_MESSAGE }, { status: 422 });
  }
  const subgroup = c.subgroup;
  if (!c.extractedText.trim() && ask.mode === 'search') c.extractedText = ask.text;

  // ── The seed: a question already filed under this sub-skill that this student may see ──
  const viewer = {
    levels: qbLevelsFor(account.level, account.subjects).map(l => bankScope(l.key).level),
    isIp: Boolean(account.is_ip),
  };
  let seed: ReturnType<typeof pickSeed> = null;
  try {
    const { data: sg } = await admin.from('subgroups').select('level, visibility, ip_extra_level').eq('id', subgroup.id).maybeSingle<SubgroupAudienceRow>();
    if (sg && questionServableTo([sg], viewer)) {
      const { data: filings } = await admin
        .from('question_subgroups')
        .select('question_id, questions!inner(id, total_marks, difficulty, ai_generated, reported_at, deleted_at, school, national, legacy_syllabus, flagged_count, verified, question_text, has_image, image_url, parts)')
        .eq('subgroup_id', subgroup.id)
        .is('questions.deleted_at', null)
        .limit(400);
      const rows: SeedRow[] = [];
      for (const f of (filings ?? []) as unknown as { questions: SeedRow | SeedRow[] | null }[]) {
        const q = Array.isArray(f.questions) ? f.questions[0] : f.questions;
        if (q && practiceEligibility(q).ok) rows.push(q);
      }
      const { data: last } = await admin
        .from('generation_requests').select('source_question_id')
        .eq('portal_account_id', account.id).order('created_at', { ascending: false }).limit(1).maybeSingle<{ source_question_id: string | null }>();
      seed = pickSeed(rows, { marks: c.marks, avoidId: last?.source_question_id ?? null });
    }
  } catch (e) {
    console.error('[practice-photo] seed pick failed (writing from scratch):', (e as Error).message);
  }

  // ── The request + the Writing… row ──
  const request = buildPhotoRequest({ portalAccountId: account.id, classification: { ...c, subgroup }, seed });
  const { data: gr, error: grErr } = await admin.from('generation_requests').insert(request).select('id').single<{ id: string }>();
  if (grErr || !gr) {
    console.error('[practice-photo] request insert failed:', grErr?.message);
    return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 500 });
  }
  const title = writingTitle(subgroup);
  const { data: asg, error: asgErr } = await admin
    .from('portal_assignments')
    .insert({
      airtable_student_id: identity, kind: 'question', question_id: null, title, topic: subgroup.topic,
      level: level.slice(0, 20), tier: null, note: null, status: 'writing', source: 'practice-photo',
      generation_request_id: gr.id,
    })
    .select('id').single<{ id: string }>();
  if (asgErr || !asg) {
    console.error('[practice-photo] assignment insert failed:', asgErr?.message);
    await admin.from('generation_requests').update({ status: 'failed', error: 'assignment insert failed' }).eq('id', gr.id);
    return NextResponse.json({ error: NOT_AVAILABLE_MESSAGE }, { status: 500 });
  }
  // The ledger row the cap counts (tier 'practice-photo'). `generated` stays
  // false so the finder's own made-for-you cap (countGenerationsToday) is untouched.
  await logFindRow(admin, {
    identity, kind: ask.mode, qbHit: Boolean(seed), generated: false, questionId: seed?.id ?? null,
    seedText: request.source_text, level, tier: 'practice-photo', assignmentId: asg.id, generationRequestId: gr.id,
    candidates: { subgroup, confidence: c.confidence, marks: c.marks, figureExpected: c.figureExpected, seed },
  });

  return NextResponse.json({ ok: true, assignmentId: asg.id, title, reskin: Boolean(seed), remaining: Math.max(0, DAILY_PRACTICE_PHOTO_CAP - used - 1) });
}
