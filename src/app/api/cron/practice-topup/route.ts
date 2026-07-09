// GET/POST /api/cron/practice-topup — keeps the kiosk/practice pools stocked.
// For each (level, topic) with fewer than TARGET verified practice questions,
// enqueues generation_requests (requested_by 'admin-topup' — within the Fly
// worker's allowed prefixes; each request runs the full 4-gate verification).
// Bounded per run so cost/wall-clock stay predictable; runs nightly via cron.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { TIERS, TIER_DIFFICULTY_VALUES } from '@/lib/practice-tiers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOPUP_LEVELS: Record<string, { seedLevels: string[]; poolLevels: string[] }> = {
  AM: { seedLevels: ['AM', 'S3_AM'], poolLevels: ['AM'] },
  // EM/JC join the pilot once AM proves out:
  // EM: { seedLevels: ['EM', 'S3_EM'], poolLevels: ['EM'] },
};
const TARGET_PER_TIER = 7;  // desired verified questions per (level, topic, tier)
const PER_TOPIC_CAP = 3;    // max requests enqueued per (topic, tier) per run
const MAX_ENQUEUE = 12;     // max requests enqueued per run (bounds nightly cost)
const QUEUE_BACKOFF = 15;
// Topics whose bank questions all carry diagrams but whose MATH is text-safe —
// these may seed from KB worked examples. Genuinely figure-dependent topics
// (Plane Geometry, Integration (Area)) stay curated-only until diagram
// generation exists.
const TEXT_FALLBACK_TOPICS = new Set(['Trigonometry (R-Formula)']);
// Out of the current syllabus — never generate for these.
const EXCLUDED_TOPICS = new Set(['Modulus Functions']);   // skip run if this many requests already waiting
// Topics whose questions are inherently graph-based: here the worker COMPUTES a
// matplotlib figure (vision-gated) for each generated question, so image-bearing
// bank questions are valid seeds and the request is tagged figure_mode:'graph'.
const GRAPH_TOPICS = new Set(['Integration (Area)', 'Coordinate Geometry', 'Linear Law', 'Trigonometry (Graphs)']);

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  if (process.env.ADMIN_PASSWORD && auth === `Bearer ${process.env.ADMIN_PASSWORD}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();

  // Backoff if the generation queue is already busy — never pile up.
  const { count: queued } = await supa
    .from('generation_requests')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'claimed']);
  if ((queued ?? 0) >= QUEUE_BACKOFF) {
    return NextResponse.json({ ok: true, skipped: `queue busy (${queued} waiting)` });
  }

  const report: { level: string; topic: string; tier: string; have: number; enqueued: number }[] = [];
  let budget = MAX_ENQUEUE - (queued ?? 0);

  for (const [level, cfg] of Object.entries(TOPUP_LEVELS)) {
    if (budget <= 0) break;
    const { data: topicRows } = await supa
      .from('subgroups').select('topic').eq('level', level);
    const topics = [...new Set((topicRows || []).map(r => r.topic as string))];

    for (const topic of topics) {
      if (EXCLUDED_TOPICS.has(topic)) continue;
      if (budget <= 0) break;
      const isGraph = GRAPH_TOPICS.has(topic);

      // Seed pool for this topic, shared across tiers — the seed only supplies
      // the skill/topic; the tier steers the generator to a harder/easier build.
      // Graph topics may seed from image-bearing questions (figure recomputed +
      // vision-gated); all other topics stay diagram-free.
      let seedQuery = supa
        .from('questions')
        .select('id')
        .in('level', cfg.seedLevels)
        .overlaps('topics', [topic])
        .is('deleted_at', null)
        .not('solution', 'is', null)
        .limit(30);
      if (!isGraph) seedQuery = seedQuery.eq('has_image', false);
      const { data: seeds } = await seedQuery;

      // A row-builder for `n` requests of a given tier — bank seeds if we have
      // them, else Adrian's ingested worked examples (TEXT_FALLBACK topics).
      let makeRows: ((n: number, tier: string) => Record<string, unknown>[]) | null = null;
      if (seeds?.length) {
        makeRows = (n, tier) => seeds.slice().sort(() => Math.random() - 0.5).slice(0, n).map(s => ({
          source_question_id: s.id,
          similarity_level: 'same-skills',
          count: 1,
          requested_by: 'admin-topup',
          status: 'pending',
          generated_ids: [] as string[],
          tier,
          ...(isGraph ? { figure_mode: 'graph' } : {}),
        }));
      } else if (TEXT_FALLBACK_TOPICS.has(topic)) {
        const { data: kb } = await supa
          .from('kb_entries')
          .select('content')
          .eq('subject', level).eq('topic', topic).eq('section_type', 'example')
          .not('is_current', 'is', false)
          .limit(20);
        const exs = (kb || []).filter(k => (k.content || '').length > 80);
        if (exs.length) {
          makeRows = (n, tier) => exs.slice().sort(() => Math.random() - 0.5).slice(0, n).map(k => ({
            source_text: (k.content as string).slice(0, 4000),
            similarity_level: 'same-skills',
            count: 1,
            requested_by: 'admin-topup',
            status: 'pending',
            generated_ids: [] as string[],
            tier,
          }));
        }
      }

      // Stock is now tracked per (level, topic, tier): count servable questions
      // whose difficulty maps to each tier, top up any tier below target.
      for (const tier of TIERS) {
        if (budget <= 0) break;
        const { count: have } = await supa
          .from('questions')
          .select('id', { count: 'exact', head: true })
          .in('level', cfg.seedLevels)
          .overlaps('topics', [topic])
          .is('deleted_at', null)
          .not('solution', 'is', null)
          .or('has_image.eq.false,figure_url.not.is.null')
          .in('difficulty', TIER_DIFFICULTY_VALUES[tier]);
        if ((have ?? 0) >= TARGET_PER_TIER) continue;
        if (!makeRows) { report.push({ level, topic, tier, have: have ?? 0, enqueued: 0 }); continue; }

        const need = Math.min(PER_TOPIC_CAP, TARGET_PER_TIER - (have ?? 0), budget);
        const rows = makeRows(need, tier);
        if (!rows.length) { report.push({ level, topic, tier, have: have ?? 0, enqueued: 0 }); continue; }
        const { error } = await supa.from('generation_requests').insert(rows);
        if (!error) {
          budget -= rows.length;
          report.push({ level, topic, tier, have: have ?? 0, enqueued: rows.length });
        }
      }
    }
  }

  const total = report.reduce((a, r) => a + r.enqueued, 0);
  return NextResponse.json({ ok: true, enqueued: total, lowTiers: report.filter(r => r.have < TARGET_PER_TIER) });
}

export const POST = GET;
