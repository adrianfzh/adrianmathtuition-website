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
import type { SupabaseClient } from '@supabase/supabase-js';
import { photoReadsAllowed, PHOTO_READ_LIMIT_MESSAGE } from '@/lib/grade-limit';
import { countEventsToday, recordEvents } from '@/lib/model-call-ledger';
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
import { pickShelfTwin, seenQuestionIds, shelfLedgerNote, type ShelfTwin } from '@/lib/practice-shelf';
import { hasPartMarks } from '@/lib/part-syllabus';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Account = { id: string; airtable_student_id: string; level: string | null; subjects: string[] | null; is_ip: boolean | null };

type SeedRow = SeedCandidate & {
  deleted_at: string | null; school: string | null; national: boolean | null; legacy_syllabus: boolean | null;
  flagged_count: number | null; verified: boolean | null; question_text: string | null; has_image: boolean | null;
  image_url: string | null; parts: unknown;
};

const TWIN_COLS = 'id, twin_of, total_marks, difficulty, verified, school, exam_type, reported_at, deleted_at, ai_generated, national, legacy_syllabus, flagged_count, question_text, has_image, image_url, parts, answer, solution';

/** Verified twins filed under the sub-skill (the twin's own filing, else its source's), minus what this student has met. */
async function shelfTwinFor(admin: ReturnType<typeof createServiceClient>, subgroupId: number, identity: string, marks: number | null) {
  const byId = new Map<string, ShelfTwin>();
  const add = (q: (ShelfTwin & Record<string, unknown>) | null | undefined) => {
    if (q && q.school === 'AdrianMath' && q.exam_type === 'Twin' && practiceEligibility(q as never).ok) byId.set(q.id, q);
  };
  const { data: own } = await admin
    .from('question_subgroups')
    .select(`question_id, questions!inner(${TWIN_COLS})`)
    .eq('subgroup_id', subgroupId)
    .eq('questions.school', 'AdrianMath').eq('questions.exam_type', 'Twin').eq('questions.verified', true)
    .is('questions.deleted_at', null)
    .limit(400);
  const sourceIds: string[] = [];
  for (const f of (own ?? []) as unknown as { questions: (ShelfTwin & Record<string, unknown>) | (ShelfTwin & Record<string, unknown>)[] | null }[]) {
    add(Array.isArray(f.questions) ? f.questions[0] : f.questions);
  }
  // A twin that carries no filing of its own serves its source's sub-skill.
  const { data: src } = await admin.from('question_subgroups').select('question_id').eq('subgroup_id', subgroupId).limit(400);
  for (const r of (src ?? []) as { question_id: string }[]) sourceIds.push(r.question_id);
  if (sourceIds.length) {
    const { data: viaSource } = await admin.from('questions').select(TWIN_COLS)
      .in('twin_of', sourceIds).eq('school', 'AdrianMath').eq('exam_type', 'Twin').eq('verified', true).is('deleted_at', null).limit(400);
    for (const q of (viaSource ?? []) as unknown as (ShelfTwin & Record<string, unknown>)[]) add(q);
  }
  if (!byId.size) return null;
  const [{ data: asgs }, { data: atts }] = await Promise.all([
    admin.from('portal_assignments').select('question_id, status').eq('airtable_student_id', identity).not('question_id', 'is', null).limit(2000),
    admin.from('student_attempts').select('question_id').eq('airtable_student_id', identity).not('question_id', 'is', null).limit(5000),
  ]);
  const seen = seenQuestionIds((asgs ?? []) as never, (atts ?? []) as never);
  const pick = pickShelfTwin([...byId.values()], { marks, seenIds: seen, seedKey: identity });
  return pick ? { pick, size: byId.size } : null;
}

const intentTextForLedger = (t: string): string | null => (t.trim() ? t.trim().slice(0, 4000) : null);

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

  // Every read counts, whatever comes back (lib/grade-limit.ts, 5 Oct 2026).
  if (!photoReadsAllowed(await countEventsToday(admin as unknown as SupabaseClient, identity, 'photo:read'))) {
    return NextResponse.json({ error: PHOTO_READ_LIMIT_MESSAGE }, { status: 429 });
  }
  await recordEvents(admin as unknown as SupabaseClient, identity, 'photo:read', 1, { route: 'practice-photo' });

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
      // ── The shelf first (cost lever 5): a verified twin this student has not met ──
      const shelf = await shelfTwinFor(admin, subgroup.id, identity, c.marks);
      if (shelf) {
        const title = writingTitle(subgroup);
        const { data: asg, error: asgErr } = await admin
          .from('portal_assignments')
          .insert({
            airtable_student_id: identity, kind: 'question', question_id: shelf.pick.id, title, topic: subgroup.topic,
            level: level.slice(0, 20), tier: shelf.pick.tier, note: null, status: 'assigned', source: 'practice-photo',
            generation_request_id: null,
          })
          .select('id').single<{ id: string }>();
        if (!asgErr && asg) {
          await logFindRow(admin, {
            identity, kind: ask.mode, qbHit: true, generated: false, questionId: shelf.pick.id,
            seedText: intentTextForLedger(c.extractedText), level, tier: 'practice-photo', assignmentId: asg.id,
            candidates: { subgroup, confidence: c.confidence, marks: c.marks, figureExpected: c.figureExpected, ...shelfLedgerNote(shelf.pick, shelf.size) },
          });
          return NextResponse.json({ ok: true, assignmentId: asg.id, title, reskin: false, shelf: true, remaining: Math.max(0, DAILY_PRACTICE_PHOTO_CAP - used - 1) });
        }
        console.error('[practice-photo] shelf assignment insert failed (writing instead):', asgErr?.message);
      }
      const { data: filings } = await admin
        .from('question_subgroups')
        .select('question_id, questions!inner(id, total_marks, difficulty, ai_generated, reported_at, deleted_at, school, national, legacy_syllabus, flagged_count, verified, question_text, has_image, image_url, parts)')
        .eq('subgroup_id', subgroup.id)
        .is('questions.deleted_at', null)
        .limit(400);
      const rows: SeedRow[] = [];
      for (const f of (filings ?? []) as unknown as { questions: SeedRow | SeedRow[] | null }[]) {
        const q = Array.isArray(f.questions) ? f.questions[0] : f.questions;
        // A question with a part marked out of syllabus is never the model for a new one.
        if (q && practiceEligibility(q).ok && !hasPartMarks(q.parts)) rows.push(q);
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
