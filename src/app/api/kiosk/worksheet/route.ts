// GET /api/kiosk/worksheet?level=&topic=&count=8&answers=1
// Build a random worksheet from the verified practice-question bank for a
// level+topic. Returns question text (+ marks, + optional answer) ONLY — never
// the worked solution or any originating school/paper metadata.
// Auth: valid kiosk device cookie OR admin. 401 otherwise.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isKioskOpen } from '@/lib/kiosk-config';
import { verifyKioskAuth, KIOSK_LEVELS } from '@/lib/kiosk-session';
import { normalizeTier } from '@/lib/practice-tiers';
import { studentFromRequest } from '@/lib/kiosk-student';
import { dailyDraw, drawSeedKey } from '@/lib/kiosk-draw';
import { fetchWorksheetPool, SEED_LEVELS } from '@/lib/kiosk-pool';

export const runtime = 'nodejs';

const MAX_COUNT = 20;

// DETERMINISTIC daily draw — seeded shuffle over the FULL eligible pool, count
// slice last (lib/kiosk-draw, unit-tested there). Same SGT day + level + topic
// + tier → same sheet; counts extend one shared order; rotates at SGT midnight.

// The pool query, its eligibility gate and the SEED_LEVELS map live in
// lib/kiosk-pool — shared verbatim with the bot's /api/bot/worksheet so the two
// worksheet surfaces can never disagree on what is servable. Parts flattening +
// figure-path resolution live in lib/kiosk-worksheet-images (unit-tested).

export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!verifyAdminAuth(req) && !(await isKioskOpen())) {
    return NextResponse.json({ error: 'Kiosk closed', closed: true }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const level = params.get('level') || '';
  const topic = (params.get('topic') || '').trim();
  const withAnswers = params.get('answers') === '1';
  const withCard = params.get('card') === '1'; // Type A: prepend the topic revision card
  const tier = normalizeTier(params.get('tier'));  // basic|standard|advanced|null(=Mixed)
  const count = Math.min(MAX_COUNT, Math.max(1, parseInt(params.get('count') || '8', 10) || 8));

  const cfg = KIOSK_LEVELS[level];
  if (!cfg) return NextResponse.json({ error: 'unknown kiosk level' }, { status: 400 });
  if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 });

  // Hard-lock: students can only build worksheets for their own level (admin bypasses).
  if (!verifyAdminAuth(req)) {
    const student = studentFromRequest(req);
    if (!student) return NextResponse.json({ error: 'Scan to start', studentRequired: true }, { status: 401 });
    if (!student.entitlements.practice.includes(level)) {
      return NextResponse.json({ error: 'Not your level', forbidden: true }, { status: 403 });
    }
  }

  const supa = getSupabaseAdmin();

  // Pool = union of both servable sources:
  //  - `questions` (the generation worker's output + real bank): flatten parts,
  //    text-only or gate-5 verified figure, solved, not deleted. Carries a
  //    `difficulty` we can map to a tier.
  //  - `practice_questions` (the /revise pool): already flat, but has NO
  //    difficulty — so it's only servable when the tier filter is off (Mixed).
  const seedLevels = SEED_LEVELS[level] ?? cfg.questionLevels;
  // Pool comes from the kiosk_pool RPC via lib/kiosk-pool — the single source of
  // truth for servability. It UNIONs tag-match with sub-group-match (so
  // method-first cross-topic labels serve under the topic the picker counts them
  // in), gates on answer-presence (top-level OR parts), and accepts figures that
  // are either engine-drawn (figure_url) or watermark-scanned clean crops.
  // Ordered by id, so the deterministic daily draw is reproducible.
  const pool = await fetchWorksheetPool(supa, { seedLevels, topicsKey: cfg.topicsKey, topic, tier });
  if (pool.error) {
    return NextResponse.json({ error: pool.error }, { status: 500 });
  }
  // NO pool cap here: the whole answer-gated pool (≤400 rows from the RPC's
  // fetch cap) feeds the seeded shuffle. Capping before the shuffle starved
  // every row past the cap in id order — they could never print, on any day.

  const picked = dailyDraw(pool.items, drawSeedKey(level, topic, tier), count);
  const questions = picked.map((r) => ({
    id: r.id,
    markdown: r.markdown,
    marks: r.marks,
    figureUrl: r.figureUrl,
    imageUrls: r.imageUrls,
    ...(withAnswers ? { answer: r.answer } : {}),
  }));

  // Type A: attach the topic revision card (page 1 of the printed sheet).
  // Draft cards serve too — Adrian pilots the format before formally approving.
  let card: { title: string; contentMd: string; status: string } | null = null;
  if (withCard) {
    // Approved cards only — with the 2026-08-26 conversion pass the table now
    // holds 60 machine-drafted cards awaiting review; an unfiltered read would
    // print unreviewed drafts as page 1 of a student's worksheet.
    const cardRes = await supa.from('topic_cards')
      .select('title, content_md, status')
      .eq('level', level).eq('topic', topic)
      .eq('status', 'approved')
      .maybeSingle();
    if (cardRes.data) {
      card = { title: cardRes.data.title, contentMd: cardRes.data.content_md, status: cardRes.data.status };
    }
  }

  const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Mixed';
  return NextResponse.json({
    title: `${cfg.label} — ${topic} · ${tierLabel}`,
    level,
    topic,
    tier: tier ?? 'mixed',
    ...(withCard ? { card } : {}),
    questions,
  });
}
